import { useEffect, useMemo, useRef, useState } from "react";
import * as echarts from "echarts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useLocaleStore } from "@/store/locale-store";
import { useFlightStore } from "@/store/flight-store";
import { tr } from "@/lib/i18n";

type SeriesDef = {
  label: string;
  color: string;
  accessor: (idx: number) => number;
};

function finiteOrZero(value: number | undefined) {
  return Number.isFinite(value) ? (value as number) : 0;
}

function TimelineChart({
  id,
  x,
  lines,
  scrubber,
  onHover
}: {
  id: string;
  x: number[];
  lines: SeriesDef[];
  scrubber: number;
  onHover: (t: number) => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [windowSize, setWindowSize] = useState(0);
  const [startIndex, setStartIndex] = useState(0);

  const totalPoints = x.length;
  const minWindow = useMemo(() => Math.max(20, Math.floor(totalPoints * 0.05)), [totalPoints]);

  useEffect(() => {
    if (totalPoints <= 0) {
      setWindowSize(0);
      setStartIndex(0);
      return;
    }
    const initialWindow = Math.max(minWindow, Math.floor(totalPoints * 0.3));
    setWindowSize(Math.min(totalPoints, initialWindow));
    setStartIndex(0);
  }, [totalPoints, minWindow]);

  const safeWindowSize = Math.min(totalPoints, Math.max(1, windowSize || totalPoints));
  const maxStart = Math.max(0, totalPoints - safeWindowSize);
  const safeStart = Math.min(Math.max(0, startIndex), maxStart);
  const endIndex = Math.min(totalPoints - 1, safeStart + safeWindowSize - 1);
  const xMin = x[safeStart] ?? 0;
  const xMax = x[endIndex] ?? x[x.length - 1] ?? 0;

  function handleZoomIn() {
    if (totalPoints <= 0) {
      return;
    }
    const nextWindow = Math.max(minWindow, Math.floor(safeWindowSize * 0.75));
    const center = safeStart + Math.floor(safeWindowSize / 2);
    const nextStart = Math.max(0, Math.min(totalPoints - nextWindow, center - Math.floor(nextWindow / 2)));
    setWindowSize(nextWindow);
    setStartIndex(nextStart);
  }

  function handleZoomOut() {
    if (totalPoints <= 0) {
      return;
    }
    const nextWindow = Math.min(totalPoints, Math.ceil(safeWindowSize * 1.25));
    const center = safeStart + Math.floor(safeWindowSize / 2);
    const nextStart = Math.max(0, Math.min(totalPoints - nextWindow, center - Math.floor(nextWindow / 2)));
    setWindowSize(nextWindow);
    setStartIndex(nextStart);
  }

  useEffect(() => {
    if (!ref.current) {
      return;
    }
    const chart = echarts.init(ref.current, undefined, { renderer: "canvas" });

    chart.setOption({
      animation: false,
      backgroundColor: "transparent",
      grid: { left: 40, right: 12, top: 14, bottom: 24 },
      xAxis: { type: "value", min: xMin, max: xMax, axisLine: { lineStyle: { color: "#64748b" } } },
      yAxis: { type: "value", axisLine: { lineStyle: { color: "#64748b" } }, splitLine: { lineStyle: { color: "#1e293b" } } },
      tooltip: { trigger: "axis" },
      series: lines.map((line) => ({
        name: line.label,
        type: "line",
        showSymbol: false,
        smooth: true,
        lineStyle: { color: line.color, width: 1.8 },
        data: x.map((t, idx) => [t, line.accessor(idx)])
      }))
    });

    const handleResize = () => chart.resize();
    window.addEventListener("resize", handleResize);

    chart.on("updateAxisPointer", (e: unknown) => {
      const payload = e as { axesInfo?: Array<{ value: number }> };
      const value = payload.axesInfo?.[0]?.value;
      if (typeof value === "number") {
        onHover(value);
      }
    });

    return () => {
      window.removeEventListener("resize", handleResize);
      chart.dispose();
    };
  }, [id, x, xMin, xMax, lines, onHover]);

  useEffect(() => {
    if (!ref.current) {
      return;
    }
    const chart = echarts.getInstanceByDom(ref.current);
    if (!chart) {
      return;
    }
    chart.setOption({
      xAxis: { axisPointer: { value: scrubber, status: "show", snap: true } },
      series: lines.map((line) => ({
        name: line.label,
        markLine: {
          symbol: "none",
          animation: false,
          lineStyle: { color: "#22d3ee", width: 1, type: "dashed" },
          data: [{ xAxis: scrubber }]
        }
      }))
    });
  }, [scrubber, lines]);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Button type="button" variant="outline" size="sm" onClick={handleZoomOut}>
          -
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={handleZoomIn}>
          +
        </Button>
        <span className="ml-2 text-xs text-muted-foreground">{safeWindowSize} / {totalPoints}</span>
      </div>
      <div ref={ref} className="h-64 w-full" />
      <input
        type="range"
        min={0}
        max={maxStart}
        value={safeStart}
        onChange={(e) => setStartIndex(Number(e.target.value))}
        className="h-2 w-full cursor-pointer accent-zinc-200"
      />
    </div>
  );
}

export function FlightChartsView() {
  const data = useFlightStore((s) => s.data);
  const locale = useLocaleStore((s) => s.locale);
  const scrubber = useFlightStore((s) => s.replay.timeSec);
  const setScrubber = useFlightStore((s) => s.setReplayTime);

  const x = useMemo(() => data?.frames.map((f) => f.t) ?? [], [data?.frames]);
  const frames = data?.frames ?? [];

  if (!data) {
    return null;
  }

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">{tr(locale, "charts.title")}</h2>
      <Card>
        <CardHeader>
          <CardTitle>{tr(locale, "charts.card.speedAlt")}</CardTitle>
        </CardHeader>
        <CardContent>
          <TimelineChart
            id="speed-alt"
            x={x}
            scrubber={scrubber}
            onHover={setScrubber}
            lines={[
              { label: tr(locale, "charts.series.speed"), color: "#22d3ee", accessor: (i) => frames[i].speed ?? 0 },
              { label: tr(locale, "charts.series.altitude"), color: "#34d399", accessor: (i) => frames[i].alt ?? 0 }
            ]}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{tr(locale, "charts.card.accel")}</CardTitle>
        </CardHeader>
        <CardContent>
          <TimelineChart
            id="accel"
            x={x}
            scrubber={scrubber}
            onHover={setScrubber}
            lines={[
              { label: tr(locale, "charts.series.accelX"), color: "#38bdf8", accessor: (i) => frames[i].accelX ?? 0 },
              { label: tr(locale, "charts.series.accelY"), color: "#4ade80", accessor: (i) => frames[i].accelY ?? 0 },
              { label: tr(locale, "charts.series.accelZ"), color: "#f97316", accessor: (i) => frames[i].accelZ ?? 0 }
            ]}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{tr(locale, "charts.card.attitude")}</CardTitle>
        </CardHeader>
        <CardContent>
          <TimelineChart
            id="attitude"
            x={x}
            scrubber={scrubber}
            onHover={setScrubber}
            lines={[
              { label: "Roll", color: "#2dd4bf", accessor: (i) => frames[i].roll ?? 0 },
              { label: "Pitch", color: "#60a5fa", accessor: (i) => frames[i].pitch ?? 0 },
              { label: "Yaw", color: "#f43f5e", accessor: (i) => frames[i].yaw ?? 0 }
            ]}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{tr(locale, "charts.card.vertical")}</CardTitle>
        </CardHeader>
        <CardContent>
          <TimelineChart
            id="vertical"
            x={x}
            scrubber={scrubber}
            onHover={setScrubber}
            lines={[
              { label: tr(locale, "charts.series.climbRate"), color: "#f59e0b", accessor: (i) => finiteOrZero(frames[i].climbRate) },
              { label: tr(locale, "charts.series.altitude"), color: "#22c55e", accessor: (i) => finiteOrZero(frames[i].alt) }
            ]}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{tr(locale, "charts.card.battery")}</CardTitle>
        </CardHeader>
        <CardContent>
          <TimelineChart
            id="battery"
            x={x}
            scrubber={scrubber}
            onHover={setScrubber}
            lines={[
              { label: tr(locale, "charts.series.battery"), color: "#eab308", accessor: (i) => finiteOrZero(frames[i].battery) }
            ]}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{tr(locale, "charts.card.accelNorm")}</CardTitle>
        </CardHeader>
        <CardContent>
          <TimelineChart
            id="accel-norm"
            x={x}
            scrubber={scrubber}
            onHover={setScrubber}
            lines={[
              {
                label: tr(locale, "charts.series.accelNorm"),
                color: "#a78bfa",
                accessor: (i) => {
                  const ax = finiteOrZero(frames[i].accelX);
                  const ay = finiteOrZero(frames[i].accelY);
                  const az = finiteOrZero(frames[i].accelZ);
                  return Math.sqrt(ax * ax + ay * ay + az * az);
                }
              }
            ]}
          />
        </CardContent>
      </Card>
    </div>
  );
}
