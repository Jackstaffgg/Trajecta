export type FlightFrame = {
  t: number;
  lat: number;
  lon: number;
  alt: number;
  speed?: number;
  roll?: number;
  pitch?: number;
  yaw?: number;
  battery?: number;
  accelX?: number;
  accelY?: number;
  accelZ?: number;
  climbRate?: number;
};

export type FlightEvent = {
  id?: string;
  t: number;
  type: string;
  message?: string;
  lat?: number;
  lon?: number;
  alt?: number;
};

export type FlightMetrics = {
  maxAltitude?: number;
  maxSpeed?: number;
  flightDurationSec?: number;
  totalDistanceMeters?: number;
  maxVerticalSpeed?: number;
  imuRateHz?: number;
};

export type FlightMetadata = {
  logName?: string;
  vehicleType?: string;
  parserVersion?: string;
  gpsUnits?: string;
  source?: string;
  [key: string]: unknown;
};

export type FlightLogData = {
  metadata: FlightMetadata;
  frames: FlightFrame[];
  events: FlightEvent[];
  params: Record<string, string | number | boolean | null>;
  metrics: FlightMetrics;
};

export type ReplayCameraMode = "chase" | "fpv" | "free";

export type AnalysisMode =
  | "dashboard"
  | "replay"
  | "charts"
  | "params"
  | "diagnostics";
