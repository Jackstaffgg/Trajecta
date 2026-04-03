import { useRef, useState } from "react";
import { UploadCloud, FileJson } from "lucide-react";
import { useFlightData } from "@/hooks/useFlightData";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function StartScreen() {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [drag, setDrag] = useState(false);
  const { loadFromFile } = useFlightData();

  async function handleFile(file: File) {
    if (!file.name.endsWith(".json")) {
      return;
    }
    await loadFromFile(file);
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-2xl">
        <CardHeader>
          <CardTitle className="text-xl">Start Flight Analysis</CardTitle>
          <p className="text-sm text-muted-foreground">
            Drop parsed flight JSON or click zone to upload.
          </p>
        </CardHeader>
        <CardContent>
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
            <p className="text-sm font-semibold">Drag and drop flight log JSON</p>
            <p className="mt-1 text-xs text-muted-foreground">Expected keys: metadata, frames, events, params, metrics</p>
            <div className="mt-4 inline-flex items-center gap-2 rounded-md bg-muted px-3 py-1 text-xs text-muted-foreground">
              <FileJson className="h-3.5 w-3.5" />
              .json
            </div>
          </button>
          <input
            ref={inputRef}
            type="file"
            accept="application/json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) {
                void handleFile(file);
              }
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
