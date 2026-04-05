import { useMemo } from "react";
import {
  ApiClientError,
  addAiConclusion,
  createTask,
  downloadTrajectory,
  getTask,
  regenerateAiConclusion
} from "@/lib/api";
import { useFlightStore } from "@/store/flight-store";
import type { FlightLogData, TaskInfo } from "@/types/flight";

const MAX_REASONABLE_SPEED_MPS = 80;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function asObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function isFiniteNumber(value: number | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

function haversineMeters(aLat: number, aLon: number, bLat: number, bLon: number) {
  const radius = 6371000;
  const dPhi = toRadians(bLat - aLat);
  const dLambda = toRadians(bLon - aLon);
  const phi1 = toRadians(aLat);
  const phi2 = toRadians(bLat);
  const h =
    Math.sin(dPhi / 2) ** 2 +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLambda / 2) ** 2;
  return 2 * radius * Math.asin(Math.min(1, Math.sqrt(h)));
}

function normalizeLat(raw: number | undefined): number | undefined {
  if (!isFiniteNumber(raw)) {
    return undefined;
  }
  const normalized = Math.abs(raw) > 180 ? raw / 1e7 : raw;
  return Math.abs(normalized) <= 90 ? normalized : undefined;
}

function normalizeLon(raw: number | undefined): number | undefined {
  if (!isFiniteNumber(raw)) {
    return undefined;
  }
  const normalized = Math.abs(raw) > 180 ? raw / 1e7 : raw;
  return Math.abs(normalized) <= 180 ? normalized : undefined;
}

function normalizeAltitude(raw: number | undefined): number | undefined {
  if (!isFiniteNumber(raw)) {
    return undefined;
  }
  return Math.abs(raw) > 10000 ? raw / 100 : raw;
}

function normalizeSpeed(raw: number | undefined): number | undefined {
  if (!isFiniteNumber(raw)) {
    return undefined;
  }
  return Math.abs(raw) > MAX_REASONABLE_SPEED_MPS ? raw / 100 : raw;
}

function isValidCoordinate(lat: number | undefined, lon: number | undefined): boolean {
  return isFiniteNumber(lat) && isFiniteNumber(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;
}

type RawFrame = Omit<FlightLogData["frames"][number], "lat" | "lon"> & {
  lat?: number;
  lon?: number;
};

function hasReplayCoordinates(frame: RawFrame): frame is RawFrame & { lat: number; lon: number } {
  return isFiniteNumber(frame.t) && isValidCoordinate(frame.lat, frame.lon);
}

function filterKinematicOutliers(
  frames: Array<RawFrame & { lat: number; lon: number }>
): Array<RawFrame & { lat: number; lon: number }> {
  if (frames.length <= 2) {
    return frames;
  }

  const out: Array<RawFrame & { lat: number; lon: number }> = [frames[0]];
  let prevAccepted = frames[0];
  for (let i = 1; i < frames.length; i += 1) {
    const current = frames[i];
    const dt = Math.max(1e-3, (current.t ?? 0) - (prevAccepted.t ?? 0));
    const dist = haversineMeters(prevAccepted.lat ?? 0, prevAccepted.lon ?? 0, current.lat ?? 0, current.lon ?? 0);
    const impliedSpeed = dist / dt;

    // Keep the last accepted anchor so a single spike does not poison all next points.
    if (impliedSpeed > MAX_REASONABLE_SPEED_MPS * 2.5) {
      continue;
    }
    out.push(current);
    prevAccepted = current;
  }

  return out;
}

function deriveMetrics(frames: FlightLogData["frames"]) {
  if (!frames.length) {
    return {
      maxAltitude: undefined,
      maxSpeed: undefined,
      flightDurationSec: 0,
      totalDistanceMeters: 0,
      maxVerticalSpeed: undefined
    };
  }

  let distance = 0;
  let maxSpeed = 0;
  let maxVertical = 0;
  let maxAltitude = frames[0].alt;

  for (let i = 1; i < frames.length; i += 1) {
    const a = frames[i - 1];
    const b = frames[i];
    const dt = Math.max(1e-3, b.t - a.t);
    const segment = haversineMeters(a.lat, a.lon, b.lat, b.lon);
    const speedFromTrack = segment / dt;
    if (speedFromTrack <= MAX_REASONABLE_SPEED_MPS * 2) {
      distance += segment;
      maxSpeed = Math.max(maxSpeed, speedFromTrack);
    }

    if (isFiniteNumber(b.speed)) {
      maxSpeed = Math.max(maxSpeed, clamp(b.speed, -MAX_REASONABLE_SPEED_MPS * 2, MAX_REASONABLE_SPEED_MPS * 2));
    }
    if (isFiniteNumber(b.climbRate)) {
      maxVertical = Math.max(maxVertical, Math.abs(b.climbRate));
    } else {
      const verticalFromAlt = Math.abs((b.alt - a.alt) / dt);
      if (Number.isFinite(verticalFromAlt)) {
        maxVertical = Math.max(maxVertical, verticalFromAlt);
      }
    }
    maxAltitude = Math.max(maxAltitude, b.alt);
  }

  return {
    maxAltitude,
    maxSpeed,
    flightDurationSec: Math.max(0, frames[frames.length - 1].t - frames[0].t),
    totalDistanceMeters: distance,
    maxVerticalSpeed: maxVertical
  };
}

function normalizeMetrics(
  input: Record<string, unknown> | null,
  fallback: ReturnType<typeof deriveMetrics>,
  imuRateHzFallback?: number
) {
  const maxAltitude = asNumber(input?.maxAltitude) ?? fallback.maxAltitude;
  const maxSpeed =
    asNumber(input?.maxSpeed) ??
    asNumber(input?.maxHorizontalSpeed) ??
    fallback.maxSpeed;
  const flightDurationSec =
    asNumber(input?.flightDuration) ??
    asNumber(input?.flightDurationSec) ??
    asNumber(input?.totalFlightDuration) ??
    fallback.flightDurationSec;
  const totalDistanceMeters =
    asNumber(input?.distance) ??
    asNumber(input?.totalDistance) ??
    asNumber(input?.totalDistanceMeters) ??
    fallback.totalDistanceMeters;
  const maxVerticalSpeed =
    asNumber(input?.maxVerticalSpeed) ??
    asNumber(input?.maxClimbRate) ??
    fallback.maxVerticalSpeed;
  const imuRateHz =
    asNumber(input?.imuRateHz) ??
    asNumber(input?.imuSamplingHz) ??
    imuRateHzFallback;

  return {
    maxAltitude,
    maxSpeed,
    flightDurationSec,
    totalDistanceMeters,
    maxVerticalSpeed,
    imuRateHz
  };
}

function normalizeWorkerTrajectory(raw: unknown): FlightLogData {
  const input = asObject(raw) ?? {};
  const framesRaw = Array.isArray(input.frames) ? input.frames : [];
  const eventsRaw = Array.isArray(input.events) ? input.events : [];
  const metaRaw = asObject(input.meta) ?? {};
  const parsingRaw = asObject(metaRaw.parsing) ?? {};
  const messagesRaw = asObject(parsingRaw.messages) ?? {};
  const imuRaw = asObject(messagesRaw.imu) ?? {};
  const metricsRaw = asObject(input.metrics);

  const parsedFrames = framesRaw.map((frame): RawFrame => {
    const src = asObject(frame) ?? {};
    const pos = asObject(src.pos) ?? {};
    const att = asObject(src.att) ?? {};
    const imu = asObject(src.imu) ?? {};
    const accel = Array.isArray(imu.accel) ? imu.accel : [];

    return {
      t: asNumber(src.t) ?? Number.NaN,
      lat: normalizeLat(asNumber(pos.lat)),
      lon: normalizeLon(asNumber(pos.lon)),
      alt: normalizeAltitude(asNumber(pos.alt)) ?? 0,
      speed: normalizeSpeed(asNumber(src.vel)),
      battery: asNumber(src.battery),
      roll: asNumber(att.roll),
      pitch: asNumber(att.pitch),
      yaw: asNumber(att.yaw),
      accelX: asNumber(accel[0]),
      accelY: asNumber(accel[1]),
      accelZ: asNumber(accel[2]),
      climbRate: normalizeSpeed(asNumber(src.climbRate))
    };
  });

  const validFrames = filterKinematicOutliers(
    parsedFrames
    .filter(hasReplayCoordinates)
    .sort((a, b) => a.t - b.t)
  );

  const t0 = validFrames[0]?.t ?? 0;
  const frames: FlightLogData["frames"] = validFrames.map((frame, index, arr) => {
    const base = frame.t - t0;
    const prev = index > 0 ? arr[index - 1].t - t0 : -1;
    const t = base <= prev ? prev + 1e-3 : base;
    return {
      ...frame,
      t
    };
  });

  const events = eventsRaw.map((event): FlightLogData["events"][number] => {
    const src = asObject(event) ?? {};
    const rawT = asNumber(src.t);
    const description = typeof src.description === "string" ? src.description : undefined;
    const fallbackValue =
      typeof src.value === "string" ||
      typeof src.value === "number" ||
      typeof src.value === "boolean" ||
      src.value === null
        ? src.value
        : undefined;
    return {
      t: isFiniteNumber(rawT) ? Math.max(0, rawT - t0) : 0,
      type: typeof src.type === "string" ? src.type : "EVENT",
      eventId: asNumber(src.eventId),
      code: typeof src.code === "string" ? src.code : undefined,
      severity: typeof src.severity === "string" ? src.severity : undefined,
      message: description ?? (typeof fallbackValue === "string" ? fallbackValue : undefined),
      value: fallbackValue
    };
  });

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
    metrics: normalizeMetrics(metricsRaw, deriveMetrics(frames), asNumber(imuRaw.samplingHz)),
    aiConclusion: typeof input.aiConclusion === "string" ? input.aiConclusion : undefined,
    aiModel: typeof input.aiModel === "string" ? input.aiModel : undefined
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

export function useFlightData() {
  const auth = useFlightStore((s) => s.auth);
  const data = useFlightStore((s) => s.data);
  const setData = useFlightStore((s) => s.setData);
  const loading = useFlightStore((s) => s.loading);
  const setLoading = useFlightStore((s) => s.setLoading);
  const setCurrentTask = useFlightStore((s) => s.setCurrentTask);
  const setTaskStatus = useFlightStore((s) => s.setTaskStatus);
  const setError = useFlightStore((s) => s.setError);
  const setMode = useFlightStore((s) => s.setMode);
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
      setError("Authentication required", "tasks");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const created = await createTask({ token: auth.token, file, title });
      setCurrentTask({ id: created.id, title: created.title, status: created.status });
      setTaskStatus(created.status);
      setData(null);
      setMode("tasks");
      return created;
    } catch (error) {
      const message = apiErrorMessage(error);
      setError(message, "tasks");
      if (error instanceof ApiClientError && error.status === 401) {
        logout();
      }
      return;
    } finally {
      setLoading(false);
    }
  }

  async function selectTask(task: TaskInfo) {
    if (!auth.isAuthenticated || !auth.token) {
      setError("Authentication required", "tasks");
      return false;
    }

    setCurrentTask(task);
    setTaskStatus(task.status, task.errorMessage);

    if (task.status !== "COMPLETED") {
      setData(null);
      setMode("tasks");
      return true;
    }

    setLoading(true);
    setError(null);
    try {
      const freshTask = await getTask({ token: auth.token, taskId: task.id });
      setCurrentTask(freshTask);
      setTaskStatus(freshTask.status, freshTask.errorMessage);

      const trajectory = await downloadTrajectory({ token: auth.token, taskId: task.id });
      const normalized = parseTrajectory(trajectory);
      normalized.aiConclusion = normalized.aiConclusion ?? freshTask.aiConclusion ?? undefined;
      normalized.aiModel = normalized.aiModel ?? freshTask.aiModel ?? undefined;
      setData(normalized);
      setMode("analytics");
      return true;
    } catch (error) {
      const message = apiErrorMessage(error);
      setError(message, "tasks");
      if (error instanceof ApiClientError && error.status === 401) {
        logout();
      }
      return false;
    } finally {
      setLoading(false);
    }
  }

  async function requestAiConclusion(force = false) {
    if (!auth.isAuthenticated || !auth.token || !currentTask) {
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const task = force
        ? await regenerateAiConclusion({ token: auth.token, taskId: currentTask.id })
        : await addAiConclusion({ token: auth.token, taskId: currentTask.id });

      setCurrentTask(task);
      setTaskStatus(task.status, task.errorMessage);

      const trajectory = await downloadTrajectory({ token: auth.token, taskId: currentTask.id });
      const normalized = parseTrajectory(trajectory);
      normalized.aiConclusion = normalized.aiConclusion ?? task.aiConclusion ?? undefined;
      normalized.aiModel = normalized.aiModel ?? task.aiModel ?? undefined;
      setData(normalized);
      return true;
    } catch (error) {
      const message = apiErrorMessage(error);
      setError(message, "tasks");
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
    selectTask,
    requestAiConclusion,
    clear: () => setData(null)
  };
}
