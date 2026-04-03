import { useState } from "react";
import { Lock, UserPlus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useFlightStore } from "@/store/flight-store";

export function AuthScreen() {
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const setAuth = useFlightStore((s) => s.setAuth);

  function handleAuth() {
    if (!email || !password) {
      return;
    }
    setAuth({ isAuthenticated: true, email });
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md border-cyan-500/20">
        <CardHeader>
          <CardTitle className="text-xl font-bold text-cyan-200">
            {isRegister ? "Create account" : "Flight Analyst Login"}
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Secure gateway for ArduPilot mission review.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="analyst@team.dev"
          />
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="********"
          />
          <Button className="w-full" onClick={handleAuth}>
            {isRegister ? <UserPlus className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
            {isRegister ? "Register" : "Login"}
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
