import type { ComponentType } from "react";
import { LayoutDashboard, Orbit, Activity, SlidersHorizontal, Bot } from "lucide-react";
import { useFlightStore } from "@/store/flight-store";
import type { AnalysisMode } from "@/types/flight";
import { cn } from "@/lib/utils";

const items: Array<{ mode: AnalysisMode; label: string; icon: ComponentType<{ className?: string }> }> = [
  { mode: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { mode: "replay", label: "3D Replay", icon: Orbit },
  { mode: "charts", label: "Dynamics", icon: Activity },
  { mode: "params", label: "Parameters", icon: SlidersHorizontal },
  { mode: "diagnostics", label: "AI Diagnostics", icon: Bot }
];

export function Sidebar() {
  const mode = useFlightStore((s) => s.mode);
  const setMode = useFlightStore((s) => s.setMode);

  return (
    <aside className="panel-grid w-full border-b border-border/70 bg-slate-950/60 p-3 backdrop-blur md:h-screen md:w-64 md:border-b-0 md:border-r">
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
    </aside>
  );
}
