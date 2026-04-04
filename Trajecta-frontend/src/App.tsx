import { AppShell } from "@/components/layout/app-shell";
import { AuthScreen } from "@/components/layout/auth-screen";
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
import { useFlightStore } from "@/store/flight-store";

function NoTaskSelected() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Select task first</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          Pick a completed task in the sidebar to open analytics.
        </p>
      </CardContent>
    </Card>
  );
}

function MainContent() {
  const mode = useFlightStore((s) => s.mode);
  const data = useFlightStore((s) => s.data);
  const auth = useFlightStore((s) => s.auth);

  if (mode === "tasks") {
    return <StartScreen />;
  }
  if (mode === "profile") {
    return <ProfileView />;
  }
  if (mode === "admin") {
    return auth.user?.role?.toUpperCase() === "ADMIN" ? <AdminDashboardView /> : <NoTaskSelected />;
  }

  if (!data) {
    return <NoTaskSelected />;
  }

  if (mode === "dashboard") {
    return <DashboardView />;
  }
  if (mode === "replay") {
    return <FlightReplayView />;
  }
  if (mode === "charts") {
    return <FlightChartsView />;
  }
  if (mode === "params") {
    return <ParamsTableView />;
  }
  return <AiDiagnosticsView />;
}

export default function App() {
  const auth = useFlightStore((s) => s.auth);
  const loading = useFlightStore((s) => s.loading);

  if (!auth.isAuthenticated) {
    return <AuthScreen />;
  }

  return <AppShell>{loading ? <ProcessingScreen /> : <MainContent />}</AppShell>;
}
