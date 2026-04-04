import { useState } from "react";
import { Sparkles, AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useFlightStore } from "@/store/flight-store";
import { useFlightData } from "@/hooks/useFlightData";

type AiReport = {
  summary: string;
  anomalies: string[];
  probableCause: string;
};

export function AiDiagnosticsView() {
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<AiReport | null>(null);
  const data = useFlightStore((s) => s.data);
  const currentTask = useFlightStore((s) => s.currentTask);
  const error = useFlightStore((s) => s.error);
  const { requestAiConclusion } = useFlightData();

  function safeText(value: unknown, fallback = "") {
    if (typeof value === "string") return value;
    if (typeof value === "number" || typeof value === "boolean") return String(value);
    return fallback;
  }

  async function requestAnalysis() {
    if (!data || !currentTask) {
      return;
    }

    setLoading(true);
    try {
      const ok = await requestAiConclusion();
      if (!ok) {
        setReport({
          summary: "Failed to append AI conclusion to trajectory.",
          anomalies: ["Task or trajectory endpoint returned an error"],
          probableCause: "See backend error details"
        });
        return;
      }
      const latest = useFlightStore.getState().data;
      setReport({
        summary:
          latest?.aiConclusion ??
          "AI conclusion was appended to trajectory. Re-open this screen after load to see details.",
        anomalies: ["Conclusion attached to trajectory JSON"],
        probableCause: "Static backend conclusion"
      });
    } catch {
      setReport({
        summary: "Failed to append AI conclusion to trajectory.",
        anomalies: ["Task or trajectory endpoint returned an error"],
        probableCause: "See backend error details"
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>AI Diagnostics</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Trigger backend AI conclusion append on current task trajectory output.
        </p>
        {currentTask ? <p className="text-xs text-muted-foreground">Task #{currentTask.id}</p> : null}
        {error ? <p className="text-xs text-rose-300">{error}</p> : null}
        <Button onClick={() => void requestAnalysis()} disabled={loading || !currentTask || !data}>
          <Sparkles className="h-4 w-4" />
          {loading ? "Request in progress..." : "Append AI Conclusion"}
        </Button>

        {report ? (
          <div className="space-y-3 rounded-lg border border-border bg-background/50 p-4">
            <p className="text-sm text-foreground">{safeText(report.summary, "No summary")}</p>
            <div>
              <p className="mb-1 text-xs uppercase text-muted-foreground">Anomalies</p>
              <ul className="space-y-1 text-sm">
                {report.anomalies.map((a) => (
                  <li key={safeText(a, "anomaly")} className="flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-amber-400" />
                    {safeText(a, "Unknown anomaly")}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="mb-1 text-xs uppercase text-muted-foreground">Probable Cause</p>
              <p className="text-sm">{safeText(report.probableCause, "N/A")}</p>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
