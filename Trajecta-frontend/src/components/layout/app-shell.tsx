import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Bell, CheckCheck, LoaderCircle, LogOut, Wifi, WifiOff } from "lucide-react";
import { Sidebar } from "@/components/layout/sidebar";
import { Button } from "@/components/ui/button";
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
import { useFlightStore } from "@/store/flight-store";
import type {
  NotificationInfo,
  NotificationSocketPayload,
  SocketEvent,
  TaskInfo,
  TaskSocketPayload
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

function formatTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "just now";
  }
  return date.toLocaleString();
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
};

type WsState = "connecting" | "connected" | "reconnecting" | "offline";

export function AppShell({ children }: AppShellProps) {
  const auth = useFlightStore((s) => s.auth);
  const currentTask = useFlightStore((s) => s.currentTask);
  const setCurrentTask = useFlightStore((s) => s.setCurrentTask);
  const setData = useFlightStore((s) => s.setData);
  const setMode = useFlightStore((s) => s.setMode);
  const setTaskStatus = useFlightStore((s) => s.setTaskStatus);
  const setError = useFlightStore((s) => s.setError);
  const logout = useFlightStore((s) => s.logout);
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

  const unreadCount = useMemo(
    () => notifications.reduce((acc, n) => acc + (n.isRead ? 0 : 1), 0),
    [notifications]
  );

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
          setError("Session expired. Please log in again.");
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
              recipientId: null,
              senderId: null,
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
        }
      };

      ws.onerror = () => {
        setError("Realtime connection issue. Trying to reconnect...");
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
  }, [auth.isAuthenticated, auth.token, setError, setTaskStatus]);

  const wsBadge = useMemo(() => {
    if (wsState === "connected") {
      return {
        icon: Wifi,
        label: "Realtime connected",
        className: "text-emerald-200 border-emerald-400/40 bg-emerald-500/10"
      };
    }
    if (wsState === "reconnecting") {
      return {
        icon: LoaderCircle,
        label: "Reconnecting",
        className: "text-amber-200 border-amber-400/40 bg-amber-500/10"
      };
    }
    return {
      icon: WifiOff,
      label: "Realtime offline",
      className: "text-rose-200 border-rose-400/40 bg-rose-500/10"
    };
  }, [wsState]);

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
        setError(`Some tasks were skipped: ${result.skippedTaskIds.join(", ")}`);
      }
    } catch (error) {
      if (error instanceof ApiClientError) {
        setError(error.message);
      } else {
        setError("Failed to delete selected tasks");
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
      setError("Failed to update notification state");
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
      setError("Failed to mark notifications as read");
    }
  }

  const WsIcon = wsBadge.icon;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b border-border/70 bg-card/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1600px] items-center justify-between px-4 py-3 md:px-6">
          <div>
            <h1 className="text-base font-semibold tracking-wide text-foreground">Trajecta Control Panel</h1>
            <p className="text-xs text-muted-foreground">Telemetry analysis workspace</p>
            <div className={`mt-1 inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] ${wsBadge.className}`}>
              <WsIcon className={`h-3 w-3 ${wsState === "reconnecting" ? "animate-spin" : ""}`} />
              {wsBadge.label}
            </div>
          </div>

          <div className="relative flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setOpenNotifications((v) => !v)}>
              <Bell className="h-4 w-4" />
              Notifications
              {unreadCount > 0 ? (
                <span className="rounded-full bg-accent px-1.5 py-0.5 text-[10px] font-bold text-slate-950">
                  {unreadCount}
                </span>
              ) : null}
            </Button>

            <Button variant="ghost" size="sm" onClick={logout}>
              <LogOut className="h-4 w-4" />
              Logout
            </Button>

            {openNotifications ? (
              <div className="surface-panel absolute right-0 top-9 mt-2 w-[360px] rounded-lg p-3 shadow-2xl animate-rise">
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-sm font-semibold">Notifications</p>
                  <Button variant="ghost" size="sm" onClick={() => void handleMarkAllAsRead()}>
                    <CheckCheck className="h-4 w-4" />
                    Mark all
                  </Button>
                </div>

                <div className="max-h-72 space-y-2 overflow-auto pr-1">
                  {notifications.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No notifications yet.</p>
                  ) : (
                    notifications.map((notification) => (
                      <button
                        key={notification.id}
                        className={`w-full rounded-md border p-2 text-left text-xs transition ${
                          notification.isRead
                            ? "border-border/50 bg-background/40 text-muted-foreground"
                            : "border-accent/40 bg-accent/10 text-foreground"
                        }`}
                        onClick={() => void handleMarkAsRead(notification)}
                      >
                        <p className="font-medium">{toText(notification.content, "Notification")}</p>
                        <p className="mt-1 text-[11px] opacity-80">
                          {toText(notification.senderName, "System")} • {formatTime(notification.createdAt)}
                        </p>
                      </button>
                    ))
                  )}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-[1600px] flex-col md:flex-row">
        <Sidebar
          tasks={tasks}
          activeTaskId={activeTaskId}
          loadingTasks={loadingPanel}
          deletingTasks={deletingTasks}
          onTaskSelect={handleTaskSelect}
          onDeleteTasks={handleDeleteTasks}
        />
        <main className="min-h-[calc(100vh-120px)] flex-1 p-4 md:p-6">{children}</main>
      </div>

      <footer className="border-t border-border/70 bg-card/70 px-4 py-2 text-center text-xs text-muted-foreground md:px-6">
        Trajecta · Real-time flight analytics · {new Date().getFullYear()}
      </footer>
    </div>
  );
}

