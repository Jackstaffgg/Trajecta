import { useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, FileArchive, LoaderCircle, UploadCloud } from "lucide-react";
import { useFlightData } from "@/hooks/useFlightData";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { localizeTaskStatus, t } from "@/lib/i18n";
import { useLocaleStore } from "@/store/locale-store";
import { useFlightStore } from "@/store/flight-store";
import type { TaskStatus } from "@/types/flight";

function statusProgress(status: TaskStatus): number {
  if (status === "PENDING") return 22;
  if (status === "PROCESSING") return 64;
  if (status === "COMPLETED") return 100;
  if (status === "FAILED" || status === "CANCELLED") return 100;
  return 0;
}

export function StartScreen() {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [drag, setDrag] = useState(false);
  const [title, setTitle] = useState("Flight analysis");
  const { loadFromBinBatch } = useFlightData();
  const currentTask = useFlightStore((s) => s.currentTask);
  const loading = useFlightStore((s) => s.loading);
  const setError = useFlightStore((s) => s.setError);
  const locale = useLocaleStore((s) => s.locale);
  const [queueState, setQueueState] = useState<{
    running: boolean;
    total: number;
    submitted: number;
    failed: number;
    currentFileName: string;
  }>({ running: false, total: 0, submitted: 0, failed: 0, currentFileName: "" });

  function safeText(value: unknown, fallback = "") {
    if (typeof value === "string") return value;
    if (typeof value === "number" || typeof value === "boolean") return String(value);
    return fallback;
  }

  function uniqueFiles(files: File[]) {
    const seen = new Set<string>();
    const out: File[] = [];
    for (const file of files) {
      const key = `${file.name}:${file.size}:${file.lastModified}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      out.push(file);
    }
    return out;
  }

  async function handleFiles(files: File[]) {
    const deduped = uniqueFiles(files);
    const valid = deduped.filter((file) => file.name.toLowerCase().endsWith(".bin"));
    const skipped = deduped.length - valid.length;

    if (valid.length === 0) {
      setError("Only .bin telemetry files are supported", "tasks");
      return;
    }

    setError(null, "tasks");
    setQueueState({ running: true, total: valid.length, submitted: 0, failed: 0, currentFileName: "" });

    const result = await loadFromBinBatch(valid, title.trim(), (progress) => {
      setQueueState({
        running: true,
        total: progress.total,
        submitted: progress.submitted,
        failed: progress.failed,
        currentFileName: progress.currentFileName
      });
    });

    setQueueState({
      running: false,
      total: result.total,
      submitted: result.submitted,
      failed: result.failed.length,
      currentFileName: ""
    });

    if (skipped > 0) {
      setError(`Skipped ${skipped} non-bin file(s)`, "tasks");
    }
  }

  return (
    <div className="flex min-h-[60vh] items-center justify-center p-4">
      <Card className="w-full max-w-4xl border-white/10 bg-card/90">
        <CardHeader className="space-y-2">
          <p className="inline-flex w-fit items-center rounded-full border border-zinc-300/30 bg-zinc-300/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-200">
            Mission Upload
          </p>
          <CardTitle className="text-2xl">{t(locale, "tasks.startTitle")}</CardTitle>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {t(locale, "tasks.startSubtitle")}
          </p>
        </CardHeader>
        <CardContent>
          <div className="mb-4 space-y-2">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">{t(locale, "tasks.taskTitle")}</p>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Flight #102 telemetry"
            />
          </div>
          <button
            className={`group w-full rounded-2xl border-2 border-dashed p-10 text-center transition ${
              drag
                ? "border-accent/70 bg-accent/10"
                : "border-border/80 bg-background/40 hover:border-zinc-300/45 hover:bg-background/60"
            }`}
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDrag(true);
            }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDrag(false);
              const file = e.dataTransfer.files?.[0];
              const files = Array.from(e.dataTransfer.files ?? []);
              if (files.length > 0) {
                void handleFiles(files);
              }
            }}
          >
            <UploadCloud className="mx-auto mb-2 h-8 w-8 text-zinc-300 transition group-hover:scale-105" />
            <p className="text-base font-semibold">{t(locale, "tasks.dragTitle")}</p>
            <p className="mt-1 text-xs text-muted-foreground">{t(locale, "tasks.dragHintMulti")}</p>
            <div className="mt-4 inline-flex items-center gap-2 rounded-md bg-muted px-3 py-1 text-xs text-muted-foreground">
              <FileArchive className="h-3.5 w-3.5" />
              .bin
            </div>
          </button>

          {currentTask ? (
            <div className="animate-rise mt-4 rounded-xl border border-border/80 bg-background/35 p-4">
              <div className="mb-2 flex items-center justify-between text-xs">
                <p className="font-medium text-foreground">Task #{currentTask.id}</p>
                <p className="rounded-full border border-border/70 px-2 py-0.5 text-[10px] text-muted-foreground">{localizeTaskStatus(currentTask.status, locale)}</p>
              </div>
              <div className="progress-track">
                <div
                  className={`progress-bar ${currentTask.status === "FAILED" || currentTask.status === "CANCELLED" ? "progress-bar-danger" : ""}`}
                  style={{ width: `${statusProgress(currentTask.status)}%` }}
                />
              </div>
              <div className="mt-2 flex items-center gap-2 text-xs">
                {currentTask.status === "COMPLETED" ? (
                  <>
                    <CheckCircle2 className="h-4 w-4 text-emerald-300" />
                    <span className="text-emerald-200">{t(locale, "tasks.completedHint")}</span>
                  </>
                ) : currentTask.status === "FAILED" || currentTask.status === "CANCELLED" ? (
                  <>
                    <AlertTriangle className="h-4 w-4 text-rose-300" />
                    <span className="text-rose-200">{safeText(currentTask.errorMessage, "Task failed")}</span>
                  </>
                ) : (
                  <>
                    <LoaderCircle className="h-4 w-4 animate-spin text-zinc-300" />
                    <span className="text-foreground">{t(locale, "tasks.processingHint")}</span>
                  </>
                )}
              </div>
            </div>
          ) : null}

          {loading ? (
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted/80">
              <div className="h-full w-1/3 rounded-full bg-zinc-300 animate-shimmer" />
            </div>
          ) : null}

          {(queueState.running || queueState.total > 0) ? (
            <div className="mt-3 rounded-lg border border-border/70 bg-background/30 p-3 text-xs text-muted-foreground">
              <p>
                {t(locale, "tasks.batchProgress", {
                  submitted: queueState.submitted,
                  total: queueState.total,
                  failed: queueState.failed
                })}
              </p>
              {queueState.running && queueState.currentFileName ? (
                <p className="mt-1 text-[11px]">{t(locale, "tasks.batchCurrent", { file: queueState.currentFileName })}</p>
              ) : null}
            </div>
          ) : null}

          <input
            ref={inputRef}
            type="file"
            accept=".bin,application/octet-stream"
            multiple
            className="hidden"
            onChange={(e) => {
              const files = Array.from(e.target.files ?? []);
              if (files.length > 0) {
                void handleFiles(files);
              }
              e.currentTarget.value = "";
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
