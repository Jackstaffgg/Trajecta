import { useState } from "react";
import { Lock, UserPlus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useFlightStore } from "@/store/flight-store";
import { ApiClientError, login, register } from "@/lib/api";

export function AuthScreen() {
  const [isRegister, setIsRegister] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const setAuthenticated = useFlightStore((s) => s.setAuthenticated);

  async function handleAuth() {
    if (!username || !password || (isRegister && (!name || !email))) {
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const result = isRegister
        ? await register({ name, username, email, password })
        : await login(username, password);
      setAuthenticated(result.token, result.user);
    } catch (e) {
      if (e instanceof ApiClientError) {
        setError(e.message);
      } else if (e instanceof Error) {
        setError(e.message);
      } else {
        setError("Auth request failed");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-xl font-bold text-foreground">
            {isRegister ? "Create account" : "Flight Analyst Login"}
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Secure gateway for ArduPilot mission review.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          {isRegister ? (
            <Input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="John Pilot"
            />
          ) : null}
          {isRegister ? (
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="pilot@example.com"
            />
          ) : null}
          <Input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="pilot_01"
          />
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="********"
          />
          {error ? <p className="text-xs text-rose-300">{error}</p> : null}
          <Button className="w-full" onClick={() => void handleAuth()} disabled={submitting}>
            {isRegister ? <UserPlus className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
            {submitting ? "Please wait..." : isRegister ? "Register" : "Login"}
          </Button>
          <button
            className="w-full text-xs text-muted-foreground hover:text-foreground"
            onClick={() => setIsRegister((v) => !v)}
          >
            {isRegister ? "Already have an account? Login" : "No account? Register"}
          </button>
        </CardContent>
      </Card>
    </div>
  );
}
