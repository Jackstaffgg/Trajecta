import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Bell, CheckCheck, RefreshCw } from "lucide-react";
import { Sidebar } from "@/components/layout/sidebar";
import { Button } from "@/components/ui/button";
import {
  ApiClientError,
  getMyTasks,
  getNotifications,
  markAllNotificationsAsRead,
  markNotificationAsRead
} from "@/lib/api";
import { useFlightStore } from "@/store/flight-store";
import type { NotificationInfo, TaskInfo } from "@/types/flight";

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

type AppShellProps = {
  children: ReactNode;
};

export function AppShell({ children }: AppShellProps) {
  const auth = useFlightStore((s) => s.auth);
  const currentTask = useFlightStore((s) => s.currentTask);
  const setError = useFlightStore((s) => s.setError);

  const [tasks, setTasks] = useState<TaskInfo[]>([]);
  const [notifications, setNotifications] = useState<NotificationInfo[]>([]);
  const [openNotifications, setOpenNotifications] = useState(false);
  const [loadingPanel, setLoadingPanel] = useState(false);

  const unreadCount = useMemo(
    () => notifications.reduce((acc, n) => acc + (n.isRead ? 0 : 1), 0),
    [notifications]
  );

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
          getMyTasks({ token: auth.token, offset: 0, limit: 8 }),
          getNotifications({ token: auth.token })
        ]);

        if (!active) {
          return;
        }

        setTasks(myTasks);
        setNotifications(myNotifications.slice(0, 12));
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
    const intervalId = window.setInterval(() => {
      void refresh();
    }, 10000);

    return () => {
      active = false;
      window.clearInterval(intervalId);
    };
  }, [auth.isAuthenticated, auth.token, setError]);

  const activeTaskId = currentTask?.id ?? null;

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

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b border-border/70 bg-slate-950/70 backdrop-blur">
        <div className="mx-auto flex max-w-[1600px] items-center justify-between px-4 py-3 md:px-6">
          <div>
            <h1 className="text-base font-semibold tracking-wide text-cyan-200">Trajecta Control Panel</h1>
            <p className="text-xs text-muted-foreground">Telemetry analysis workspace</p>
          </div>

          <div className="relative">
            <Button variant="outline" size="sm" onClick={() => setOpenNotifications((v) => !v)}>
              <Bell className="h-4 w-4" />
              Notifications
              {unreadCount > 0 ? (
                <span className="rounded-full bg-cyan-500 px-1.5 py-0.5 text-[10px] font-bold text-slate-950">
                  {unreadCount}
                </span>
              ) : null}
            </Button>

            {openNotifications ? (
              <div className="absolute right-0 mt-2 w-[360px] rounded-lg border border-border bg-card/95 p-3 shadow-2xl">
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
                        className={`w-full rounded-md border p-2 text-left text-xs ${
                          notification.isRead
                            ? "border-border/50 bg-background/40 text-muted-foreground"
                            : "border-cyan-500/40 bg-cyan-500/10 text-foreground"
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
        <Sidebar tasks={tasks} activeTaskId={activeTaskId} loadingTasks={loadingPanel} />
        <main className="min-h-[calc(100vh-120px)] flex-1 p-4 md:p-6">{children}</main>
      </div>

      <footer className="border-t border-border/70 bg-slate-950/60 px-4 py-2 text-center text-xs text-muted-foreground md:px-6">
        Trajecta · Real-time flight analytics · {new Date().getFullYear()}
      </footer>
    </div>
  );
}


