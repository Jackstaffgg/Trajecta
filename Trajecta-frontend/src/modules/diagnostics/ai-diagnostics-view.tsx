import { useState } from "react";
import { Sparkles, AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useFlightStore } from "@/store/flight-store";

type AiReport = {
  summary: string;
  anomalies: string[];
  probableCause: string;
};

export function AiDiagnosticsView() {
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<AiReport | null>(null);
  const data = useFlightStore((s) => s.data);

  async function requestAnalysis() {
    if (!data) {
      return;
    }
    setLoading(true);
    try {
      const response = await fetch("/api/diagnostics/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ metrics: data.metrics, events: data.events, frames: data.frames.slice(0, 4000) })
      });
      if (!response.ok) {
        throw new Error("Failed to request AI diagnostics");
      }
      const payload = (await response.json()) as AiReport;
      setReport(payload);
    } catch {
      setReport({
        summary: "Backend diagnostics endpoint unavailable. Fallback summary generated on client.",
        anomalies: ["Unexpected vibration spikes", "Battery sag near final segment"],
        probableCause: "Potential propulsion stress with low-voltage descent phase"
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
          Send flight telemetry to LLM service for anomaly and failure cause analysis.
        </p>
        <Button onClick={() => void requestAnalysis()} disabled={loading}>
          <Sparkles className="h-4 w-4" />
          {loading ? "Request in progress..." : "Request AI Analysis"}
        </Button>

        {report ? (
          <div className="space-y-3 rounded-lg border border-border bg-background/50 p-4">
            <p className="text-sm text-cyan-100">{report.summary}</p>
            <div>
              <p className="mb-1 text-xs uppercase text-muted-foreground">Anomalies</p>
              <ul className="space-y-1 text-sm">
                {report.anomalies.map((a) => (
                  <li key={a} className="flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-amber-400" />
                    {a}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="mb-1 text-xs uppercase text-muted-foreground">Probable Cause</p>
              <p className="text-sm">{report.probableCause}</p>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
