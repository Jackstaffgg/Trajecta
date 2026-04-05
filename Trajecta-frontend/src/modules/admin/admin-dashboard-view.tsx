import { useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  ApiClientError,
  banAdminUser,
  clearAdminUserCache,
  deleteAdminUser,
  getAdminCacheHealth,
  getAdminBroadcastHistory,
  getAdminUserDetails,
  getAdminUsers,
  previewAdminBroadcastAudience,
  sendAdminBroadcast,
  unbanAdminUserByUserId,
  updateAdminUserRole
} from "@/lib/api";
import { formatDateByLocale, localizeNotificationType, t } from "@/lib/i18n";
import { useLocaleStore } from "@/store/locale-store";
import { useFlightStore } from "@/store/flight-store";
import type { AdminUserDetails, AuthUser, NotificationInfo } from "@/types/flight";

type AdminSection = "users" | "user" | "notifications";

type AdminDashboardViewProps = {
  section: AdminSection;
};

export function AdminDashboardView({ section }: AdminDashboardViewProps) {
  const auth = useFlightStore((s) => s.auth);
  const setMode = useFlightStore((s) => s.setMode);
  const selectedUserId = useFlightStore((s) => s.adminSelectedUserId);
  const setSelectedUserId = useFlightStore((s) => s.setAdminSelectedUserId);
  const setError = useFlightStore((s) => s.setError);
  const locale = useLocaleStore((s) => s.locale);

  const [users, setUsers] = useState<AuthUser[]>([]);
  const [page, setPage] = useState(0);
  const [size] = useState(10);
  const [hasNext, setHasNext] = useState(false);
  const [loading, setLoading] = useState(false);

  const [selectedDetails, setSelectedDetails] = useState<AdminUserDetails | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [banReason, setBanReason] = useState("");
  const [banUntil, setBanUntil] = useState("");

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

  const isUsersSection = section === "users";
  const isUserSection = section === "user";
  const isNotificationsSection = section === "notifications";

  const actorRole = auth.user?.role?.toUpperCase();
  const targetRole = selectedDetails?.role?.toUpperCase();
  const isSelfTarget = selectedDetails?.id === auth.user?.id;
  const canMutateTarget = Boolean(selectedDetails) && !isSelfTarget && (actorRole === "OWNER" || targetRole !== "OWNER");

  useEffect(() => {
    if (!auth.token || (!isUsersSection && !isUserSection)) {
      return;
    }

    let active = true;
    const run = async () => {
      setLoading(true);
      try {
        const usersPage = await getAdminUsers({ token: auth.token, page, size });
        if (!active) {
          return;
        }
        setUsers(usersPage.items);
        setHasNext(usersPage.hasNext);
        if (usersPage.items.length > 0 && selectedUserId === null) {
          setSelectedUserId(usersPage.items[0].id);
        }
      } catch (error) {
        if (!active) {
          return;
        }
        setError(error instanceof ApiClientError ? error.message : "Failed to load users", "admin");
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
  }, [auth.token, isUserSection, isUsersSection, page, selectedUserId, setError, setSelectedUserId, size]);

  useEffect(() => {
    if (!auth.token || selectedUserId === null || !isUserSection) {
      return;
    }

    let active = true;
    const run = async () => {
      setDetailsLoading(true);
      try {
        const details = await getAdminUserDetails({ token: auth.token, userId: selectedUserId });
        if (active) {
          setSelectedDetails(details);
        }
      } catch (error) {
        if (active) {
          setError(error instanceof ApiClientError ? error.message : "Failed to load user details", "admin");
        }
      } finally {
        if (active) {
          setDetailsLoading(false);
        }
      }
    };

    void run();
    return () => {
      active = false;
    };
  }, [auth.token, isUserSection, selectedUserId, setError]);

  useEffect(() => {
    if (!auth.token || !isNotificationsSection) {
      return;
    }

    let active = true;
    const load = async () => {
      setCacheHealthLoading(true);
      setHistoryLoading(true);
      try {
        const [health, items] = await Promise.all([
          getAdminCacheHealth({ token: auth.token }),
          getAdminBroadcastHistory({ token: auth.token, limit: 30 })
        ]);
        if (!active) {
          return;
        }
        setCacheHealth(health);
        setHistory(items);
      } catch (error) {
        if (active) {
          setError(error instanceof ApiClientError ? error.message : "Failed to load notifications admin data", "admin");
        }
      } finally {
        if (active) {
          setCacheHealthLoading(false);
          setHistoryLoading(false);
        }
      }
    };

    void load();
    return () => {
      active = false;
    };
  }, [auth.token, isNotificationsSection, setError]);

  async function refreshUsersAndDetails() {
    if (!auth.token || (!isUsersSection && !isUserSection)) {
      return;
    }

    const usersPage = await getAdminUsers({ token: auth.token, page, size });
    setUsers(usersPage.items);
    setHasNext(usersPage.hasNext);

    if (selectedUserId !== null) {
      const details = await getAdminUserDetails({ token: auth.token, userId: selectedUserId });
      setSelectedDetails(details);
    }
  }

  function parseRecipientIds(raw: string) {
    return raw
      .split(",")
      .map((value) => Number.parseInt(value.trim(), 10))
      .filter((value) => Number.isFinite(value) && value > 0);
  }

  async function handleRoleUpdate(role: "USER" | "ADMIN") {
    if (!auth.token || selectedUserId === null || !canMutateTarget) {
      return;
    }
    setActionLoading(true);
    try {
      await updateAdminUserRole({ token: auth.token, userId: selectedUserId, role });
      await refreshUsersAndDetails();
    } catch (error) {
      setError(error instanceof ApiClientError ? error.message : "Failed to update role", "admin");
    } finally {
      setActionLoading(false);
    }
  }

  async function handleBanUser() {
    if (!auth.token || selectedUserId === null || !canMutateTarget) {
      return;
    }
    if (!banReason.trim()) {
      setError("Ban reason is required", "admin");
      return;
    }
    setActionLoading(true);
    try {
      await banAdminUser({
        token: auth.token,
        userId: selectedUserId,
        reason: banReason.trim(),
        expiredAt: banUntil ? new Date(banUntil).toISOString() : null
      });
      setBanReason("");
      setBanUntil("");
      await refreshUsersAndDetails();
    } catch (error) {
      setError(error instanceof ApiClientError ? error.message : "Failed to ban user", "admin");
    } finally {
      setActionLoading(false);
    }
  }

  async function handleUnbanUser() {
    if (!auth.token || selectedUserId === null || !canMutateTarget) {
      return;
    }
    setActionLoading(true);
    try {
      await unbanAdminUserByUserId({ token: auth.token, userId: selectedUserId });
      await refreshUsersAndDetails();
    } catch (error) {
      setError(error instanceof ApiClientError ? error.message : "Failed to unban user", "admin");
    } finally {
      setActionLoading(false);
    }
  }

  async function handleDeleteUser() {
    if (!auth.token || selectedUserId === null || !canMutateTarget) {
      return;
    }
    setActionLoading(true);
    try {
      await deleteAdminUser({ token: auth.token, userId: selectedUserId });
      setSelectedUserId(null);
      setSelectedDetails(null);
      await refreshUsersAndDetails();
      setMode("admin-users");
    } catch (error) {
      setError(error instanceof ApiClientError ? error.message : "Failed to delete user", "admin");
    } finally {
      setActionLoading(false);
    }
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
      setError(error instanceof ApiClientError ? error.message : "Failed to preview broadcast audience", "admin");
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
      setError("Notification text is required", "admin");
      return;
    }

    setBroadcastLoading(true);
    setBroadcastResult(null);
    try {
      const sent = await sendAdminBroadcast({
        token: auth.token,
        content,
        type: broadcastType,
        recipientIds: parseRecipientIds(recipientIdsRaw)
      });
      setBroadcastResult(`Sent to ${sent} users`);
      setBroadcastText("");
      setRecipientIdsRaw("");
      setPreviewResult(null);
      const items = await getAdminBroadcastHistory({ token: auth.token, limit: 30 });
      setHistory(items);
    } catch (error) {
      setError(error instanceof ApiClientError ? error.message : "Failed to send broadcast notification", "admin");
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
      setError(error instanceof ApiClientError ? error.message : "Failed to refresh cache health", "admin");
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
      setError("Provide a valid user id for cache clear", "admin");
      return;
    }

    setCacheClearLoading(true);
    setCacheClearResult(null);
    try {
      const result = await clearAdminUserCache({ token: auth.token, userId });
      setCacheClearResult(`Cleared user #${result.userId}. exists=${result.userExists}, usernameKeyEvicted=${result.usernameKeyEvicted}`);
    } catch (error) {
      setError(error instanceof ApiClientError ? error.message : "Failed to clear user cache", "admin");
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
            {t(locale, "admin.title")}
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3">
          <div className="rounded-lg border border-border bg-background/40 p-3">
            <p className="text-xs uppercase text-muted-foreground">{t(locale, "admin.totalUsers")}</p>
            <p className="mt-1 text-2xl font-semibold text-foreground">{users.length}</p>
          </div>
          <div className="rounded-lg border border-border bg-background/40 p-3">
            <p className="text-xs uppercase text-muted-foreground">{t(locale, "admin.admins")}</p>
            <p className="mt-1 text-2xl font-semibold text-foreground">
              {users.filter((u) => ["ADMIN", "OWNER"].includes(u.role?.toUpperCase())).length}
            </p>
          </div>
          <div className="rounded-lg border border-border bg-background/40 p-3">
            <p className="text-xs uppercase text-muted-foreground">{t(locale, "common.status")}</p>
            <p className="mt-1 text-sm font-semibold text-foreground">{loading ? t(locale, "common.loading") : t(locale, "common.ready")}</p>
          </div>
        </CardContent>
      </Card>

      {isUsersSection ? (
        <Card>
          <CardHeader>
            <CardTitle>{t(locale, "admin.userAccounts")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="overflow-auto rounded-lg border border-border">
              <table className="w-full min-w-[680px] text-sm">
                <thead className="bg-background/60 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left">{t(locale, "admin.userId")}</th>
                    <th className="px-3 py-2 text-left">{t(locale, "admin.userName")}</th>
                    <th className="px-3 py-2 text-left">{t(locale, "admin.userUsername")}</th>
                    <th className="px-3 py-2 text-left">{t(locale, "admin.userEmail")}</th>
                    <th className="px-3 py-2 text-left">{t(locale, "admin.userRole")}</th>
                    <th className="px-3 py-2 text-left">{t(locale, "admin.userActions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => (
                    <tr key={user.id} className={`border-t border-border/70 ${selectedUserId === user.id ? "bg-background/50" : ""}`}>
                      <td className="px-3 py-2">{user.id}</td>
                      <td className="px-3 py-2">{user.name}</td>
                      <td className="px-3 py-2">{user.username}</td>
                      <td className="px-3 py-2">{user.email}</td>
                      <td className="px-3 py-2">{user.role}</td>
                      <td className="px-3 py-2">
                        <Button
                          variant="outline"
                          onClick={() => {
                            setSelectedUserId(user.id);
                            setMode("admin-user");
                          }}
                        >
                          {t(locale, "admin.select")}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between">
              <Button variant="outline" disabled={page === 0 || loading} onClick={() => setPage((p) => Math.max(0, p - 1))}>{t(locale, "admin.prev")}</Button>
              <span className="text-xs text-muted-foreground">{t(locale, "admin.page", { page: page + 1 })}</span>
              <Button variant="outline" disabled={!hasNext || loading} onClick={() => setPage((p) => p + 1)}>{t(locale, "admin.next")}</Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {isUserSection ? (
        <Card>
          <CardHeader>
            <CardTitle>{t(locale, "admin.controlsTitle")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {selectedUserId === null ? (
              <div className="rounded-lg border border-border bg-background/30 p-3 text-sm text-muted-foreground">
                <p>{t(locale, "admin.selectUserHint")}</p>
                <Button className="mt-3" variant="outline" onClick={() => setMode("admin-users")}>{t(locale, "admin.userAccounts")}</Button>
              </div>
            ) : detailsLoading ? (
              <p className="text-xs text-muted-foreground">{t(locale, "admin.loadingDetails")}</p>
            ) : selectedDetails ? (
              <div className="space-y-3">
                <div className="rounded-md border border-border/70 bg-background/40 p-2 text-xs text-muted-foreground">
                  <p><span className="text-foreground">{t(locale, "common.user")}:</span> #{selectedDetails.id} {selectedDetails.username}</p>
                  <p><span className="text-foreground">{t(locale, "common.name")}:</span> {selectedDetails.name}</p>
                  <p><span className="text-foreground">{t(locale, "common.role")}:</span> {selectedDetails.role}</p>
                </div>

                {!canMutateTarget ? (
                  <p className="rounded-md border border-zinc-400/40 bg-zinc-500/10 px-3 py-2 text-xs text-zinc-200">
                    {isSelfTarget
                      ? t(locale, "admin.selfActionBlocked")
                      : t(locale, "admin.ownerProtected")}
                  </p>
                ) : null}

                <div className="space-y-2 rounded-md border border-border/70 p-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t(locale, "admin.roleManagement")}</p>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" disabled={actionLoading || !canMutateTarget} onClick={() => void handleRoleUpdate("USER")}>{t(locale, "admin.setRoleUser")}</Button>
                    <Button variant="outline" disabled={actionLoading || !canMutateTarget} onClick={() => void handleRoleUpdate("ADMIN")}>{t(locale, "admin.setRoleAdmin")}</Button>
                  </div>
                </div>

                <div className="space-y-2 rounded-md border border-border/70 p-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t(locale, "admin.banManagement")}</p>
                  <div className="grid gap-2 md:grid-cols-[1fr_auto_auto]">
                    <input
                      className="ui-field text-sm"
                      placeholder={t(locale, "admin.banReason")}
                      value={banReason}
                      onChange={(e) => setBanReason(e.target.value)}
                      disabled={!canMutateTarget}
                    />
                    <input
                      type="datetime-local"
                      className="ui-field text-sm"
                      value={banUntil}
                      onChange={(e) => setBanUntil(e.target.value)}
                      disabled={!canMutateTarget}
                    />
                    <Button disabled={actionLoading || !canMutateTarget} onClick={() => void handleBanUser()}>{t(locale, "admin.banUser")}</Button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" disabled={actionLoading || !canMutateTarget} onClick={() => void handleUnbanUser()}>{t(locale, "admin.unbanUser")}</Button>
                  </div>
                </div>

                <div className="space-y-2 rounded-md border border-zinc-400/30 p-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-zinc-300">{t(locale, "admin.dangerZone")}</p>
                  <Button variant="destructive" disabled={actionLoading || !canMutateTarget} onClick={() => void handleDeleteUser()}>{t(locale, "admin.deleteUser")}</Button>
                </div>

                <div>
                  <p className="mb-1 text-xs text-muted-foreground">{t(locale, "admin.activePunishments")}</p>
                  {selectedDetails.activePunishments.length === 0 ? (
                    <p className="text-xs text-muted-foreground">{t(locale, "admin.noPunishments")}</p>
                  ) : (
                    <div className="space-y-1">
                      {selectedDetails.activePunishments.map((p) => (
                        <div key={p.id} className="rounded border border-border/70 p-2 text-xs">
                          <p className="font-medium">{p.type} • {p.reason}</p>
                          <p className="text-muted-foreground">{t(locale, "common.until")}: {p.expiredAt ? formatDateByLocale(p.expiredAt, locale) : t(locale, "common.permanent")}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">{t(locale, "admin.selectUserHint")}</p>
            )}
          </CardContent>
        </Card>
      ) : null}

      {isNotificationsSection ? (
        <>
          <Card>
            <CardHeader>
              <CardTitle>{t(locale, "admin.cacheMaintenance")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="rounded-md border border-border bg-background/40 p-2 text-xs text-muted-foreground">
                {cacheHealthLoading ? (
                  <p>{t(locale, "admin.checkingCache")}</p>
                ) : cacheHealth ? (
                  <p>
                    {t(locale, "common.status")}: <span className="font-medium text-foreground">{cacheHealth.status}</span> | Redis: {cacheHealth.redisPing}
                    {cacheHealth.error ? ` | ${cacheHealth.error}` : ""}
                  </p>
                ) : (
                  <p>{t(locale, "admin.cacheNotLoaded")}</p>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  className="ui-field text-sm"
                  value={cacheUserIdRaw}
                  onChange={(e) => setCacheUserIdRaw(e.target.value)}
                  placeholder="User id"
                />
                <Button variant="outline" onClick={() => void handleRefreshCacheHealth()} disabled={cacheHealthLoading}>
                  {cacheHealthLoading ? t(locale, "admin.refreshing") : t(locale, "admin.refreshHealth")}
                </Button>
                <Button onClick={() => void handleClearUserCache()} disabled={cacheClearLoading || !cacheUserIdRaw.trim()}>
                  {cacheClearLoading ? t(locale, "admin.clearing") : t(locale, "admin.clearUserCache")}
                </Button>
              </div>
              {cacheClearResult ? <p className="text-xs text-zinc-200">{cacheClearResult}</p> : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t(locale, "admin.broadcast")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-xs text-muted-foreground">{t(locale, "admin.broadcastHint")}</p>
              <div className="grid gap-2 md:grid-cols-2">
                <label className="space-y-1 text-xs text-muted-foreground">
                  <span>{t(locale, "admin.type")}</span>
                  <select
                    className="ui-select"
                    value={broadcastType}
                    onChange={(e) => setBroadcastType(e.target.value as "SYSTEM_NEWS" | "SYSTEM_ALERT")}
                  >
                    <option value="SYSTEM_NEWS">{localizeNotificationType("SYSTEM_NEWS", locale)}</option>
                    <option value="SYSTEM_ALERT">{localizeNotificationType("SYSTEM_ALERT", locale)}</option>
                  </select>
                </label>
                <label className="space-y-1 text-xs text-muted-foreground">
                  <span>{t(locale, "admin.recipients")}</span>
                  <input
                    className="ui-field text-sm"
                    value={recipientIdsRaw}
                    onChange={(e) => setRecipientIdsRaw(e.target.value)}
                    placeholder={t(locale, "admin.recipientExample")}
                  />
                </label>
              </div>
              <textarea
                className="ui-field min-h-24"
                value={broadcastText}
                onChange={(e) => setBroadcastText(e.target.value)}
                maxLength={500}
                placeholder={t(locale, "admin.enterMessage")}
              />
              <div className="flex items-center gap-2">
                <Button variant="outline" onClick={() => void handlePreview()} disabled={previewLoading || broadcastLoading}>
                  {previewLoading ? t(locale, "admin.previewing") : t(locale, "admin.previewAudience")}
                </Button>
                <Button onClick={() => void handleBroadcast()} disabled={broadcastLoading || !broadcastText.trim()}>
                  {broadcastLoading ? t(locale, "admin.sending") : t(locale, "admin.sendBroadcast")}
                </Button>
                {broadcastResult ? <span className="text-xs text-zinc-200">{broadcastResult}</span> : null}
              </div>
              {previewResult ? (
                <div className="rounded-md border border-border bg-background/40 p-2 text-xs text-muted-foreground">
                  <p>
                    {t(locale, "admin.mode")}: {previewResult.allUsers ? t(locale, "admin.allUsers") : t(locale, "admin.selectedIds")} | {t(locale, "admin.targets")}: {previewResult.targetUsers} / {previewResult.totalUsers}
                  </p>
                  {previewResult.missingRecipientIds.length > 0 ? (
                    <p className="mt-1 text-zinc-300">{t(locale, "admin.missingIds")}: {previewResult.missingRecipientIds.join(", ")}</p>
                  ) : null}
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t(locale, "admin.broadcastHistory")}</CardTitle>
            </CardHeader>
            <CardContent>
              {historyLoading ? (
                <p className="text-xs text-muted-foreground">{t(locale, "common.loading")}</p>
              ) : history.length === 0 ? (
                <p className="text-xs text-muted-foreground">{t(locale, "admin.noBroadcastHistory")}</p>
              ) : (
                <div className="space-y-2">
                  {history.map((item) => (
                    <div key={item.id} className="rounded-md border border-border/70 bg-background/40 p-2 text-xs">
                      <p className="font-medium text-foreground">{localizeNotificationType(item.type, locale)}</p>
                      <p className="text-muted-foreground">{item.content}</p>
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        {t(locale, "admin.recipient")} #{item.recipientId ?? "-"} • {formatDateByLocale(item.createdAt, locale)}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}
