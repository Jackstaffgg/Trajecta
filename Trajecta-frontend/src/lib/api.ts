import type {
  AuthUser,
  NotificationInfo,
  TaskInfo,
  TaskStatus,
  UserProfileUpdateInput
} from "@/types/flight";

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
  recipientId: number | null;
  senderId: number | null;
  senderName: string | null;
  referenceId: number | null;
  isRead: boolean;
  createdAt: string;
};

type BroadcastAudiencePreview = {
  allUsers: boolean;
  totalUsers: number;
  targetUsers: number;
  targetUserIds: number[];
  missingRecipientIds: number[];
};

type CacheHealthDto = {
  status: string;
  redisPing: string;
  error: string | null;
};

type CacheClearDto = {
  userId: number | null;
  userExists: boolean;
  usernameKeyEvicted: boolean;
};

type TaskBulkDeleteResult = {
  deletedTaskIds: number[];
  skippedTaskIds: number[];
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

export async function deleteMyTasks(input: { token: string; taskIds: number[] }): Promise<TaskBulkDeleteResult> {
  const res = await fetch(buildUrl("/api/v1/tasks/delete-bulk"), {
    method: "POST",
    headers: withAuth({ "Content-Type": "application/json" }, input.token),
    body: JSON.stringify({ taskIds: input.taskIds })
  });

  return readEnvelope<TaskBulkDeleteResult>(res);
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

export async function regenerateAiConclusion(input: {
  token: string;
  taskId: number;
}): Promise<TaskInfo> {
  const res = await fetch(buildUrl(`/api/v1/tasks/${input.taskId}/ai-conclusion/regenerate`), {
    method: "POST",
    headers: withAuth({}, input.token)
  });

  return readEnvelope<TaskInfo>(res);
}

export function getApiBaseUrl() {
  return API_BASE_URL;
}

export async function getNotifications(input: { token: string }): Promise<NotificationInfo[]> {
  const res = await fetch(buildUrl("/api/v1/notifications"), {
    headers: withAuth({}, input.token)
  });

  const data = await readEnvelope<NotificationDto[]>(res);
  return data.map(mapNotificationDto);
}

export function mapNotificationDto(item: NotificationDto): NotificationInfo {
  return {
    id: item.id,
    type: item.type,
    content: item.content,
    senderId: item.senderId,
    senderName: item.senderName,
    recipientId: item.recipientId,
    referenceId: item.referenceId,
    isRead: item.isRead,
    createdAt: item.createdAt
  };
}

export async function getCurrentUserProfile(input: { token: string }): Promise<AuthUser> {
  const res = await fetch(buildUrl("/api/v1/users/me"), {
    headers: withAuth({}, input.token)
  });

  return readEnvelope<AuthUser>(res);
}

export async function updateCurrentUserProfile(input: {
  token: string;
  update: UserProfileUpdateInput;
}): Promise<AuthUser> {
  const res = await fetch(buildUrl("/api/v1/users"), {
    method: "PUT",
    headers: withAuth({ "Content-Type": "application/json" }, input.token),
    body: JSON.stringify(input.update)
  });

  return readEnvelope<AuthUser>(res);
}

export async function getAdminUsers(input: { token: string }): Promise<AuthUser[]> {
  const res = await fetch(buildUrl("/api/v1/admin/users"), {
    headers: withAuth({}, input.token)
  });

  return readEnvelope<AuthUser[]>(res);
}

export async function sendAdminBroadcast(input: {
  token: string;
  content: string;
  type?: "SYSTEM_NEWS" | "SYSTEM_ALERT" | "TASK_COMPLETED" | "TASK_FAILED";
  recipientIds?: number[];
}): Promise<number> {
  const res = await fetch(buildUrl("/api/v1/admin/notifications/broadcast"), {
    method: "POST",
    headers: withAuth({ "Content-Type": "application/json" }, input.token),
    body: JSON.stringify({
      content: input.content,
      type: input.type ?? "SYSTEM_NEWS",
      recipientIds: input.recipientIds ?? []
    })
  });

  return readEnvelope<number>(res);
}

export async function previewAdminBroadcastAudience(input: {
  token: string;
  content: string;
  type?: "SYSTEM_NEWS" | "SYSTEM_ALERT" | "TASK_COMPLETED" | "TASK_FAILED";
  recipientIds?: number[];
}): Promise<BroadcastAudiencePreview> {
  const res = await fetch(buildUrl("/api/v1/admin/notifications/preview"), {
    method: "POST",
    headers: withAuth({ "Content-Type": "application/json" }, input.token),
    body: JSON.stringify({
      content: input.content,
      type: input.type ?? "SYSTEM_NEWS",
      recipientIds: input.recipientIds ?? []
    })
  });

  return readEnvelope<BroadcastAudiencePreview>(res);
}

export async function getAdminBroadcastHistory(input: { token: string; limit?: number }): Promise<NotificationInfo[]> {
  const limit = input.limit ?? 50;
  const res = await fetch(buildUrl(`/api/v1/admin/notifications/history?limit=${limit}`), {
    headers: withAuth({}, input.token)
  });

  const data = await readEnvelope<NotificationDto[]>(res);
  return data.map(mapNotificationDto);
}

export async function getAdminCacheHealth(input: { token: string }): Promise<CacheHealthDto> {
  const res = await fetch(buildUrl("/api/v1/admin/cache/health"), {
    headers: withAuth({}, input.token)
  });

  return readEnvelope<CacheHealthDto>(res);
}

export async function clearAdminUserCache(input: { token: string; userId: number }): Promise<CacheClearDto> {
  const res = await fetch(buildUrl(`/api/v1/admin/cache/users/${input.userId}/clear`), {
    method: "POST",
    headers: withAuth({}, input.token)
  });

  return readEnvelope<CacheClearDto>(res);
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
