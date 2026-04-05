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
import { useFlightStore } from "@/store/flight-store";
import { useLocaleStore } from "@/store/locale-store";
import type { UserBannedSocketPayload } from "@/types/flight";
import { ApiClientError, getCurrentUserBanStatus } from "@/lib/api";

type AnalyticsTab = "dashboard" | "replay" | "charts" | "params" | "diagnostics";

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
  const role = auth.user?.role?.toUpperCase();
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

  useEffect(() => {
    if (auth.isAuthenticated && entryView === "auth") {
      setEntryView("workspace");
    }
  }, [auth.isAuthenticated, entryView]);

  useEffect(() => {
    if (!auth.isAuthenticated || !auth.token) {
      return;
    }

    let active = true;
    const run = async () => {
      try {
        const status = await getCurrentUserBanStatus({ token: auth.token });
        if (!active || !status) {
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
        setError(error instanceof Error ? error.message : (locale === "ru" ? "Не удалось проверить статус бана" : "Failed to verify ban status"), "realtime");
      }
    };

    void run();
    return () => {
      active = false;
    };
  }, [auth.isAuthenticated, auth.token, auth.user?.id, locale, logout, setError]);

  if (entryView === "landing") {
    return (
      <LandingScreen
        isAuthenticated={auth.isAuthenticated}
        username={auth.user?.username ?? undefined}
        onStart={() => setEntryView(auth.isAuthenticated ? "workspace" : "auth")}
        onLogin={() => setEntryView("auth")}
      />
    );
  }

  if (!auth.isAuthenticated) {
    return <AuthScreen />;
  }

  if (banPayload) {
    return <BannedScreen payload={banPayload} onLogout={logout} />;
  }

  return (
    <AppShell onUserBanned={setBanPayload} onGoHome={() => setEntryView("landing")}>
      {loading ? <ProcessingScreen /> : <MainContent />}
    </AppShell>
  );
}
