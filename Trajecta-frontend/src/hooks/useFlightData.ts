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

const MAX_REASONABLE_DRONE_SPEED_MPS = 120;

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function normalizeLat(raw: number | undefined): number | undefined {
  if (!isFiniteNumber(raw)) {
    return undefined;
  }
  const abs = Math.abs(raw);
  const normalized = abs > 180 ? raw / 1e7 : raw;
  if (Math.abs(normalized) > 90) {
    return undefined;
  }
  return normalized;
}

function normalizeLon(raw: number | undefined): number | undefined {
  if (!isFiniteNumber(raw)) {
    return undefined;
  }
  const abs = Math.abs(raw);
  const normalized = abs > 180 ? raw / 1e7 : raw;
  if (Math.abs(normalized) > 180) {
    return undefined;
  }
  return normalized;
}

function normalizeAltitudeMeters(raw: number | undefined): number | undefined {
  if (!isFiniteNumber(raw)) {
    return undefined;
  }
  const abs = Math.abs(raw);
  if (abs > 10000) {
    return raw / 100;
  }
  return raw;
}

function normalizeSpeedMps(raw: number | undefined): number | undefined {
  if (!isFiniteNumber(raw)) {
    return undefined;
  }
  const abs = Math.abs(raw);
  if (abs > MAX_REASONABLE_DRONE_SPEED_MPS) {
    return raw / 100;
  }
  return raw;
}

function computeDistanceMeters(frames: FlightLogData["frames"]): number {
  const radius = 6371000;
  let total = 0;
  for (let i = 1; i < frames.length; i += 1) {
    const a = frames[i - 1];
    const b = frames[i];
    if (!isFiniteNumber(a.lat) || !isFiniteNumber(a.lon) || !isFiniteNumber(b.lat) || !isFiniteNumber(b.lon)) {
      continue;
    }
    const phi1 = (a.lat * Math.PI) / 180;
    const phi2 = (b.lat * Math.PI) / 180;
    const dphi = ((b.lat - a.lat) * Math.PI) / 180;
    const dlambda = ((b.lon - a.lon) * Math.PI) / 180;
    const h =
      Math.sin(dphi / 2) * Math.sin(dphi / 2) +
      Math.cos(phi1) * Math.cos(phi2) * Math.sin(dlambda / 2) * Math.sin(dlambda / 2);
    total += 2 * radius * Math.asin(Math.min(1, Math.sqrt(h)));
  }
  return total;
}

function deriveMetrics(frames: FlightLogData["frames"], fallback: Record<string, unknown>) {
  const maxAltitude = frames.reduce((acc, f) => Math.max(acc, f.alt ?? Number.NEGATIVE_INFINITY), Number.NEGATIVE_INFINITY);
  const maxSpeed = frames.reduce((acc, f) => Math.max(acc, f.speed ?? Number.NEGATIVE_INFINITY), Number.NEGATIVE_INFINITY);
  const maxVerticalSpeed = frames.reduce(
    (acc, f) => Math.max(acc, Math.abs(f.climbRate ?? Number.NEGATIVE_INFINITY)),
    Number.NEGATIVE_INFINITY
  );

  const duration =
    frames.length > 1 ? Math.max(0, (frames[frames.length - 1].t ?? 0) - (frames[0].t ?? 0)) : 0;

  return {
    maxAltitude: Number.isFinite(maxAltitude) ? maxAltitude : asNumber(fallback.maxAltitude),
    maxSpeed: Number.isFinite(maxSpeed) ? maxSpeed : asNumber(fallback.maxSpeed),
    flightDurationSec:
      duration > 0
        ? duration
        : asNumber(fallback.flightDuration) ?? asNumber(fallback.totalFlightDuration),
    totalDistanceMeters: computeDistanceMeters(frames) || asNumber(fallback.distance) || asNumber(fallback.totalDistance),
    maxVerticalSpeed: Number.isFinite(maxVerticalSpeed) ? maxVerticalSpeed : asNumber(fallback.maxVerticalSpeed)
  };
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

  const frames = framesRaw.map((frame): FlightLogData["frames"][number] | null => {
    const src = asObject(frame) ?? {};
    const pos = asObject(src.pos) ?? {};
    const att = asObject(src.att) ?? {};
    const imu = asObject(src.imu) ?? {};
    const accel = Array.isArray(imu.accel) ? imu.accel : [];

    const lat = normalizeLat(asNumber(pos.lat));
    const lon = normalizeLon(asNumber(pos.lon));

    if (lat === undefined || lon === undefined) {
      return null;
    }

    return {
      t: asNumber(src.t) ?? 0,
      lat,
      lon,
      alt: normalizeAltitudeMeters(asNumber(pos.alt)) ?? 0,
      speed: normalizeSpeedMps(asNumber(src.vel)),
      roll: asNumber(att.roll),
      pitch: asNumber(att.pitch),
      yaw: asNumber(att.yaw),
      accelX: asNumber(accel[0]),
      accelY: asNumber(accel[1]),
      accelZ: asNumber(accel[2]),
      climbRate: normalizeSpeedMps(asNumber(src.climbRate))
    };
  }).filter((frame): frame is FlightLogData["frames"][number] => frame !== null);

  const events = eventsRaw.map((event): FlightLogData["events"][number] => {
    const src = asObject(event) ?? {};
    return {
      t: asNumber(src.t) ?? 0,
      type: typeof src.type === "string" ? src.type : "EVENT",
      message: typeof src.value === "string" ? src.value : undefined
    };
  });

  const derivedMetrics = deriveMetrics(frames, metricsRaw);

  return {
    metadata: {
      parserVersion: "trajecta-worker",
      source: "api",
      logName: typeof metaRaw.logName === "string" ? metaRaw.logName : undefined,
      imuSamplingHz: asNumber(imuRaw.samplingHz),
      gpsUnits: "deg/WGS84, m, m/s"
    },
    frames,
    events,
    params: asObject(input.params) as FlightLogData["params"] ?? {},
    metrics: {
      maxAltitude: derivedMetrics.maxAltitude,
      maxSpeed: derivedMetrics.maxSpeed,
      flightDurationSec: derivedMetrics.flightDurationSec,
      totalDistanceMeters: derivedMetrics.totalDistanceMeters,
      maxVerticalSpeed: derivedMetrics.maxVerticalSpeed,
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

  function handleRequestError(error: unknown) {
    const message = apiErrorMessage(error);
    setError(message);
    if (error instanceof ApiClientError && error.status === 401) {
      logout();
    }
  }

  async function loadTrajectoryForTask(taskId: number) {
    const trajectory = await downloadTrajectory({ token: auth.token, taskId });
    const normalized = parseTrajectory(trajectory);
    setData(normalized);
  }

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
          await loadTrajectoryForTask(created.id);
          return;
        }

        await sleep(1000);
      }

      throw new Error("Task processing timeout");
    } catch (error) {
      handleRequestError(error);
      return;
    } finally {
      setLoading(false);
    }
  }

  async function requestAiConclusion(): Promise<boolean> {
    if (!auth.isAuthenticated || !auth.token || !currentTask) {
      return false;
    }

    setLoading(true);
    setError(null);
    try {
      await addAiConclusion({ token: auth.token, taskId: currentTask.id });
      await loadTrajectoryForTask(currentTask.id);
      return true;
    } catch (error) {
      handleRequestError(error);
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
