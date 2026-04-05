import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Bell, CheckCheck, CheckCircle2, Info, LoaderCircle, LogOut, Siren, Wifi, WifiOff, XCircle } from "lucide-react";
import { Sidebar } from "@/components/layout/sidebar";
import { Button } from "@/components/ui/button";
import { formatDateByLocale, localizeErrorMessage, localizeErrorScope, localizeNotificationType, t } from "@/lib/i18n";
import {
  ApiClientError,
  deleteMyTasks,
  getApiBaseUrl,
  getMyTasks,
  getNotifications,
  mapNotificationDto,
  markAllNotificationsAsRead,
  markNotificationAsRead
} from "@/lib/api";
import { useFlightData } from "@/hooks/useFlightData";
import { useLocaleStore } from "@/store/locale-store";
import { useFlightStore } from "@/store/flight-store";
import type {
  NotificationInfo,
  NotificationSocketPayload,
  SocketEvent,
  TaskInfo,
  TaskSocketPayload,
  UserBannedSocketPayload
} from "@/types/flight";

function toText(value: unknown, fallback = "-"): string {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return fallback;
}

function parseStompMessage(rawFrame: string): { command: string; body: string } | null {
  const frame = rawFrame.trim();
  if (!frame) {
    return null;
  }

  const sep = frame.indexOf("\n\n");
  if (sep < 0) {
    return { command: frame.split("\n")[0] ?? "", body: "" };
  }

  const header = frame.slice(0, sep);
  const body = frame.slice(sep + 2);
  const command = header.split("\n")[0] ?? "";
  return { command, body };
}

function toStompFrame(command: string, headers: Record<string, string>, body = ""): string {
  const headerLines = Object.entries(headers).map(([k, v]) => `${k}:${v}`);
  return [command, ...headerLines, "", body].join("\n") + "\0";
}

function normalizePath(value: string, fallback: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return fallback;
  }
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

function resolveWsEndpoint(): string {
  const wsPath = normalizePath((import.meta.env.VITE_WS_PATH as string | undefined) ?? "/ws", "/ws");
  const base = getApiBaseUrl();
  if (base) {
    if (/^https?:\/\//i.test(base)) {
      const url = new URL(base);
      url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
      url.pathname = wsPath;
      url.search = "";
      url.hash = "";
      return url.toString();
    }

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const prefix = normalizePath(base, "").replace(/\/$/, "");
    return `${protocol}//${window.location.host}${prefix}${wsPath}`;
  }

  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}${wsPath}`;
}

type AppShellProps = {
  children: ReactNode;
  onUserBanned: (payload: UserBannedSocketPayload) => void;
};

type WsState = "connecting" | "connected" | "reconnecting" | "offline";

function normalizeNotificationType(type: unknown): string {
  return typeof type === "string" ? type.toUpperCase() : "SYSTEM_NEWS";
}

function notificationTypeClass(type: unknown) {
  const normalized = normalizeNotificationType(type);
  if (normalized === "SYSTEM_ALERT" || normalized === "TASK_FAILED") {
    return "border-rose-400/30 bg-rose-500/10";
  }
  if (normalized === "TASK_COMPLETED") {
    return "border-zinc-300/25 bg-zinc-300/10";
  }
  return "border-zinc-400/25 bg-zinc-400/10";
}

function notificationTypeMeta(type: unknown) {
  const normalized = normalizeNotificationType(type);
  if (normalized === "SYSTEM_ALERT") {
    return { label: "System Alert", group: "Alerts", icon: Siren };
  }
  if (normalized === "TASK_FAILED") {
    return { label: "Task Failed", group: "Tasks", icon: XCircle };
  }
  if (normalized === "TASK_COMPLETED") {
    return { label: "Task Completed", group: "Tasks", icon: CheckCircle2 };
  }
  if (normalized === "SYSTEM_NEWS") {
    return { label: "System News", group: "News", icon: Info };
  }
  return { label: "Notification", group: "News", icon: Info };
}

export function AppShell({ children, onUserBanned }: AppShellProps) {
  const auth = useFlightStore((s) => s.auth);
  const currentTask = useFlightStore((s) => s.currentTask);
  const setCurrentTask = useFlightStore((s) => s.setCurrentTask);
  const setData = useFlightStore((s) => s.setData);
  const setMode = useFlightStore((s) => s.setMode);
  const setTaskStatus = useFlightStore((s) => s.setTaskStatus);
  const setError = useFlightStore((s) => s.setError);
  const error = useFlightStore((s) => s.error);
  const errorScope = useFlightStore((s) => s.errorScope);
  const logout = useFlightStore((s) => s.logout);
  const locale = useLocaleStore((s) => s.locale);
  const setLocale = useLocaleStore((s) => s.setLocale);
  const { selectTask } = useFlightData();

  const [tasks, setTasks] = useState<TaskInfo[]>([]);
  const [notifications, setNotifications] = useState<NotificationInfo[]>([]);
  const [openNotifications, setOpenNotifications] = useState(false);
  const [loadingPanel, setLoadingPanel] = useState(false);
  const [deletingTasks, setDeletingTasks] = useState(false);
  const [wsState, setWsState] = useState<WsState>("connecting");

  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const manualCloseRef = useRef(false);
  const currentTaskRef = useRef<TaskInfo | null>(null);
  const selectTaskRef = useRef(selectTask);
  const notificationsAnchorRef = useRef<HTMLDivElement | null>(null);
  const notificationsPanelRef = useRef<HTMLDivElement | null>(null);
  const [notificationsDropdownPos, setNotificationsDropdownPos] = useState({ top: 72, left: 16, width: 360 });

  const unreadCount = useMemo(
    () => notifications.reduce((acc, n) => acc + (n.isRead ? 0 : 1), 0),
    [notifications]
  );

  const groupedNotifications = useMemo(() => {
    const groups: Record<string, NotificationInfo[]> = { Alerts: [], Tasks: [], News: [] };
    for (const item of notifications) {
      const meta = notificationTypeMeta(item.type);
      groups[meta.group] = [...(groups[meta.group] ?? []), item];
    }
    return groups;
  }, [notifications]);

  useEffect(() => {
    currentTaskRef.current = currentTask;
  }, [currentTask]);

  useEffect(() => {
    selectTaskRef.current = selectTask;
  }, [selectTask]);

  useEffect(() => {
    if (!auth.isAuthenticated || !auth.token) {
      return;
    }

    let active = true;

    const refresh = async () => {
      try {
        if (active) {
          setLoadingPanel(true);
        }

        const [myTasks, myNotifications] = await Promise.all([
          getMyTasks({ token: auth.token, offset: 0, limit: 100 }),
          getNotifications({ token: auth.token })
        ]);

        if (!active) {
          return;
        }

        setTasks(myTasks);
        setNotifications(myNotifications.slice(0, 15));
      } catch (error) {
        if (!active) {
          return;
        }
        if (error instanceof ApiClientError && error.status === 401) {
          setError("Session expired. Please log in again.", "notifications");
        }
      } finally {
        if (active) {
          setLoadingPanel(false);
        }
      }
    };

    void refresh();

    return () => {
      active = false;
    };
  }, [auth.isAuthenticated, auth.token, setError]);

  useEffect(() => {
    if (!auth.isAuthenticated || !auth.token) {
      setWsState("offline");
      return;
    }

    manualCloseRef.current = false;

    const scheduleReconnect = () => {
      if (manualCloseRef.current) {
        return;
      }
      if (reconnectTimerRef.current !== null) {
        window.clearTimeout(reconnectTimerRef.current);
      }

      const attempt = reconnectAttemptsRef.current;
      const delayMs = Math.min(1000 * 2 ** attempt, 15000);
      reconnectAttemptsRef.current += 1;
      setWsState("reconnecting");

      reconnectTimerRef.current = window.setTimeout(() => {
        connectWs();
      }, delayMs);
    };

    const connectWs = () => {
      if (manualCloseRef.current) {
        return;
      }

      setWsState(reconnectAttemptsRef.current > 0 ? "reconnecting" : "connecting");
      const ws = new WebSocket(resolveWsEndpoint());
      socketRef.current = ws;

      ws.onopen = () => {
        ws.send(
          toStompFrame("CONNECT", {
            "accept-version": "1.2",
            host: window.location.host,
            Authorization: `Bearer ${auth.token}`
          })
        );
      };

      ws.onmessage = (event) => {
        const chunks = String(event.data).split("\0").filter(Boolean);

        for (const chunk of chunks) {
          const message = parseStompMessage(chunk);
          if (!message) {
            continue;
          }

          if (message.command === "CONNECTED") {
            reconnectAttemptsRef.current = 0;
            setWsState("connected");
            ws.send(
              toStompFrame("SUBSCRIBE", {
                id: "events-sub-0",
                destination: "/user/queue/events",
                ack: "auto"
              })
            );
            continue;
          }

          if (message.command !== "MESSAGE" || !message.body) {
            continue;
          }

          let envelope: SocketEvent | null = null;
          try {
            envelope = JSON.parse(message.body) as SocketEvent;
          } catch {
            envelope = null;
          }

          if (!envelope) {
            continue;
          }

          if (envelope.type === "TASK_STATUS_UPDATE") {
            const payload = envelope.payload as TaskSocketPayload;
            if (!payload?.taskId || !payload.taskStatus) {
              continue;
            }

            setTasks((prev) => {
              const idx = prev.findIndex((t) => t.id === payload.taskId);
              const nextTask: TaskInfo = {
                id: payload.taskId,
                title: payload.taskTitle || `Task #${payload.taskId}`,
                status: payload.taskStatus,
                errorMessage: payload.message ?? null
              };

              if (idx < 0) {
                return [nextTask, ...prev].slice(0, 10);
              }

              const next = [...prev];
              next[idx] = { ...next[idx], ...nextTask };
              return next;
            });

            if (currentTaskRef.current?.id === payload.taskId) {
              setTaskStatus(payload.taskStatus, payload.message ?? null);
              if (payload.taskStatus === "COMPLETED") {
                void selectTaskRef.current({
                  id: payload.taskId,
                  title: payload.taskTitle || currentTaskRef.current.title,
                  status: "COMPLETED"
                });
              }
            }
          }

          if (envelope.type === "NEW_NOTIFICATION") {
            const payload = envelope.payload as NotificationSocketPayload;
            const incoming = payload?.notification;
            if (!incoming) {
              continue;
            }

            const normalized = mapNotificationDto({
              id: incoming.id,
              type: incoming.type,
              content: incoming.content,
              recipientId: incoming.recipientId ?? null,
              senderId: incoming.senderId ?? null,
              senderName: incoming.senderName ?? null,
              referenceId: incoming.referenceId ?? null,
              isRead: incoming.isRead,
              createdAt: incoming.createdAt
            });

            setNotifications((prev) => {
              const rest = prev.filter((n) => n.id !== normalized.id);
              return [normalized, ...rest].slice(0, 15);
            });
          }

          if (envelope.type === "USER_BANNED") {
            const payload = envelope.payload as UserBannedSocketPayload;
            if (!payload?.userId) {
              continue;
            }
            onUserBanned(payload);
            manualCloseRef.current = true;
            socketRef.current?.close();
          }
        }
      };

      ws.onerror = () => {
        setError("Realtime connection issue. Trying to reconnect...", "realtime");
      };

      ws.onclose = () => {
        if (manualCloseRef.current) {
          setWsState("offline");
          return;
        }
        scheduleReconnect();
      };
    };

    connectWs();

    return () => {
      manualCloseRef.current = true;
      if (reconnectTimerRef.current !== null) {
        window.clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      socketRef.current?.close();
      socketRef.current = null;
      setWsState("offline");
    };
  }, [auth.isAuthenticated, auth.token, onUserBanned, setError, setTaskStatus]);

  const wsBadge = useMemo(() => {
    if (wsState === "connected") {
      return {
        icon: Wifi,
        label: t(locale, "ws.connected"),
        className: "text-zinc-100 border-zinc-300/35 bg-zinc-400/10"
      };
    }
    if (wsState === "reconnecting") {
      return {
        icon: LoaderCircle,
        label: t(locale, "ws.reconnecting"),
        className: "text-zinc-200 border-zinc-300/35 bg-zinc-400/10"
      };
    }
    return {
      icon: WifiOff,
      label: t(locale, "ws.offline"),
      className: "text-zinc-300 border-zinc-400/35 bg-zinc-500/10"
    };
  }, [locale, wsState]);

  const activeTaskId = currentTask?.id ?? null;

  async function handleTaskSelect(task: TaskInfo) {
    await selectTask(task);
  }

  async function handleDeleteTasks(taskIds: number[]) {
    if (!auth.token || taskIds.length === 0) {
      return;
    }

    setDeletingTasks(true);
    try {
      const result = await deleteMyTasks({ token: auth.token, taskIds });
      const deletedSet = new Set(result.deletedTaskIds);

      setTasks((prev) => prev.filter((task) => !deletedSet.has(task.id)));

      if (currentTaskRef.current && deletedSet.has(currentTaskRef.current.id)) {
        setCurrentTask(null);
        setData(null);
        setMode("tasks");
      }

      if (result.skippedTaskIds.length > 0) {
        setError(`Some tasks were skipped: ${result.skippedTaskIds.join(", ")}`, "tasks");
      }
    } catch (error) {
      if (error instanceof ApiClientError) {
        setError(error.message, "tasks");
      } else {
        setError("Failed to delete selected tasks", "tasks");
      }
    } finally {
      setDeletingTasks(false);
    }
  }

  async function handleMarkAsRead(notification: NotificationInfo) {
    if (!auth.token || notification.isRead) {
      return;
    }
    try {
      await markNotificationAsRead({ token: auth.token, id: notification.id });
      setNotifications((prev) =>
        prev.map((item) =>
          item.id === notification.id ? { ...item, isRead: true } : item
        )
      );
    } catch {
      setError("Failed to update notification state", "notifications");
    }
  }

  async function handleMarkAllAsRead() {
    if (!auth.token || unreadCount === 0) {
      return;
    }
    try {
      await markAllNotificationsAsRead({ token: auth.token });
      setNotifications((prev) => prev.map((item) => ({ ...item, isRead: true })));
    } catch {
      setError("Failed to mark notifications as read", "notifications");
    }
  }


  useEffect(() => {
    if (!openNotifications) {
      return;
    }

    const updatePosition = () => {
      const anchor = notificationsAnchorRef.current;
      if (!anchor) {
        return;
      }
      const rect = anchor.getBoundingClientRect();
      const width = Math.min(360, Math.max(280, window.innerWidth - 32));
      const left = Math.max(16, Math.min(window.innerWidth - width - 16, rect.right - width));
      const top = Math.round(rect.bottom + 8);
      setNotificationsDropdownPos({ top, left, width });
    };

    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpenNotifications(false);
      }
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    window.addEventListener("keydown", onEscape);

    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("keydown", onEscape);
    };
  }, [openNotifications]);

  const WsIcon = wsBadge.icon;
  const notificationsDropdown =
    openNotifications && typeof document !== "undefined"
      ? createPortal(
          <div className="fixed inset-0 z-40" onClick={() => setOpenNotifications(false)}>
            <div
              ref={notificationsPanelRef}
              className="surface-panel fixed z-50 max-h-[min(68vh,520px)] overflow-hidden rounded-lg p-3 shadow-2xl animate-rise"
              style={{ top: notificationsDropdownPos.top, left: notificationsDropdownPos.left, width: notificationsDropdownPos.width }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-3 flex items-center justify-between">
                <p className="text-sm font-semibold">{t(locale, "header.notifications")}</p>
                <Button variant="ghost" size="sm" type="button" onClick={() => void handleMarkAllAsRead()}>
                  <CheckCheck className="h-4 w-4" />
                  {t(locale, "header.markAll")}
                </Button>
              </div>

              <div className="max-h-72 space-y-3 overflow-auto pr-1">
                {notifications.length === 0 ? (
                  <p className="text-xs text-muted-foreground">{t(locale, "header.noNotifications")}</p>
                ) : (
                  Object.entries(groupedNotifications)
                    .filter(([, items]) => items.length > 0)
                    .map(([group, items]) => (
                      <div key={group} className="space-y-2">
                        <p className="px-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                          {group === "Alerts"
                            ? t(locale, "notif.group.alerts")
                            : group === "Tasks"
                            ? t(locale, "notif.group.tasks")
                            : t(locale, "notif.group.news")}
                        </p>
                        {items.map((notification) => {
                          const meta = notificationTypeMeta(notification.type);
                          const TypeIcon = meta.icon;
                          return (
                            <button
                              key={notification.id}
                              type="button"
                              className={`w-full rounded-md border p-2 text-left text-xs transition hover:border-zinc-300/45 hover:bg-zinc-200/10 ${notificationTypeClass(notification.type)} ${
                                notification.isRead
                                  ? "opacity-70 text-muted-foreground"
                                  : "text-foreground"
                              }`}
                              onClick={() => void handleMarkAsRead(notification)}
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex items-start gap-2">
                                  <TypeIcon className="mt-0.5 h-3.5 w-3.5" />
                                  <div>
                                    <p className="font-medium">{toText(notification.content, t(locale, "header.notifications"))}</p>
                                    <p className="mt-1 text-[11px] opacity-80">
                                      {toText(notification.senderName, "System")} • {formatDateByLocale(notification.createdAt, locale)}
                                    </p>
                                  </div>
                                </div>
                                <span className="rounded-full border border-border/60 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                                  {localizeNotificationType(notification.type, locale) || meta.label}
                                </span>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    ))
                )}
              </div>
            </div>
          </div>,
          document.body
        )
      : null;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b border-border/60 bg-background/85 backdrop-blur-2xl">
        <div className="flex items-center justify-between px-4 py-3 md:px-6">
          <div>
            <h1 className="text-base font-semibold tracking-wide text-foreground">{t(locale, "header.title")}</h1>
            <p className="text-xs text-muted-foreground">{t(locale, "header.subtitle")}</p>
            <p className="mt-1 text-[11px] text-muted-foreground">{t(locale, "header.user")}: <span className="font-semibold text-foreground">{auth.user?.username ?? "-"}</span></p>
            <div className={`mt-1 inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] ${wsBadge.className}`}>
              <WsIcon className={`h-3 w-3 ${wsState === "reconnecting" ? "animate-spin" : ""}`} />
              {wsBadge.label}
            </div>
          </div>

          <div className="relative flex items-center gap-2">
            <label className="flex items-center gap-2 rounded-md border border-border/70 bg-background/40 px-2 py-1 text-xs text-muted-foreground">
              <span className="hidden sm:inline">{t(locale, "header.locale")}</span>
              <select
                className="ui-select min-h-0 w-auto border-transparent bg-transparent py-1 pl-2 pr-6 text-foreground"
                value={locale}
                onChange={(e) => setLocale(e.target.value === "ru" ? "ru" : e.target.value === "uk" ? "uk" : "en")}
              >
                <option value="en">EN</option>
                <option value="ru">RU</option>
                <option value="uk">UK</option>
              </select>
            </label>

            <div ref={notificationsAnchorRef} className="relative">
              <Button variant="outline" size="sm" type="button" onClick={() => setOpenNotifications((v) => !v)}>
                <Bell className="h-4 w-4" />
                <span className="hidden md:inline">{t(locale, "header.notifications")}</span>
                {unreadCount > 0 ? (
                  <span className="rounded-full border border-zinc-300/40 bg-zinc-200 px-1.5 py-0.5 text-[10px] font-bold text-zinc-900">
                    {unreadCount}
                  </span>
                ) : null}
              </Button>
            </div>

            <Button variant="ghost" size="sm" onClick={logout}>
              <LogOut className="h-4 w-4" />
              <span className="hidden md:inline">{t(locale, "header.logout")}</span>
            </Button>

          </div>
        </div>
      </header>

      {notificationsDropdown}

      {error ? (
        <div className="mx-4 mt-3 rounded-xl border border-zinc-400/35 bg-zinc-500/10 px-4 py-3 text-sm text-zinc-100 md:mx-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              {errorScope ? (
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-300">{localizeErrorScope(errorScope, locale)}</p>
              ) : null}
              <p>{localizeErrorMessage(error, locale)}</p>
            </div>
            <button
              type="button"
              className="text-xs font-semibold uppercase tracking-wide text-zinc-300 transition hover:text-white"
              onClick={() => setError(null)}
            >
              {t(locale, "common.dismiss")}
            </button>
          </div>
        </div>
      ) : null}

      <div className="flex min-h-[calc(100vh-120px)] flex-col md:flex-row">
        <Sidebar
          tasks={tasks}
          activeTaskId={activeTaskId}
          loadingTasks={loadingPanel}
          deletingTasks={deletingTasks}
          onTaskSelect={handleTaskSelect}
          onDeleteTasks={handleDeleteTasks}
        />
        <main className="min-h-[calc(100vh-120px)] flex-1 p-4 md:p-6 lg:p-8">{children}</main>
      </div>

      <footer className="border-t border-border/60 bg-background/70 px-4 py-2 text-center text-xs text-muted-foreground md:px-6">
        {t(locale, "footer.tagline")} · {new Date().getFullYear()}
      </footer>
    </div>
  );
}

