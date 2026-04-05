import { useMemo, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Search } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useLocaleStore } from "@/store/locale-store";
import { useFlightStore } from "@/store/flight-store";
import { tr } from "@/lib/i18n";

export function ParamsTableView() {
  const data = useFlightStore((s) => s.data);
  const locale = useLocaleStore((s) => s.locale);
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
      <CardHeader className="flex flex-col items-stretch gap-3 md:flex-row md:items-center md:justify-between">
        <CardTitle className="min-w-0">{tr(locale, "params.title")}</CardTitle>
        <div className="relative w-full md:max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-10" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={tr(locale, "params.search")} />
        </div>
      </CardHeader>
      <CardContent>
        <div className="mb-2 grid min-w-[760px] grid-cols-[minmax(180px,2fr)_minmax(130px,1fr)_minmax(220px,2fr)] gap-2 border-b border-border pb-2 text-xs uppercase text-muted-foreground">
          <span>{tr(locale, "params.column.name")}</span>
          <span>{tr(locale, "params.column.value")}</span>
          <span>{tr(locale, "params.column.description")}</span>
        </div>
        <div ref={(el) => (parentRef.current = el)} className="h-[62vh] overflow-auto rounded-md border border-border bg-background/40">
          <div className="min-w-[760px]" style={{ height: `${rowVirtualizer.getTotalSize()}px`, position: "relative" }}>
            {rowVirtualizer.getVirtualItems().map((item) => {
              const row = rows[item.index];
              return (
                <div
                  key={item.key}
                  className="absolute left-0 top-0 grid w-full grid-cols-[minmax(180px,2fr)_minmax(130px,1fr)_minmax(220px,2fr)] gap-2 border-b border-border/50 px-3 py-2 text-sm"
                  style={{ transform: `translateY(${item.start}px)` }}
                >
                  <span className="truncate font-mono text-accent" title={row.name}>{row.name}</span>
                  <span className="truncate" title={String(row.value)}>{String(row.value)}</span>
                  <span className="truncate text-muted-foreground" title={tr(locale, "params.description.placeholder")}>{tr(locale, "params.description.placeholder")}</span>
                </div>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
