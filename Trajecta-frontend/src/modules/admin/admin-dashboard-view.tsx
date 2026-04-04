import { useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ApiClientError, getAdminUsers } from "@/lib/api";
import { useFlightStore } from "@/store/flight-store";
import type { AuthUser } from "@/types/flight";

export function AdminDashboardView() {
  const auth = useFlightStore((s) => s.auth);
  const setError = useFlightStore((s) => s.setError);
  const [users, setUsers] = useState<AuthUser[]>([]);
  const [loading, setLoading] = useState(false);

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
    </div>
  );
}
