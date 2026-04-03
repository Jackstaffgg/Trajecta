import { useMemo } from "react";
import { useFlightStore } from "@/store/flight-store";
import type { FlightLogData } from "@/types/flight";

export function normalizeFlightJson(raw: unknown): FlightLogData {
  const input = raw as Partial<FlightLogData>;
  return {
    metadata: input.metadata ?? {},
    frames: Array.isArray(input.frames) ? input.frames : [],
    events: Array.isArray(input.events) ? input.events : [],
    params: typeof input.params === "object" && input.params !== null ? input.params : {},
    metrics: input.metrics ?? {}
  };
}

export function useFlightData() {
  const data = useFlightStore((s) => s.data);
  const setData = useFlightStore((s) => s.setData);
  const loading = useFlightStore((s) => s.loading);
  const setLoading = useFlightStore((s) => s.setLoading);

  const maxTimeSec = useMemo(() => {
    const frames = data?.frames ?? [];
    if (!frames.length) {
      return 0;
    }
    return frames[frames.length - 1].t;
  }, [data]);

  async function loadFromFile(file: File) {
    setLoading(true);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const normalized = normalizeFlightJson(parsed);
      setData(normalized);
    } finally {
      setLoading(false);
    }
  }

  return {
    data,
    loading,
    maxTimeSec,
    loadFromFile,
    clear: () => setData(null)
  };
}
