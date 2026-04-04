import { useEffect, useMemo, useRef } from "react";
import * as echarts from "echarts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useFlightStore } from "@/store/flight-store";

type SeriesDef = {
  label: string;
  color: string;
  accessor: (idx: number) => number;
};

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

  useEffect(() => {
    if (!ref.current) {
      return;
    }
    const chart = echarts.init(ref.current, undefined, { renderer: "canvas" });

    chart.setOption({
      animation: false,
      backgroundColor: "transparent",
      grid: { left: 40, right: 12, top: 14, bottom: 24 },
      xAxis: { type: "value", axisLine: { lineStyle: { color: "#64748b" } } },
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
  }, [id, x, lines, onHover]);

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

  return <div ref={ref} className="h-64 w-full" />;
}

export function FlightChartsView() {
  const data = useFlightStore((s) => s.data);
  const scrubber = useFlightStore((s) => s.replay.timeSec);
  const setScrubber = useFlightStore((s) => s.setReplayTime);

  const x = useMemo(() => data?.frames.map((f) => f.t) ?? [], [data?.frames]);
  const frames = data?.frames ?? [];

  if (!data) {
    return null;
  }

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">Flight Dynamics</h2>
      <Card>
        <CardHeader>
          <CardTitle>Speed (m/s) and Altitude (m)</CardTitle>
        </CardHeader>
        <CardContent>
          <TimelineChart
            id="speed-alt"
            x={x}
            scrubber={scrubber}
            onHover={setScrubber}
            lines={[
              { label: "Speed", color: "#22d3ee", accessor: (i) => frames[i].speed ?? 0 },
              { label: "Altitude", color: "#34d399", accessor: (i) => frames[i].alt ?? 0 }
            ]}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Acceleration (m/s^2)</CardTitle>
        </CardHeader>
        <CardContent>
          <TimelineChart
            id="accel"
            x={x}
            scrubber={scrubber}
            onHover={setScrubber}
            lines={[
              { label: "Accel X", color: "#38bdf8", accessor: (i) => frames[i].accelX ?? 0 },
              { label: "Accel Y", color: "#4ade80", accessor: (i) => frames[i].accelY ?? 0 },
              { label: "Accel Z", color: "#f97316", accessor: (i) => frames[i].accelZ ?? 0 }
            ]}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Attitude (Roll/Pitch/Yaw)</CardTitle>
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
    </div>
  );
}
