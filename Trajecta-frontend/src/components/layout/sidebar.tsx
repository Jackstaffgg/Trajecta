import type { ComponentType } from "react";
import { LayoutDashboard, Orbit, Activity, SlidersHorizontal, Bot, LogOut, RefreshCw } from "lucide-react";
import { useFlightStore } from "@/store/flight-store";
import type { AnalysisMode, TaskInfo } from "@/types/flight";
import { cn } from "@/lib/utils";

const items: Array<{ mode: AnalysisMode; label: string; icon: ComponentType<{ className?: string }> }> = [
  { mode: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { mode: "replay", label: "3D Replay", icon: Orbit },
  { mode: "charts", label: "Dynamics", icon: Activity },
  { mode: "params", label: "Parameters", icon: SlidersHorizontal },
  { mode: "diagnostics", label: "AI Diagnostics", icon: Bot }
];

type SidebarProps = {
  tasks: TaskInfo[];
  activeTaskId: number | null;
  loadingTasks?: boolean;
};

function taskStatusClass(status: TaskInfo["status"]) {
  if (status === "COMPLETED") return "text-emerald-300";
  if (status === "FAILED" || status === "CANCELLED") return "text-rose-300";
  if (status === "PROCESSING") return "text-amber-300";
  return "text-slate-300";
}

function safeText(value: unknown, fallback = "-") {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return fallback;
}

export function Sidebar({ tasks, activeTaskId, loadingTasks = false }: SidebarProps) {
  const mode = useFlightStore((s) => s.mode);
  const setMode = useFlightStore((s) => s.setMode);
  const auth = useFlightStore((s) => s.auth);
  const logout = useFlightStore((s) => s.logout);

  return (
    <aside className="panel-grid w-full border-b border-border/70 bg-slate-950/60 p-3 backdrop-blur md:h-screen md:w-80 md:border-b-0 md:border-r">
      <div className="mb-4 flex items-center justify-between md:block">
        <h1 className="text-lg font-bold tracking-wide text-cyan-300">TRAJECTA</h1>
        <p className="text-xs text-muted-foreground md:mt-1">Flight Intelligence Suite</p>
      </div>
      <nav className="grid grid-cols-2 gap-2 md:grid-cols-1">
        {items.map((item, idx) => {
          const Icon = item.icon;
          const active = mode === item.mode;
          return (
            <button
              key={item.mode}
              className={cn(
                "animate-rise flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition",
                active
                  ? "border-cyan-400/40 bg-cyan-400/10 text-cyan-200"
                  : "border-border bg-card/60 text-muted-foreground hover:text-foreground"
              )}
              style={{ animationDelay: `${idx * 40}ms` }}
              onClick={() => setMode(item.mode)}
            >
              <Icon className="h-4 w-4" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>
      <div className="mt-4 rounded-lg border border-border bg-card/60 p-2 text-xs">
        <p className="font-semibold text-cyan-200">{auth.user?.name ?? "Unknown user"}</p>
        <p className="text-muted-foreground">@{auth.user?.username ?? "unknown"}</p>
        <button
          className="mt-2 flex w-full items-center justify-center gap-1 rounded-md border border-border bg-background/50 px-2 py-1.5 text-muted-foreground transition hover:text-foreground"
          onClick={logout}
        >
          <LogOut className="h-3.5 w-3.5" />
          Logout
        </button>
      </div>

      <section className="mt-4 rounded-lg border border-border bg-card/60 p-3">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">My recent tasks</p>
          {loadingTasks ? <RefreshCw className="h-3.5 w-3.5 animate-spin text-muted-foreground" /> : null}
        </div>
        <div className="space-y-2">
          {tasks.length === 0 ? (
            <p className="text-xs text-muted-foreground">No tasks yet.</p>
          ) : (
            tasks.map((task) => (
              <div
                key={task.id}
                className={cn(
                  "rounded-md border px-2 py-1.5",
                  activeTaskId === task.id ? "border-cyan-400/40 bg-cyan-400/10" : "border-border/70 bg-background/40"
                )}
              >
                <p className="truncate text-xs font-medium">#{safeText(task.id, "?")} {safeText(task.title, "Untitled")}</p>
                <p className={cn("text-[11px]", taskStatusClass(task.status))}>{safeText(task.status, "PENDING")}</p>
              </div>
            ))
          )}
        </div>
      </section>
    </aside>
  );
}
