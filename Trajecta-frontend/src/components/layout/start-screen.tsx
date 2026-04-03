import { useRef, useState } from "react";
import { UploadCloud, FileArchive } from "lucide-react";
import { useFlightData } from "@/hooks/useFlightData";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useFlightStore } from "@/store/flight-store";

export function StartScreen() {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [drag, setDrag] = useState(false);
  const [title, setTitle] = useState("Flight analysis");
  const { loadFromBin } = useFlightData();
  const currentTask = useFlightStore((s) => s.currentTask);
  const error = useFlightStore((s) => s.error);
  const setError = useFlightStore((s) => s.setError);

  async function handleFile(file: File) {
    if (!file.name.toLowerCase().endsWith(".bin")) {
      setError("Only .bin telemetry files are supported");
      return;
    }
    setError(null);
    await loadFromBin(file, title.trim() || file.name);
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-2xl">
        <CardHeader>
          <CardTitle className="text-xl">Start Flight Analysis</CardTitle>
          <p className="text-sm text-muted-foreground">
            Upload ArduPilot BIN log and wait for backend processing.
          </p>
        </CardHeader>
        <CardContent>
          <div className="mb-4 space-y-2">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Task title</p>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Flight #102 telemetry"
            />
          </div>
          <button
            className={`w-full rounded-xl border-2 border-dashed p-10 text-center transition ${
              drag
                ? "border-cyan-400 bg-cyan-400/10"
                : "border-border bg-background/60 hover:border-cyan-400/40"
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
              if (file) {
                void handleFile(file);
              }
            }}
          >
            <UploadCloud className="mx-auto mb-2 h-8 w-8 text-cyan-300" />
            <p className="text-sm font-semibold">Drag and drop flight log BIN</p>
            <p className="mt-1 text-xs text-muted-foreground">Backend accepts multipart upload with .bin extension</p>
            <div className="mt-4 inline-flex items-center gap-2 rounded-md bg-muted px-3 py-1 text-xs text-muted-foreground">
              <FileArchive className="h-3.5 w-3.5" />
              .bin
            </div>
          </button>
          {currentTask ? (
            <p className="mt-3 text-xs text-muted-foreground">
              Task #{currentTask.id}: {currentTask.status}
              {currentTask.errorMessage ? ` - ${currentTask.errorMessage}` : ""}
            </p>
          ) : null}
          {error ? <p className="mt-2 text-xs text-rose-300">{error}</p> : null}
          <input
            ref={inputRef}
            type="file"
            accept=".bin,application/octet-stream"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) {
                void handleFile(file);
              }
              e.currentTarget.value = "";
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
