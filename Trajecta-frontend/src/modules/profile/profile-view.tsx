import { useState } from "react";
import { Save } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ApiClientError, updateCurrentUserProfile } from "@/lib/api";
import { useFlightStore } from "@/store/flight-store";

export function ProfileView() {
  const auth = useFlightStore((s) => s.auth);
  const setAuthenticated = useFlightStore((s) => s.setAuthenticated);
  const setError = useFlightStore((s) => s.setError);

  const [name, setName] = useState(auth.user?.name ?? "");
  const [username, setUsername] = useState(auth.user?.username ?? "");
  const [email, setEmail] = useState(auth.user?.email ?? "");
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!auth.token) {
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const updated = await updateCurrentUserProfile({
        token: auth.token,
        update: {
          name: name.trim(),
          username: username.trim(),
          email: email.trim(),
          ...(password.trim() ? { password: password.trim() } : {})
        }
      });
      setAuthenticated(auth.token, updated);
      setPassword("");
    } catch (error) {
      if (error instanceof ApiClientError) {
        setError(error.message);
      } else {
        setError("Failed to save profile");
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle>Profile Settings</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <p className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">Full Name</p>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <p className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">Username</p>
            <Input value={username} onChange={(e) => setUsername(e.target.value)} />
          </div>
        </div>
        <div>
          <p className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">Email</p>
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div>
          <p className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">New Password</p>
          <Input type="password" placeholder="Leave empty to keep current password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        <div className="flex items-center justify-between rounded-lg border border-border bg-background/40 px-3 py-2 text-xs text-muted-foreground">
          <span>Role: {auth.user?.role ?? "USER"}</span>
          <span>ID: {auth.user?.id ?? "-"}</span>
        </div>
        <Button onClick={() => void handleSave()} disabled={saving}>
          <Save className="h-4 w-4" />
          {saving ? "Saving..." : "Save Changes"}
        </Button>
      </CardContent>
    </Card>
  );
}

