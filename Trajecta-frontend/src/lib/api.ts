import type { AuthUser, TaskInfo, TaskStatus } from "@/types/flight";

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
