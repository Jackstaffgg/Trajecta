import { useMemo, useState } from "react";
import { RefreshCcw, Sparkles } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useFlightStore } from "@/store/flight-store";
import { useFlightData } from "@/hooks/useFlightData";

export function AiDiagnosticsView() {
  const [loadingAppend, setLoadingAppend] = useState(false);
  const [loadingRegenerate, setLoadingRegenerate] = useState(false);
  const data = useFlightStore((s) => s.data);
  const currentTask = useFlightStore((s) => s.currentTask);
  const error = useFlightStore((s) => s.error);
  const { requestAiConclusion } = useFlightData();

  const aiConclusion = useMemo(
    () => data?.aiConclusion ?? currentTask?.aiConclusion ?? undefined,
    [data?.aiConclusion, currentTask?.aiConclusion]
  );

  const aiModel = useMemo(
    () => data?.aiModel ?? currentTask?.aiModel ?? undefined,
    [data?.aiModel, currentTask?.aiModel]
  );

  function safeText(value: unknown, fallback = "") {
    if (typeof value === "string") return value;
    if (typeof value === "number" || typeof value === "boolean") return String(value);
    return fallback;
  }

  async function requestAnalysis(force: boolean) {
    if (!data || !currentTask) {
      return;
    }

    if (force) {
      setLoadingRegenerate(true);
    } else {
      setLoadingAppend(true);
    }
    try {
      await requestAiConclusion(force);
    } finally {
      if (force) {
        setLoadingRegenerate(false);
      } else {
        setLoadingAppend(false);
      }
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>AI Diagnostics</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Generate AI conclusion for the selected trajectory and review model metadata.
        </p>
        {currentTask ? <p className="text-xs text-muted-foreground">Task #{currentTask.id}</p> : null}
        {error ? <p className="text-xs text-rose-300">{error}</p> : null}
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() => void requestAnalysis(false)}
            disabled={loadingAppend || loadingRegenerate || !currentTask || !data}
          >
            <Sparkles className="h-4 w-4" />
            {loadingAppend ? "Request in progress..." : aiConclusion ? "Refresh AI Conclusion" : "Generate AI Conclusion"}
          </Button>
          <Button
            variant="outline"
            onClick={() => void requestAnalysis(true)}
            disabled={loadingAppend || loadingRegenerate || !currentTask || !data}
          >
            <RefreshCcw className="h-4 w-4" />
            {loadingRegenerate ? "Regenerating..." : "Force Regenerate"}
          </Button>
        </div>

        {aiModel ? (
          <p className="text-xs text-muted-foreground">
            Model: <span className="font-medium text-foreground">{safeText(aiModel, "UNKNOWN")}</span>
          </p>
        ) : null}

        {aiConclusion ? (
          <div className="rounded-lg border border-border bg-background/50 p-4">
            <p className="mb-1 text-xs uppercase text-muted-foreground">AI Conclusion</p>
            <p className="text-sm text-foreground">{safeText(aiConclusion, "No conclusion yet")}</p>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
