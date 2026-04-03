import { useMemo } from "react";
import {
  ApiClientError,
  addAiConclusion,
  createTask,
  downloadTrajectory,
  getTask
} from "@/lib/api";
import { useFlightStore } from "@/store/flight-store";
import type { FlightLogData } from "@/types/flight";

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function asObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function normalizeWorkerTrajectory(raw: unknown): FlightLogData {
  const input = asObject(raw) ?? {};
  const framesRaw = Array.isArray(input.frames) ? input.frames : [];
  const eventsRaw = Array.isArray(input.events) ? input.events : [];
  const metricsRaw = asObject(input.metrics) ?? {};
  const metaRaw = asObject(input.meta) ?? {};
  const parsingRaw = asObject(metaRaw.parsing) ?? {};
  const messagesRaw = asObject(parsingRaw.messages) ?? {};
  const imuRaw = asObject(messagesRaw.imu) ?? {};

  const frames = framesRaw.map((frame): FlightLogData["frames"][number] => {
    const src = asObject(frame) ?? {};
    const pos = asObject(src.pos) ?? {};
    const att = asObject(src.att) ?? {};
    const imu = asObject(src.imu) ?? {};
    const accel = Array.isArray(imu.accel) ? imu.accel : [];

    return {
      t: asNumber(src.t) ?? 0,
      lat: asNumber(pos.lat) ?? 0,
      lon: asNumber(pos.lon) ?? 0,
      alt: asNumber(pos.alt) ?? 0,
      speed: asNumber(src.vel),
      roll: asNumber(att.roll),
      pitch: asNumber(att.pitch),
      yaw: asNumber(att.yaw),
      accelX: asNumber(accel[0]),
      accelY: asNumber(accel[1]),
      accelZ: asNumber(accel[2]),
      climbRate: asNumber(src.climbRate)
    };
  });

  const events = eventsRaw.map((event): FlightLogData["events"][number] => {
    const src = asObject(event) ?? {};
    return {
      t: asNumber(src.t) ?? 0,
      type: typeof src.type === "string" ? src.type : "EVENT",
      message: typeof src.value === "string" ? src.value : undefined
    };
  });

  return {
    metadata: {
      parserVersion: "trajecta-worker",
      source: "api",
      logName: typeof metaRaw.logName === "string" ? metaRaw.logName : undefined,
      imuSamplingHz: asNumber(imuRaw.samplingHz)
    },
    frames,
    events,
    params: asObject(input.params) as FlightLogData["params"] ?? {},
    metrics: {
      maxAltitude: asNumber(metricsRaw.maxAltitude),
      maxSpeed: asNumber(metricsRaw.maxSpeed) ?? asNumber(metricsRaw.maxHorizontalSpeed),
      flightDurationSec: asNumber(metricsRaw.flightDuration) ?? asNumber(metricsRaw.totalFlightDuration),
      totalDistanceMeters: asNumber(metricsRaw.distance) ?? asNumber(metricsRaw.totalDistance),
      maxVerticalSpeed: asNumber(metricsRaw.maxVerticalSpeed),
      imuRateHz: asNumber(imuRaw.samplingHz)
    },
    aiConclusion: typeof input.aiConclusion === "string" ? input.aiConclusion : undefined
  };
}

function apiErrorMessage(error: unknown): string {
  if (error instanceof ApiClientError) {
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "Unknown error";
}

function extractAiConclusionFromText(content: string): string | undefined {
  const marker = "AI Conclusion:";
  const idx = content.lastIndexOf(marker);
  if (idx < 0) {
    return undefined;
  }
  const value = content.slice(idx + marker.length).trim();
  return value || undefined;
}

function parseTrajectory(content: string): FlightLogData {
  try {
    return normalizeWorkerTrajectory(JSON.parse(content));
  } catch {
    return {
      metadata: { source: "api", parserVersion: "fallback" },
      frames: [],
      events: [],
      params: {},
      metrics: {},
      aiConclusion: extractAiConclusionFromText(content)
    };
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export function useFlightData() {
  const auth = useFlightStore((s) => s.auth);
  const data = useFlightStore((s) => s.data);
  const setData = useFlightStore((s) => s.setData);
  const loading = useFlightStore((s) => s.loading);
  const setLoading = useFlightStore((s) => s.setLoading);
  const setCurrentTask = useFlightStore((s) => s.setCurrentTask);
  const setTaskStatus = useFlightStore((s) => s.setTaskStatus);
  const setError = useFlightStore((s) => s.setError);
  const logout = useFlightStore((s) => s.logout);
  const currentTask = useFlightStore((s) => s.currentTask);

  const maxTimeSec = useMemo(() => {
    const frames = data?.frames ?? [];
    if (!frames.length) {
      return 0;
    }
    return frames[frames.length - 1].t;
  }, [data]);

  async function loadFromBin(file: File, title: string) {
    if (!auth.isAuthenticated || !auth.token) {
      setError("Authentication required");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const created = await createTask({ token: auth.token, file, title });
      setCurrentTask({ id: created.id, title: created.title, status: created.status });

      let attempts = 0;
      while (attempts < 180) {
        attempts += 1;
        const task = await getTask({ token: auth.token, taskId: created.id });
        setTaskStatus(task.status, task.errorMessage);

        if (task.status === "FAILED" || task.status === "CANCELLED") {
          throw new Error(task.errorMessage || `Task ended with status ${task.status}`);
        }

        if (task.status === "COMPLETED") {
          const trajectory = await downloadTrajectory({ token: auth.token, taskId: created.id });
          const normalized = parseTrajectory(trajectory);
          setData(normalized);
          return;
        }

        await sleep(1000);
      }

      throw new Error("Task processing timeout");
    } catch (error) {
      const message = apiErrorMessage(error);
      setError(message);
      if (error instanceof ApiClientError && error.status === 401) {
        logout();
      }
      return;
    } finally {
      setLoading(false);
    }
  }

  async function requestAiConclusion() {
    if (!auth.isAuthenticated || !auth.token || !currentTask) {
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await addAiConclusion({ token: auth.token, taskId: currentTask.id });
      const trajectory = await downloadTrajectory({ token: auth.token, taskId: currentTask.id });
      const normalized = parseTrajectory(trajectory);
      setData(normalized);
      return true;
    } catch (error) {
      const message = apiErrorMessage(error);
      setError(message);
      if (error instanceof ApiClientError && error.status === 401) {
        logout();
      }
      return false;
    } finally {
      setLoading(false);
    }
  }

  return {
    data,
    loading,
    maxTimeSec,
    loadFromBin,
    requestAiConclusion,
    clear: () => setData(null)
  };
}
