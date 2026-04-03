import { AppShell } from "@/components/layout/app-shell";
import { AuthScreen } from "@/components/layout/auth-screen";
import { StartScreen } from "@/components/layout/start-screen";
import { ProcessingScreen } from "@/components/layout/processing-screen";
import { DashboardView } from "@/modules/dashboard/dashboard-view";
import { FlightReplayView } from "@/modules/replay/flight-replay-view";
import { FlightChartsView } from "@/modules/charts/flight-charts-view";
import { ParamsTableView } from "@/modules/params/params-table-view";
import { AiDiagnosticsView } from "@/modules/diagnostics/ai-diagnostics-view";
import { useFlightStore } from "@/store/flight-store";

function MainContent() {
  const mode = useFlightStore((s) => s.mode);

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
  const data = useFlightStore((s) => s.data);
  const loading = useFlightStore((s) => s.loading);

  if (!auth.isAuthenticated) {
    return <AuthScreen />;
  }

  return (
    <AppShell>
      {loading ? <ProcessingScreen /> : !data ? <StartScreen /> : <MainContent />}
    </AppShell>
  );
}
