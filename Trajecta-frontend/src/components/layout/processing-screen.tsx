import { LoaderCircle } from "lucide-react";
import { useFlightStore } from "@/store/flight-store";

export function ProcessingScreen() {
  const task = useFlightStore((s) => s.currentTask);

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="rounded-xl border border-cyan-500/20 bg-card/90 px-8 py-6 text-center">
        <LoaderCircle className="mx-auto mb-3 h-8 w-8 animate-spin text-cyan-300" />
        <p className="text-sm font-medium">Processing flight log...</p>
        <p className="mt-1 text-xs text-muted-foreground">Java/Python pipeline is preparing telemetry JSON.</p>
        {task ? (
          <p className="mt-2 text-xs text-cyan-200">Task #{task.id}: {task.status}</p>
        ) : null}
      </div>
    </div>
  );
}
