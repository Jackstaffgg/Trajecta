import type { AuthUser, NotificationInfo, TaskInfo, TaskStatus } from "@/types/flight";

type ApiError = {
  status: number;
  code: string;
  message: string;
};

type ApiEnvelope<T> = {
  success: boolean;
  data: T | null;
  error: ApiError | null;
  timestamp: string;
};

type AuthResponse = {
  token: string;
  user: AuthUser;
};

type TaskCreateResponse = {
  id: number;
  title: string;
  status: TaskStatus;
};

function asString(value: unknown, fallback = ""): string {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return fallback;
}

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function normalizeTaskInfo(value: unknown): TaskInfo | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const src = value as Record<string, unknown>;
  const statusRaw = asString(src.status, "PENDING");
  const status = ["PENDING", "PROCESSING", "COMPLETED", "FAILED", "CANCELLED"].includes(statusRaw)
    ? (statusRaw as TaskStatus)
    : "PENDING";

  return {
    id: asNumber(src.id, -1),
    title: asString(src.title, "Untitled task"),
    status,
    errorMessage: src.errorMessage == null ? null : asString(src.errorMessage, "Unknown error")
  };
}

function normalizeNotification(value: unknown): NotificationInfo | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const src = value as Record<string, unknown>;
  return {
    id: asNumber(src.id, -1),
    type: asString(src.type, "SYSTEM"),
    content: asString(src.content, "Notification"),
    senderName: src.senderName == null ? null : asString(src.senderName, "System"),
    referenceId: src.referenceId == null ? null : asNumber(src.referenceId, 0),
    isRead: Boolean(src.isRead),
    createdAt: asString(src.createdAt, new Date().toISOString())
  };
}

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim() ?? "";

export class ApiClientError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "ApiClientError";
    this.status = status;
    this.code = code;
  }
}

function buildUrl(path: string) {
  if (!API_BASE_URL) {
    return path;
  }
  return `${API_BASE_URL.replace(/\/$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
}

async function readEnvelope<T>(res: Response): Promise<T> {
  const raw = await res.text();
  let envelope: ApiEnvelope<T> | null = null;

  if (raw) {
    try {
      envelope = JSON.parse(raw) as ApiEnvelope<T>;
    } catch {
      envelope = null;
    }
  }

  if (!res.ok || !envelope?.success || envelope.data === null) {
    const fallbackMessage = raw && !envelope ? raw : `HTTP ${res.status}`;
    throw new ApiClientError(
      envelope?.error?.message ?? fallbackMessage,
      res.status,
      envelope?.error?.code
    );
  }

  return envelope.data;
}

async function ensureSuccess(res: Response): Promise<void> {
  const raw = await res.text();
  let envelope: ApiEnvelope<unknown> | null = null;

  if (raw) {
    try {
      envelope = JSON.parse(raw) as ApiEnvelope<unknown>;
    } catch {
      envelope = null;
    }
  }

  if (!res.ok || (envelope && !envelope.success)) {
    throw new ApiClientError(envelope?.error?.message ?? `HTTP ${res.status}`, res.status, envelope?.error?.code);
  }
}

function withAuth(headers: HeadersInit, token: string) {
  return {
    ...headers,
    Authorization: `Bearer ${token}`
  };
}

export async function login(username: string, password: string): Promise<AuthResponse> {
  const res = await fetch(buildUrl("/api/v1/auth/login"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password })
  });

  return readEnvelope<AuthResponse>(res);
}

export async function register(input: {
  name: string;
  username: string;
  email: string;
  password: string;
}): Promise<AuthResponse> {
  const res = await fetch(buildUrl("/api/v1/auth/register"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  });

  return readEnvelope<AuthResponse>(res);
}

export async function createTask(input: {
  token: string;
  title: string;
  file: File;
}): Promise<TaskCreateResponse> {
  const form = new FormData();
  form.append("title", input.title);
  form.append("file", input.file);

  const res = await fetch(buildUrl("/api/v1/tasks"), {
    method: "POST",
    headers: withAuth({}, input.token),
    body: form
  });

  return readEnvelope<TaskCreateResponse>(res);
}

export async function getTask(input: { token: string; taskId: number }): Promise<TaskInfo> {
  const res = await fetch(buildUrl(`/api/v1/tasks/${input.taskId}`), {
    headers: withAuth({}, input.token)
  });

  const payload = await readEnvelope<unknown>(res);
  const normalized = normalizeTaskInfo(payload);
  if (!normalized) {
    throw new ApiClientError("Invalid task payload", 500);
  }
  return normalized;
}

export async function getMyTasks(input: {
  token: string;
  offset?: number;
  limit?: number;
}): Promise<TaskInfo[]> {
  const offset = input.offset ?? 0;
  const limit = input.limit ?? 10;

  const res = await fetch(buildUrl(`/api/v1/tasks?offset=${offset}&limit=${limit}`), {
    headers: withAuth({}, input.token)
  });

  const payload = await readEnvelope<unknown>(res);
  if (!Array.isArray(payload)) {
    return [];
  }
  return payload
    .map((item) => normalizeTaskInfo(item))
    .filter((item): item is TaskInfo => item !== null && item.id >= 0);
}

export async function downloadTrajectory(input: {
  token: string;
  taskId: number;
}): Promise<string> {
  const res = await fetch(buildUrl(`/api/v1/tasks/${input.taskId}/trajectory`), {
    headers: withAuth({}, input.token)
  });

  if (!res.ok) {
    throw new ApiClientError(`HTTP ${res.status}`, res.status);
  }

  return res.text();
}

export async function addAiConclusion(input: {
  token: string;
  taskId: number;
}): Promise<TaskInfo> {
  const res = await fetch(buildUrl(`/api/v1/tasks/${input.taskId}/ai-conclusion`), {
    method: "POST",
    headers: withAuth({}, input.token)
  });

  const payload = await readEnvelope<unknown>(res);
  const normalized = normalizeTaskInfo(payload);
  if (!normalized) {
    throw new ApiClientError("Invalid task payload", 500);
  }
  return normalized;
}

export async function getNotifications(input: { token: string }): Promise<NotificationInfo[]> {
  const res = await fetch(buildUrl("/api/v1/notifications"), {
    headers: withAuth({}, input.token)
  });

  const data = await readEnvelope<unknown>(res);
  if (!Array.isArray(data)) {
    return [];
  }

  return data
    .map((item) => normalizeNotification(item))
    .filter((item): item is NotificationInfo => item !== null && item.id >= 0);
}

export async function markNotificationAsRead(input: { token: string; id: number }): Promise<void> {
  const res = await fetch(buildUrl(`/api/v1/notifications/${input.id}/read`), {
    method: "PATCH",
    headers: withAuth({}, input.token)
  });

  await ensureSuccess(res);
}

export async function markAllNotificationsAsRead(input: { token: string }): Promise<void> {
  const res = await fetch(buildUrl("/api/v1/notifications/read-all"), {
    method: "PATCH",
    headers: withAuth({}, input.token)
  });

  await ensureSuccess(res);
}

