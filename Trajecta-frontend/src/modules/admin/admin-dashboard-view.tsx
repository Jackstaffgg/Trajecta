import { useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  ApiClientError,
  clearAdminUserCache,
  getAdminCacheHealth,
  getAdminBroadcastHistory,
  getAdminUsers,
  previewAdminBroadcastAudience,
  sendAdminBroadcast
} from "@/lib/api";
import { useFlightStore } from "@/store/flight-store";
import type { AuthUser, NotificationInfo } from "@/types/flight";

export function AdminDashboardView() {
  const auth = useFlightStore((s) => s.auth);
  const setError = useFlightStore((s) => s.setError);
  const [users, setUsers] = useState<AuthUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [broadcastText, setBroadcastText] = useState("");
  const [broadcastType, setBroadcastType] = useState<"SYSTEM_NEWS" | "SYSTEM_ALERT">("SYSTEM_NEWS");
  const [recipientIdsRaw, setRecipientIdsRaw] = useState("");
  const [broadcastLoading, setBroadcastLoading] = useState(false);
  const [broadcastResult, setBroadcastResult] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewResult, setPreviewResult] = useState<{
    allUsers: boolean;
    totalUsers: number;
    targetUsers: number;
    targetUserIds: number[];
    missingRecipientIds: number[];
  } | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [history, setHistory] = useState<NotificationInfo[]>([]);
  const [cacheHealthLoading, setCacheHealthLoading] = useState(false);
  const [cacheHealth, setCacheHealth] = useState<{ status: string; redisPing: string; error: string | null } | null>(null);
  const [cacheUserIdRaw, setCacheUserIdRaw] = useState("");
  const [cacheClearLoading, setCacheClearLoading] = useState(false);
  const [cacheClearResult, setCacheClearResult] = useState<string | null>(null);

  useEffect(() => {
    if (!auth.token) {
      return;
    }

    let active = true;
    const run = async () => {
      setLoading(true);
      try {
        const all = await getAdminUsers({ token: auth.token });
        if (active) {
          setUsers(all);
        }
      } catch (error) {
        if (!active) {
          return;
        }
        if (error instanceof ApiClientError) {
          setError(error.message);
        } else {
          setError("Failed to load users");
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    void run();
    return () => {
      active = false;
    };
  }, [auth.token, setError]);

  useEffect(() => {
    if (!auth.token) {
      return;
    }

    let active = true;
    const run = async () => {
      setCacheHealthLoading(true);
      try {
        const health = await getAdminCacheHealth({ token: auth.token });
        if (active) {
          setCacheHealth(health);
        }
      } catch (error) {
        if (!active) {
          return;
        }
        if (error instanceof ApiClientError) {
          setError(error.message);
        } else {
          setError("Failed to load cache health");
        }
      } finally {
        if (active) {
          setCacheHealthLoading(false);
        }
      }
    };

    void run();
    return () => {
      active = false;
    };
  }, [auth.token, setError]);

  useEffect(() => {
    if (!auth.token) {
      return;
    }

    let active = true;
    const run = async () => {
      setHistoryLoading(true);
      try {
        const items = await getAdminBroadcastHistory({ token: auth.token, limit: 30 });
        if (active) {
          setHistory(items);
        }
      } catch (error) {
        if (!active) {
          return;
        }
        if (error instanceof ApiClientError) {
          setError(error.message);
        } else {
          setError("Failed to load broadcast history");
        }
      } finally {
        if (active) {
          setHistoryLoading(false);
        }
      }
    };

    void run();
    return () => {
      active = false;
    };
  }, [auth.token, setError]);

  function parseRecipientIds(raw: string) {
    return raw
      .split(",")
      .map((value) => Number.parseInt(value.trim(), 10))
      .filter((value) => Number.isFinite(value) && value > 0);
  }

  async function handlePreview() {
    if (!auth.token) {
      return;
    }

    setPreviewLoading(true);
    setPreviewResult(null);
    try {
      const preview = await previewAdminBroadcastAudience({
        token: auth.token,
        content: broadcastText.trim() || "preview",
        type: broadcastType,
        recipientIds: parseRecipientIds(recipientIdsRaw)
      });
      setPreviewResult(preview);
    } catch (error) {
      if (error instanceof ApiClientError) {
        setError(error.message);
      } else {
        setError("Failed to preview broadcast audience");
      }
    } finally {
      setPreviewLoading(false);
    }
  }

  async function handleBroadcast() {
    if (!auth.token) {
      return;
    }
    const content = broadcastText.trim();
    if (!content) {
      setError("Notification text is required");
      return;
    }

    const recipientIds = parseRecipientIds(recipientIdsRaw);

    setBroadcastLoading(true);
    setBroadcastResult(null);
    try {
      const sent = await sendAdminBroadcast({
        token: auth.token,
        content,
        type: broadcastType,
        recipientIds
      });
      setBroadcastResult(`Sent to ${sent} users`);
      setBroadcastText("");
      setRecipientIdsRaw("");
      setPreviewResult(null);
      const items = await getAdminBroadcastHistory({ token: auth.token, limit: 30 });
      setHistory(items);
    } catch (error) {
      if (error instanceof ApiClientError) {
        setError(error.message);
      } else {
        setError("Failed to send broadcast notification");
      }
    } finally {
      setBroadcastLoading(false);
    }
  }

  async function handleRefreshCacheHealth() {
    if (!auth.token) {
      return;
    }

    setCacheHealthLoading(true);
    try {
      const health = await getAdminCacheHealth({ token: auth.token });
      setCacheHealth(health);
    } catch (error) {
      if (error instanceof ApiClientError) {
        setError(error.message);
      } else {
        setError("Failed to refresh cache health");
      }
    } finally {
      setCacheHealthLoading(false);
    }
  }

  async function handleClearUserCache() {
    if (!auth.token) {
      return;
    }

    const userId = Number.parseInt(cacheUserIdRaw.trim(), 10);
    if (!Number.isFinite(userId) || userId <= 0) {
      setError("Provide a valid user id for cache clear");
      return;
    }

    setCacheClearLoading(true);
    setCacheClearResult(null);
    try {
      const result = await clearAdminUserCache({ token: auth.token, userId });
      setCacheClearResult(
        `Cleared user #${result.userId}. exists=${result.userExists}, usernameKeyEvicted=${result.usernameKeyEvicted}`
      );
    } catch (error) {
      if (error instanceof ApiClientError) {
        setError(error.message);
      } else {
        setError("Failed to clear user cache");
      }
    } finally {
      setCacheClearLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-accent" />
            Admin Dashboard
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3">
          <div className="rounded-lg border border-border bg-background/40 p-3">
            <p className="text-xs uppercase text-muted-foreground">Total users</p>
            <p className="mt-1 text-2xl font-semibold text-foreground">{users.length}</p>
          </div>
          <div className="rounded-lg border border-border bg-background/40 p-3">
            <p className="text-xs uppercase text-muted-foreground">Admins</p>
            <p className="mt-1 text-2xl font-semibold text-foreground">
              {users.filter((u) => u.role?.toUpperCase() === "ADMIN").length}
            </p>
          </div>
          <div className="rounded-lg border border-border bg-background/40 p-3">
            <p className="text-xs uppercase text-muted-foreground">Status</p>
            <p className="mt-1 text-sm font-semibold text-foreground">{loading ? "Loading..." : "Ready"}</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>User Accounts</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-auto rounded-lg border border-border">
            <table className="w-full min-w-[680px] text-sm">
              <thead className="bg-background/60 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left">ID</th>
                  <th className="px-3 py-2 text-left">Name</th>
                  <th className="px-3 py-2 text-left">Username</th>
                  <th className="px-3 py-2 text-left">Email</th>
                  <th className="px-3 py-2 text-left">Role</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id} className="border-t border-border/70">
                    <td className="px-3 py-2">{user.id}</td>
                    <td className="px-3 py-2">{user.name}</td>
                    <td className="px-3 py-2">{user.username}</td>
                    <td className="px-3 py-2">{user.email}</td>
                    <td className="px-3 py-2">{user.role}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Cache Maintenance</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="rounded-md border border-border bg-background/40 p-2 text-xs text-muted-foreground">
            {cacheHealthLoading ? (
              <p>Checking cache health...</p>
            ) : cacheHealth ? (
              <p>
                Status: <span className="font-medium text-foreground">{cacheHealth.status}</span> | Redis: {cacheHealth.redisPing}
                {cacheHealth.error ? ` | ${cacheHealth.error}` : ""}
              </p>
            ) : (
              <p>Cache health is not loaded yet.</p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              className="rounded-md border border-border bg-background p-2 text-sm text-foreground outline-none focus:border-accent"
              value={cacheUserIdRaw}
              onChange={(e) => setCacheUserIdRaw(e.target.value)}
              placeholder="User id"
            />
            <Button variant="outline" onClick={() => void handleRefreshCacheHealth()} disabled={cacheHealthLoading}>
              {cacheHealthLoading ? "Refreshing..." : "Refresh health"}
            </Button>
            <Button onClick={() => void handleClearUserCache()} disabled={cacheClearLoading || !cacheUserIdRaw.trim()}>
              {cacheClearLoading ? "Clearing..." : "Clear user cache"}
            </Button>
          </div>
          {cacheClearResult ? <p className="text-xs text-emerald-300">{cacheClearResult}</p> : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Broadcast Notification</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Send system news/alerts to all users or to selected user IDs. The sender is shown as current admin.
          </p>
          <div className="grid gap-2 md:grid-cols-2">
            <label className="space-y-1 text-xs text-muted-foreground">
              <span>Type</span>
              <select
                className="w-full rounded-md border border-border bg-background p-2 text-sm text-foreground outline-none focus:border-accent"
                value={broadcastType}
                onChange={(e) => setBroadcastType(e.target.value as "SYSTEM_NEWS" | "SYSTEM_ALERT")}
              >
                <option value="SYSTEM_NEWS">System news</option>
                <option value="SYSTEM_ALERT">System alert</option>
              </select>
            </label>
            <label className="space-y-1 text-xs text-muted-foreground">
              <span>Recipient IDs (optional)</span>
              <input
                className="w-full rounded-md border border-border bg-background p-2 text-sm text-foreground outline-none focus:border-accent"
                value={recipientIdsRaw}
                onChange={(e) => setRecipientIdsRaw(e.target.value)}
                placeholder="e.g. 12, 15, 20"
              />
            </label>
          </div>
          <textarea
            className="min-h-24 w-full rounded-md border border-border bg-background p-2 text-sm outline-none focus:border-accent"
            value={broadcastText}
            onChange={(e) => setBroadcastText(e.target.value)}
            maxLength={500}
            placeholder="Enter news or alert text..."
          />
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => void handlePreview()} disabled={previewLoading || broadcastLoading}>
              {previewLoading ? "Previewing..." : "Preview audience"}
            </Button>
            <Button onClick={() => void handleBroadcast()} disabled={broadcastLoading || !broadcastText.trim()}>
              {broadcastLoading ? "Sending..." : "Send broadcast"}
            </Button>
            {broadcastResult ? <span className="text-xs text-emerald-300">{broadcastResult}</span> : null}
          </div>
          {previewResult ? (
            <div className="rounded-md border border-border bg-background/40 p-2 text-xs text-muted-foreground">
              <p>
                Mode: {previewResult.allUsers ? "All users" : "Selected IDs"} | Targets: {previewResult.targetUsers} of {previewResult.totalUsers}
              </p>
              {previewResult.missingRecipientIds.length > 0 ? (
                <p className="mt-1 text-amber-300">
                  Missing IDs: {previewResult.missingRecipientIds.join(", ")}
                </p>
              ) : null}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Broadcast History</CardTitle>
        </CardHeader>
        <CardContent>
          {historyLoading ? (
            <p className="text-xs text-muted-foreground">Loading...</p>
          ) : history.length === 0 ? (
            <p className="text-xs text-muted-foreground">No broadcast records yet.</p>
          ) : (
            <div className="space-y-2">
              {history.map((item) => (
                <div key={item.id} className="rounded-md border border-border/70 bg-background/40 p-2 text-xs">
                  <p className="font-medium text-foreground">{item.type}</p>
                  <p className="text-muted-foreground">{item.content}</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    recipient #{item.recipientId ?? "-"} • {new Date(item.createdAt).toLocaleString()}
                  </p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
