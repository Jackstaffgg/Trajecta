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

type NotificationDto = {
  id: number;
  type: string;
  content: string;
  senderId: number | null;
  senderName: string | null;
  referenceId: number | null;
  isRead: boolean;
  createdAt: string;
};

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

  return readEnvelope<TaskInfo>(res);
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

  return readEnvelope<TaskInfo[]>(res);
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

  return readEnvelope<TaskInfo>(res);
}

export async function getNotifications(input: { token: string }): Promise<NotificationInfo[]> {
  const res = await fetch(buildUrl("/api/v1/notifications"), {
    headers: withAuth({}, input.token)
  });

  const data = await readEnvelope<NotificationDto[]>(res);
  return data.map((item) => ({
    id: item.id,
    type: item.type,
    content: item.content,
    senderName: item.senderName,
    referenceId: item.referenceId,
    isRead: item.isRead,
    createdAt: item.createdAt
  }));
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

