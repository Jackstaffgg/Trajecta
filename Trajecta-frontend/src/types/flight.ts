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
  eventId?: number;
  t: number;
  type: string;
  code?: string;
  severity?: "info" | "warning" | "critical" | string;
  message?: string;
  value?: string | number | boolean | null;
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

export type AuthUser = {
  id: number;
  name: string;
  username: string;
  email: string;
  role: string;
};

export type AuthState = {
  isAuthenticated: boolean;
  token: string;
  user: AuthUser | null;
};

export type TaskStatus = "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED" | "CANCELLED";

export type TaskInfo = {
  id: number;
  title: string;
  status: TaskStatus;
  errorMessage?: string | null;
  aiConclusion?: string | null;
  aiModel?: string | null;
};

export type TaskSocketPayload = {
  taskId: number;
  taskStatus: TaskStatus;
  taskTitle?: string;
  message?: string | null;
  timestamp?: string;
};

export type NotificationInfo = {
  id: number;
  type: string;
  content: string;
  senderId?: number | null;
  senderName?: string | null;
  recipientId?: number | null;
  referenceId?: number | null;
  isRead: boolean;
  createdAt: string;
};

export type NotificationSocketPayload = {
  notification: NotificationInfo;
};

export type SocketEvent = {
  type: "NEW_NOTIFICATION" | "TASK_STATUS_UPDATE";
  payload: unknown;
};

export type UserProfileUpdateInput = {
  name?: string;
  username?: string;
  email?: string;
  role?: string;
  password?: string;
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
  aiConclusion?: string;
  aiModel?: string;
};

export type ReplayCameraMode = "chase" | "fpv" | "free";

export type AnalysisMode =
  | "tasks"
  | "dashboard"
  | "replay"
  | "charts"
  | "params"
  | "diagnostics"
  | "profile"
  | "admin";
