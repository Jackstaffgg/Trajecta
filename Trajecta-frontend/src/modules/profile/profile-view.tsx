import { useState } from "react";
import { Save } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { t } from "@/lib/i18n";
import { useLocaleStore } from "@/store/locale-store";
import { ApiClientError, updateCurrentUserProfile } from "@/lib/api";
import { useFlightStore } from "@/store/flight-store";
import type { UserProfileUpdateInput } from "@/types/flight";

export function ProfileView() {
  const auth = useFlightStore((s) => s.auth);
  const locale = useLocaleStore((s) => s.locale);
  const setAuthenticated = useFlightStore((s) => s.setAuthenticated);
  const setError = useFlightStore((s) => s.setError);

  const [name, setName] = useState(auth.user?.name ?? "");
  const [username, setUsername] = useState(auth.user?.username ?? "");
  const [email, setEmail] = useState(auth.user?.email ?? "");
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);

  const currentName = auth.user?.name ?? "";
  const currentUsername = auth.user?.username ?? "";
  const currentEmail = auth.user?.email ?? "";

  const normalizedName = name.trim();
  const normalizedUsername = username.trim();
  const normalizedEmail = email.trim();
  const normalizedPassword = password.trim();

  const hasChanges =
    (normalizedName.length > 0 && normalizedName !== currentName) ||
    (normalizedUsername.length > 0 && normalizedUsername !== currentUsername) ||
    (normalizedEmail.length > 0 && normalizedEmail !== currentEmail) ||
    normalizedPassword.length > 0;

  function buildUpdatePayload(): UserProfileUpdateInput {
    const update: UserProfileUpdateInput = {};

    if (normalizedName.length > 0 && normalizedName !== currentName) {
      update.name = normalizedName;
    }
    if (normalizedUsername.length > 0 && normalizedUsername !== currentUsername) {
      update.username = normalizedUsername;
    }
    if (normalizedEmail.length > 0 && normalizedEmail !== currentEmail) {
      update.email = normalizedEmail;
    }
    if (normalizedPassword.length > 0) {
      update.password = normalizedPassword;
    }

    return update;
  }

  async function handleSave() {
    if (!auth.token) {
      return;
    }

    const updatePayload = buildUpdatePayload();
    if (Object.keys(updatePayload).length === 0) {
      setError("No changes to save", "profile");
      return;
    }

    setSaving(true);
    setError(null, "profile");
    try {
      const updated = await updateCurrentUserProfile({
        token: auth.token,
        update: updatePayload
      });
      setAuthenticated(auth.token, updated);
      setName(updated.name ?? "");
      setUsername(updated.username ?? "");
      setEmail(updated.email ?? "");
      setPassword("");
    } catch (error) {
      if (error instanceof ApiClientError) {
        setError(error.message, "profile");
      } else {
        setError("Failed to save profile", "profile");
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl">
      <Card className="border-white/10 bg-slate-950/45">
        <CardHeader className="space-y-1.5">
          <CardTitle className="text-xl">{t(locale, "profile.title")}</CardTitle>
          <p className="text-sm text-muted-foreground">{t(locale, "profile.subtitle")}</p>
        </CardHeader>
        <CardContent className="space-y-5">
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <p className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">{t(locale, "profile.name")}</p>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <p className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">{t(locale, "profile.username")}</p>
            <Input value={username} onChange={(e) => setUsername(e.target.value)} />
          </div>
        </div>
        <div>
          <p className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">{t(locale, "profile.email")}</p>
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div>
          <p className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">{t(locale, "profile.password")}</p>
          <Input type="password" placeholder={t(locale, "profile.passwordHint")} value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        <div className="flex items-center justify-between rounded-xl border border-border/80 bg-background/30 px-3 py-2 text-xs text-muted-foreground">
          <span className="rounded-full border border-border/70 px-2 py-0.5">{t(locale, "profile.role")}: {auth.user?.role ?? "USER"}</span>
          <span className="rounded-full border border-border/70 px-2 py-0.5">{t(locale, "profile.userId")}: {auth.user?.id ?? "-"}</span>
        </div>
        <Button onClick={() => void handleSave()} disabled={saving || !hasChanges}>
          <Save className="h-4 w-4" />
          {saving ? t(locale, "profile.saving") : t(locale, "profile.save")}
        </Button>
        </CardContent>
      </Card>
    </div>
  );
}
