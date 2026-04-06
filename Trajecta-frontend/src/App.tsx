import { useEffect, useState } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { AuthScreen } from "@/components/layout/auth-screen";
import { BannedScreen } from "@/components/layout/banned-screen";
import { LandingScreen } from "@/components/layout/landing-screen";
import { ProcessingScreen } from "@/components/layout/processing-screen";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DashboardView } from "@/modules/dashboard/dashboard-view";
import { FlightReplayView } from "@/modules/replay/flight-replay-view";
import { FlightChartsView } from "@/modules/charts/flight-charts-view";
import { ParamsTableView } from "@/modules/params/params-table-view";
import { AiDiagnosticsView } from "@/modules/diagnostics/ai-diagnostics-view";
import { StartScreen } from "@/components/layout/start-screen";
import { ProfileView } from "@/modules/profile/profile-view";
import { AdminDashboardView } from "@/modules/admin/admin-dashboard-view";
import { t } from "@/lib/i18n";
import { API_ERROR_CODES } from "@/lib/error-codes";
import { useFlightStore } from "@/store/flight-store";
import { useLocaleStore } from "@/store/locale-store";
import type { SocketEvent, UserBannedSocketPayload, UserUnbannedSocketPayload } from "@/types/flight";
import { ApiClientError, getApiBaseUrl, getCurrentUserBanStatus } from "@/lib/api";

type AnalyticsTab = "dashboard" | "replay" | "charts" | "params" | "diagnostics";

function parseStompMessage(rawFrame: string): { command: string; body: string } | null {
  const frame = rawFrame.trim();
  if (!frame) {
    return null;
  }
  const sep = frame.indexOf("\n\n");
  if (sep < 0) {
    return { command: frame.split("\n")[0] ?? "", body: "" };
  }
  return {
    command: frame.slice(0, sep).split("\n")[0] ?? "",
    body: frame.slice(sep + 2)
  };
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

function normalizeRole(role: string | null | undefined): string {
  if (!role) {
    return "";
  }
  return role.toUpperCase().replace(/^ROLE_/, "");
}

function AnalyticsWorkspace() {
  const locale = useLocaleStore((s) => s.locale);
  const [tab, setTab] = useState<AnalyticsTab>("dashboard");

  const tabs: Array<{ id: AnalyticsTab; label: string }> = [
    { id: "dashboard", label: t(locale, "app.analytics.dashboard") },
    { id: "replay", label: t(locale, "app.analytics.replay") },
    { id: "charts", label: t(locale, "app.analytics.charts") },
    { id: "params", label: t(locale, "app.analytics.params") },
    { id: "diagnostics", label: t(locale, "app.analytics.diagnostics") }
  ];

  return (
    <div className="space-y-4">
      <div className="surface-panel flex flex-wrap gap-2 rounded-xl p-2">
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`rounded-lg px-3 py-1.5 text-sm transition ${tab === item.id ? "bg-zinc-200 text-zinc-900" : "text-muted-foreground hover:text-foreground"}`}
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>
      {tab === "dashboard" ? <DashboardView /> : null}
      {tab === "replay" ? <FlightReplayView /> : null}
      {tab === "charts" ? <FlightChartsView /> : null}
      {tab === "params" ? <ParamsTableView /> : null}
      {tab === "diagnostics" ? <AiDiagnosticsView /> : null}
    </div>
  );
}

function NoTaskSelected() {
  const locale = useLocaleStore((s) => s.locale);
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t(locale, "app.noTask.title")}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          {t(locale, "app.noTask.subtitle")}
        </p>
      </CardContent>
    </Card>
  );
}

function MainContent() {
  const mode = useFlightStore((s) => s.mode);
  const data = useFlightStore((s) => s.data);
  const auth = useFlightStore((s) => s.auth);
  const selectedAdminUserId = useFlightStore((s) => s.adminSelectedUserId);
  const role = normalizeRole(auth.user?.role);
  const canAccessAdmin = role === "ADMIN" || role === "OWNER";

  if (mode === "tasks") {
    return <StartScreen />;
  }
  if (mode === "profile") {
    return <ProfileView />;
  }
  if (mode === "admin-users") {
    return canAccessAdmin ? <AdminDashboardView section="users" /> : <NoTaskSelected />;
  }
  if (mode === "admin-user") {
    if (!canAccessAdmin) {
      return <NoTaskSelected />;
    }
    return selectedAdminUserId ? <AdminDashboardView section="user" /> : <AdminDashboardView section="users" />;
  }
  if (mode === "admin-notifications") {
    return canAccessAdmin ? <AdminDashboardView section="notifications" /> : <NoTaskSelected />;
  }

  if (mode === "analytics" && !data) {
    return <NoTaskSelected />;
  }

  if (mode === "analytics") {
    return <AnalyticsWorkspace />;
  }

  return <NoTaskSelected />;
}

export default function App() {
  const auth = useFlightStore((s) => s.auth);
  const loading = useFlightStore((s) => s.loading);
  const logout = useFlightStore((s) => s.logout);
  const setError = useFlightStore((s) => s.setError);
  const locale = useLocaleStore((s) => s.locale);
  const [banPayload, setBanPayload] = useState<UserBannedSocketPayload | null>(null);
  const [entryView, setEntryView] = useState<"landing" | "auth" | "workspace">("landing");
  const [checkingBanStatus, setCheckingBanStatus] = useState(false);

  useEffect(() => {
    if (auth.isAuthenticated && entryView === "auth") {
      setEntryView("workspace");
    }
  }, [auth.isAuthenticated, entryView]);

  useEffect(() => {
    if (!auth.isAuthenticated || !auth.token) {
      setBanPayload(null);
      setCheckingBanStatus(false);
      return;
    }

    let active = true;
    const run = async () => {
      setCheckingBanStatus(true);
      try {
        const status = await getCurrentUserBanStatus({ token: auth.token });
        if (!active) {
          return;
        }
        if (!status) {
          setBanPayload(null);
          return;
        }
        setBanPayload({ ...status, userId: auth.user?.id ?? status.userId });
      } catch (error) {
        if (!active) {
          return;
        }
        if (error instanceof ApiClientError && error.status === 401) {
          logout();
          return;
        }
        if (error instanceof ApiClientError && error.code === API_ERROR_CODES.USER_BANNED) {
          setBanPayload({
            userId: auth.user?.id ?? 0,
            punishmentId: 0,
            reason: locale === "ru" ? "Доступ ограничен активной блокировкой" : "Access is restricted by an active ban",
            expiredAt: null,
            punishedById: 0,
            punishedByName: "System"
          });
          return;
        }
        setError(error instanceof Error ? error.message : (locale === "ru" ? "Не удалось проверить статус бана" : "Failed to verify ban status"), "realtime");
      } finally {
        if (active) {
          setCheckingBanStatus(false);
        }
      }
    };

    void run();
    return () => {
      active = false;
    };
  }, [auth.isAuthenticated, auth.token, auth.user?.id, locale, logout, setError]);

  useEffect(() => {
    if (!auth.isAuthenticated || !auth.token || !banPayload) {
      return;
    }

    let closed = false;
    const ws = new WebSocket(resolveWsEndpoint());

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
          ws.send(
            toStompFrame("SUBSCRIBE", {
              id: "events-sub-banned-0",
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

        if (!envelope || envelope.type !== "USER_UNBANNED") {
          continue;
        }

        const payload = envelope.payload as UserUnbannedSocketPayload;
        if (!payload?.userId || payload.userId !== (auth.user?.id ?? payload.userId)) {
          continue;
        }

        setBanPayload(null);
        setEntryView("workspace");
        ws.close();
      }
    };

    ws.onclose = () => {
      closed = true;
    };

    return () => {
      if (!closed) {
        ws.close();
      }
    };
  }, [auth.isAuthenticated, auth.token, auth.user?.id, banPayload]);

  if (!auth.isAuthenticated && entryView === "landing") {
    return (
      <LandingScreen
        isAuthenticated={false}
        username={auth.user?.username ?? undefined}
        onStart={() => setEntryView("auth")}
        onLogin={() => setEntryView("auth")}
      />
    );
  }

  if (!auth.isAuthenticated) {
    return <AuthScreen />;
  }

  if (checkingBanStatus) {
    return <ProcessingScreen />;
  }

  if (banPayload) {
    return <BannedScreen payload={banPayload} onLogout={() => {
      logout();
      setEntryView("landing");
    }} />;
  }

  if (entryView === "landing") {
    return (
      <LandingScreen
        isAuthenticated={true}
        username={auth.user?.username ?? undefined}
        onStart={() => setEntryView("workspace")}
        onLogin={() => setEntryView("workspace")}
      />
    );
  }

  return (
    <AppShell onUserBanned={setBanPayload} onGoHome={() => setEntryView("landing")}>
      {loading ? <ProcessingScreen /> : <MainContent />}
    </AppShell>
  );
}
