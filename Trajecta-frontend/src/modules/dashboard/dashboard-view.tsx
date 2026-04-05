import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { t } from "@/lib/i18n";
import { useLocaleStore } from "@/store/locale-store";
import { useFlightStore } from "@/store/flight-store";
import { formatDuration, metersToKm } from "@/lib/utils";

function StatCard({ label, value, unit }: { label: string; value: string | number; unit?: string }) {
  return (
    <Card className="border-white/10 bg-slate-950/45">
      <CardContent className="p-4">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="mt-2 text-3xl font-bold leading-none text-foreground">
          {value}
          {unit ? <span className="ml-1 text-sm text-muted-foreground">{unit}</span> : null}
        </p>
      </CardContent>
    </Card>
  );
}

export function DashboardView() {
  const data = useFlightStore((s) => s.data);
  const locale = useLocaleStore((s) => s.locale);
  if (!data) {
    return null;
  }

  const m = data.metrics;
  const meta = data.metadata;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-semibold">{t(locale, "dashboard.title")}</h2>
        <p className="text-sm text-muted-foreground">{t(locale, "dashboard.subtitle")}</p>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <StatCard label="Max Altitude" value={(m.maxAltitude ?? 0).toFixed(1)} unit="m" />
        <StatCard label="Max Horizontal Speed" value={(m.maxSpeed ?? 0).toFixed(1)} unit="m/s" />
        <StatCard label="Flight Duration" value={formatDuration(m.flightDurationSec ?? 0)} />
        <StatCard label="Total GPS Distance" value={metersToKm(m.totalDistanceMeters ?? 0)} unit="km" />
        <StatCard label="Max Vertical Speed" value={(m.maxVerticalSpeed ?? 0).toFixed(1)} unit="m/s" />
        <StatCard label="IMU Sampling" value={(m.imuRateHz ?? 0).toFixed(0)} unit="Hz" />
      </div>
      <Card className="border-white/10 bg-slate-950/45">
        <CardHeader>
          <CardTitle>Metadata</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm text-muted-foreground md:grid-cols-2">
          <p>Log: <span className="text-foreground">{String(meta.logName ?? "Unknown")}</span></p>
          <p>Vehicle: <span className="text-foreground">{String(meta.vehicleType ?? "Unknown")}</span></p>
          <p>GPS Units: <span className="text-foreground">{String(meta.gpsUnits ?? "WGS84")}</span></p>
          <p>Parser: <span className="text-foreground">{String(meta.parserVersion ?? "N/A")}</span></p>
        </CardContent>
      </Card>
    </div>
  );
}
