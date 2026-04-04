import { useState, type ComponentType } from "react";
import {
  Activity,
  Bot,
  ChevronDown,
  ChevronUp,
  LayoutDashboard,
  Orbit,
  Radio,
  RefreshCw,
  Shield,
  SlidersHorizontal,
  UserCog
} from "lucide-react";
import { useFlightStore } from "@/store/flight-store";
import type { AnalysisMode, TaskInfo } from "@/types/flight";
import { cn } from "@/lib/utils";

type NavItem = {
  mode: AnalysisMode;
  label: string;
  icon: ComponentType<{ className?: string }>;
  requiresTask?: boolean;
  adminOnly?: boolean;
};

type NavSection = {
  title: string;
  items: NavItem[];
};

const sections: NavSection[] = [
  {
    title: "Workspace",
    items: [{ mode: "tasks", label: "Tasks", icon: Radio }]
  },
  {
    title: "Analytics",
    items: [
      { mode: "dashboard", label: "Dashboard", icon: LayoutDashboard, requiresTask: true },
      { mode: "replay", label: "3D Replay", icon: Orbit, requiresTask: true },
      { mode: "charts", label: "Dynamics", icon: Activity, requiresTask: true },
      { mode: "params", label: "Parameters", icon: SlidersHorizontal, requiresTask: true },
      { mode: "diagnostics", label: "AI Diagnostics", icon: Bot, requiresTask: true }
    ]
  },
  {
    title: "Account",
    items: [
      { mode: "profile", label: "Profile", icon: UserCog },
      { mode: "admin", label: "Admin", icon: Shield, adminOnly: true }
    ]
  }
];

type SidebarProps = {
  tasks: TaskInfo[];
  activeTaskId: number | null;
  loadingTasks?: boolean;
  onTaskSelect: (task: TaskInfo) => void;
};

function taskStatusClass(status: TaskInfo["status"]) {
  if (status === "COMPLETED") return "text-emerald-300";
  if (status === "FAILED" || status === "CANCELLED") return "text-rose-300";
  if (status === "PROCESSING") return "text-amber-300";
  return "text-muted-foreground";
}

export function Sidebar({ tasks, activeTaskId, loadingTasks = false, onTaskSelect }: SidebarProps) {
  const mode = useFlightStore((s) => s.mode);
  const setMode = useFlightStore((s) => s.setMode);
  const auth = useFlightStore((s) => s.auth);

  const hasSelectedTask = Boolean(activeTaskId);
  const isAdmin = auth.user?.role?.toUpperCase() === "ADMIN";
  const [tasksExpanded, setTasksExpanded] = useState(false);

  return (
    <aside className="panel-grid w-full border-b border-border/70 p-3 backdrop-blur md:h-screen md:w-80 md:border-b-0 md:border-r">
      <div className="surface-panel h-full rounded-xl p-3">
        <div className="mb-4 flex items-center justify-between md:block">
          <h1 className="text-lg font-bold tracking-wide text-foreground">TRAJECTA</h1>
          <p className="text-xs text-muted-foreground md:mt-1">Flight Intelligence Suite</p>
        </div>

        <div className="space-y-3">
          {sections.map((section, sectionIndex) => {
            const visibleItems = section.items.filter((item) => {
              if (item.adminOnly && !isAdmin) {
                return false;
              }
              if (item.requiresTask && !hasSelectedTask) {
                return false;
              }
              return true;
            });

            if (visibleItems.length === 0) {
              return null;
            }

            return (
              <section key={section.title} className={cn(sectionIndex > 0 ? "surface-divider pt-3" : "")}>
                <p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {section.title}
                </p>
                <nav className="grid grid-cols-2 gap-2 md:grid-cols-1">
                  {visibleItems.map((item, idx) => {
                    const Icon = item.icon;
                    const active = mode === item.mode;
                    return (
                      <button
                        key={item.mode}
                        className={cn(
                          "nav-item animate-rise flex items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition",
                          active
                            ? "nav-item-active text-foreground"
                            : "text-muted-foreground hover:text-foreground"
                        )}
                        style={{ animationDelay: `${idx * 30}ms` }}
                        onClick={() => setMode(item.mode)}
                      >
                        <Icon className="h-4 w-4" />
                        <span>{item.label}</span>
                      </button>
                    );
                  })}
                </nav>
              </section>
            );
          })}
        </div>

        <section className="surface-divider mt-4 pt-4">
          <div className="mb-2 flex items-center justify-between gap-2">
            <button
              className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
              onClick={() => setTasksExpanded((prev) => !prev)}
              type="button"
            >
              <span>My recent tasks</span>
              {tasksExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </button>
            <div className="flex items-center gap-2">
              <span className="rounded-md border border-border/70 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                {tasks.length}
              </span>
              {loadingTasks ? <RefreshCw className="h-3.5 w-3.5 animate-spin text-muted-foreground" /> : null}
            </div>
          </div>

          <div className={cn("overflow-hidden transition-all", tasksExpanded ? "max-h-[340px]" : "max-h-0")}>
            <div className="max-h-[320px] space-y-2 overflow-auto pr-1">
              {tasks.length === 0 ? (
                <p className="text-xs text-muted-foreground">No tasks yet.</p>
              ) : (
                tasks.map((task) => (
                  <button
                    key={task.id}
                    className={cn(
                      "nav-item w-full rounded-md px-2 py-1.5 text-left transition",
                      activeTaskId === task.id
                        ? "nav-item-active"
                        : "hover:border-accent/40"
                    )}
                    onClick={() => onTaskSelect(task)}
                  >
                    <p className="truncate text-xs font-medium">#{task.id} {task.title}</p>
                    <div className="mt-0.5 flex items-center justify-between">
                      <p className={cn("text-[11px]", taskStatusClass(task.status))}>{task.status}</p>
                      {activeTaskId === task.id ? <span className="text-[10px] text-foreground">Selected</span> : null}
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </section>
      </div>
    </aside>
  );
}
