import { useMemo, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Search } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useFlightStore } from "@/store/flight-store";

export function ParamsTableView() {
  const data = useFlightStore((s) => s.data);
  const [query, setQuery] = useState("");

  const rows = useMemo(() => {
    const params = data?.params ?? {};
    const all = Object.entries(params).map(([name, value]) => ({ name, value }));
    const q = query.trim().toLowerCase();
    if (!q) {
      return all;
    }
    return all.filter((r) => r.name.toLowerCase().includes(q));
  }, [data?.params, query]);

  const parentRef = useState(() => ({ current: null as HTMLDivElement | null }))[0];
  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 42,
    overscan: 12
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle>Parameters Table</CardTitle>
        <div className="relative w-full max-w-sm">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input className="pl-8" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search param" />
        </div>
      </CardHeader>
      <CardContent>
        <div className="mb-2 grid grid-cols-[2fr_1fr_2fr] gap-2 border-b border-border pb-2 text-xs uppercase text-muted-foreground">
          <span>Name</span>
          <span>Value</span>
          <span>Description</span>
        </div>
        <div ref={(el) => (parentRef.current = el)} className="h-[62vh] overflow-auto rounded-md border border-border bg-background/40">
          <div style={{ height: `${rowVirtualizer.getTotalSize()}px`, position: "relative" }}>
            {rowVirtualizer.getVirtualItems().map((item) => {
              const row = rows[item.index];
              return (
                <div
                  key={item.key}
                  className="absolute left-0 top-0 grid w-full grid-cols-[2fr_1fr_2fr] gap-2 border-b border-border/50 px-3 py-2 text-sm"
                  style={{ transform: `translateY(${item.start}px)` }}
                >
                  <span className="font-mono text-cyan-200">{row.name}</span>
                  <span>{String(row.value)}</span>
                  <span className="text-muted-foreground">ArduPilot standard description placeholder</span>
                </div>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
