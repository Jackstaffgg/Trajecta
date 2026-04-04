import { useEffect, useMemo, useRef, useState } from "react";
import {
  Cartesian2,
  Cartesian3,
  CallbackPositionProperty,
  CallbackProperty,
  Color,
  HeadingPitchRoll,
  Ion,
  LabelStyle,
  Matrix4,
  Math as CesiumMath,
  PolylineGlowMaterialProperty,
  Quaternion,
  Viewer as CesiumViewer
} from "cesium";
import { Pause, Play, Camera, Move3D, Rewind, FastForward, RotateCcw } from "lucide-react";
import { useFlightStore } from "@/store/flight-store";
import { interpolateFrame, speedToColor, positionFromFrame } from "@/modules/replay/replay-utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const CESIUM_TOKEN = import.meta.env.VITE_CESIUM_ION_TOKEN as string | undefined;
if (CESIUM_TOKEN) {
  Ion.defaultAccessToken = CESIUM_TOKEN;
}

type EventTone = "critical" | "warning" | "info";

function eventToneFromType(type: string): EventTone {
  const normalized = type.toLowerCase();
  if (/(fail|error|critical|crash|emergency|panic)/.test(normalized)) {
    return "critical";
  }
  if (/(warn|battery|gps|imu|vibe|drift|degrad|limit)/.test(normalized)) {
    return "warning";
  }
  return "info";
}

function eventToneClass(tone: EventTone, isActive: boolean): string {
  if (isActive) {
    return "bg-cyan-300";
  }
  if (tone === "critical") {
    return "bg-rose-300";
  }
  if (tone === "warning") {
    return "bg-amber-300";
  }
  return "bg-sky-300/80";
}

function eventToneColor(tone: EventTone): Color {
  if (tone === "critical") {
    return Color.fromCssColorString("#fb7185");
  }
  if (tone === "warning") {
    return Color.fromCssColorString("#fbbf24");
  }
  return Color.fromCssColorString("#38bdf8");
}

export function FlightReplayView() {
  const data = useFlightStore((s) => s.data);
  const replay = useFlightStore((s) => s.replay);
  const setTime = useFlightStore((s) => s.setReplayTime);
  const setPlaying = useFlightStore((s) => s.setReplayPlaying);
  const setCamera = useFlightStore((s) => s.setReplayCamera);
  const setSpeed = useFlightStore((s) => s.setReplaySpeed);
  const viewerRef = useRef<CesiumViewer | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const interpolatedRef = useRef(interpolateFrame(data?.frames ?? [], replay.timeSec));
  const isPlayingRef = useRef(replay.isPlaying);
  const timeRef = useRef(replay.timeSec);
  const maxTimeRef = useRef(0);
  const hasInitialFramingRef = useRef(false);
  const traceEntityIdsRef = useRef<string[]>([]);
  const eventEntityIdsRef = useRef<string[]>([]);
  const prevCameraModeRef = useRef(replay.camera);
  const chaseAnchorRef = useRef<Cartesian3 | null>(null);
  const [compactHud, setCompactHud] = useState(false);
  const [chaseStyle, setChaseStyle] = useState<"normal" | "cinematic">("normal");
  const [hoveredEventKey, setHoveredEventKey] = useState<string | null>(null);
  const [importantOnly, setImportantOnly] = useState(false);

  const frames = useMemo(
    () =>
      (data?.frames ?? [])
        .filter(
          (f) =>
            Number.isFinite(f.t) &&
            Number.isFinite(f.lat) &&
            Number.isFinite(f.lon) &&
            Math.abs(f.lat) <= 90 &&
            Math.abs(f.lon) <= 180
        )
        .sort((a, b) => a.t - b.t),
    [data?.frames]
  );
  const maxTime = frames.length ? frames[frames.length - 1].t : 0;
  const maxSpeed = data?.metrics.maxSpeed ?? 30;
  const speedPresets = [0.25, 0.5, 1, 2, 4];

  const progressPct = maxTime > 0 ? (replay.timeSec / maxTime) * 100 : 0;
  const eventMarkers = useMemo(
    () =>
      (data?.events ?? [])
        .map((event, index) => ({
          key: `${String(event.id ?? event.type ?? "event")}-${index}`,
          t: Number.isFinite(event.t) ? Math.max(0, Math.min(maxTime, event.t)) : 0,
          label: typeof event.type === "string" ? event.type : "EVENT",
          tone: eventToneFromType(typeof event.type === "string" ? event.type : "EVENT")
        }))
        .filter((event) => maxTime > 0 && Number.isFinite(event.t)),
    [data?.events, maxTime]
  );

  const visibleEventMarkers = useMemo(
    () => (importantOnly ? eventMarkers.filter((event) => event.tone !== "info") : eventMarkers),
    [eventMarkers, importantOnly]
  );

  const nearestEvent = useMemo(() => {
    if (!visibleEventMarkers.length) {
      return null;
    }
    let best = visibleEventMarkers[0];
    let bestDelta = Math.abs(best.t - replay.timeSec);
    for (let i = 1; i < visibleEventMarkers.length; i += 1) {
      const candidate = visibleEventMarkers[i];
      const delta = Math.abs(candidate.t - replay.timeSec);
      if (delta < bestDelta) {
        best = candidate;
        bestDelta = delta;
      }
    }
    return best;
  }, [visibleEventMarkers, replay.timeSec]);

  const chaseLerpAlpha = chaseStyle === "cinematic" ? 0.08 : 0.18;

  function formatReplayTime(sec: number) {
    const s = Math.max(0, Math.floor(sec));
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
  }

  function seekBy(deltaSec: number) {
    const next = Math.max(0, Math.min(maxTime, replay.timeSec + deltaSec));
    setTime(next);
  }

  useEffect(() => {
    if (!replay.isPlaying || maxTime <= 0) {
      return;
    }

    let id = 0;
    let prev = performance.now();
    const loop = (now: number) => {
      const dt = (now - prev) / 1000;
      prev = now;
      const next = replay.timeSec + dt * replay.speed;
      if (next >= maxTime) {
        setTime(maxTime);
        setPlaying(false);
        return;
      }
      setTime(next);
      id = requestAnimationFrame(loop);
    };

    id = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(id);
  }, [replay.isPlaying, replay.speed, replay.timeSec, setTime, setPlaying, maxTime]);

  useEffect(() => {
    isPlayingRef.current = replay.isPlaying;
    timeRef.current = replay.timeSec;
    maxTimeRef.current = maxTime;
  }, [replay.isPlaying, replay.timeSec, maxTime]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) {
        return;
      }

      if (event.code === "Space") {
        event.preventDefault();
        setPlaying(!isPlayingRef.current);
        return;
      }

      if (event.key === "ArrowLeft") {
        event.preventDefault();
        const current = timeRef.current;
        const next = Math.max(0, current + (event.shiftKey ? -10 : -2));
        setTime(next);
        return;
      }

      if (event.key === "ArrowRight") {
        event.preventDefault();
        const current = timeRef.current;
        const next = Math.min(maxTimeRef.current, current + (event.shiftKey ? 10 : 2));
        setTime(next);
        return;
      }

      if (event.key === "1") {
        setCamera("chase");
      } else if (event.key === "2") {
        setCamera("fpv");
      } else if (event.key === "3") {
        setCamera("free");
      } else if (event.key.toLowerCase() === "c") {
        setChaseStyle((prev) => (prev === "normal" ? "cinematic" : "normal"));
      } else if (event.key.toLowerCase() === "r") {
        setTime(0);
        setPlaying(false);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [setCamera, setPlaying, setTime]);

  const interpolated = useMemo(() => interpolateFrame(frames, replay.timeSec), [frames, replay.timeSec]);
  const batteryPct = interpolated.battery ?? 0;
  const batteryTone = batteryPct <= 20 ? "text-rose-300" : batteryPct <= 40 ? "text-amber-200" : "text-emerald-200";

  useEffect(() => {
    interpolatedRef.current = interpolated;
  }, [interpolated]);

  const replayEvents = useMemo(
    () =>
      (data?.events ?? []).map((event, index) => {
        const near = frames.find((f) => Math.abs(f.t - event.t) < 0.2) ?? frames[0];
        const label = typeof event.type === "string" ? event.type : "EVENT";
        return {
          key: `${String(event.id ?? event.type ?? "event")}-${index}`,
          near,
          label,
          tone: eventToneFromType(label)
        };
      }),
    [data?.events, frames]
  );

  const visibleReplayEvents = useMemo(
    () => (importantOnly ? replayEvents.filter((event) => event.tone !== "info") : replayEvents),
    [replayEvents, importantOnly]
  );

  useEffect(() => {
    if (!containerRef.current || viewerRef.current) {
      return;
    }

    const viewer = new CesiumViewer(containerRef.current, {
      timeline: false,
      animation: false,
      baseLayerPicker: false,
      geocoder: false,
      homeButton: false,
      navigationHelpButton: false,
      sceneModePicker: false
    });

    viewerRef.current = viewer;
    viewer.entities.add({
      id: "replay-drone",
      position: new CallbackPositionProperty(() => positionFromFrame(interpolatedRef.current), false),
      orientation: new CallbackProperty(
        () =>
          Quaternion.fromHeadingPitchRoll(
            new HeadingPitchRoll(
              CesiumMath.toRadians(interpolatedRef.current.yaw ?? 0),
              CesiumMath.toRadians(interpolatedRef.current.pitch ?? 0),
              CesiumMath.toRadians(interpolatedRef.current.roll ?? 0)
            )
          ),
        false
      ),
      point: {
        pixelSize: 12,
        color: Color.CYAN,
        outlineColor: Color.BLACK,
        outlineWidth: 2
      }
    });

    return () => {
      viewerRef.current = null;
      viewer.destroy();
    };
  }, []);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) {
      return;
    }

    for (const id of traceEntityIdsRef.current) {
      viewer.entities.removeById(id);
    }
    traceEntityIdsRef.current = [];

    for (let i = 1; i < frames.length; i += 1) {
      const a = frames[i - 1];
      const b = frames[i];
      const avgSpeed = ((a.speed ?? 0) + (b.speed ?? 0)) / 2;
      const id = `trace-${i}`;
      traceEntityIdsRef.current.push(id);
      viewer.entities.add({
        id,
        polyline: {
          positions: [positionFromFrame(a), positionFromFrame(b)],
          width: 4,
          material: new PolylineGlowMaterialProperty({
            glowPower: 0.2,
            taperPower: 0.5,
            color: speedToColor(avgSpeed, maxSpeed)
          })
        }
      });
    }
  }, [frames, maxSpeed]);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) {
      return;
    }

    for (const id of eventEntityIdsRef.current) {
      viewer.entities.removeById(id);
    }
    eventEntityIdsRef.current = [];

    visibleReplayEvents.forEach((event) => {
      if (!event.near) {
        return;
      }
      const id = `event-${event.key}`;
      eventEntityIdsRef.current.push(id);
      viewer.entities.add({
        id,
        position: positionFromFrame(event.near),
        point: {
          pixelSize: 10,
          color: eventToneColor(event.tone),
          outlineColor: Color.BLACK,
          outlineWidth: 2
        },
        label: {
          text: event.label,
          font: "12px Manrope",
          pixelOffset: new Cartesian2(0, -30),
          fillColor: Color.WHITE,
          style: LabelStyle.FILL_AND_OUTLINE,
          outlineColor: Color.BLACK,
          outlineWidth: 2
        }
      });
    });
  }, [visibleReplayEvents]);

  useEffect(() => {
    hasInitialFramingRef.current = false;
  }, [frames]);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || !frames.length || hasInitialFramingRef.current) {
      return;
    }

    hasInitialFramingRef.current = true;
    viewer.camera.flyTo({
      destination: positionFromFrame(frames[0])
    });
  }, [frames]);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) {
      return;
    }

    const pos = positionFromFrame(interpolated);
    const yaw = CesiumMath.toRadians(interpolated.yaw ?? 0);
    const pitch = CesiumMath.toRadians(interpolated.pitch ?? 0);

    if (replay.camera === "chase") {
      if (!chaseAnchorRef.current) {
        chaseAnchorRef.current = Cartesian3.clone(pos);
      } else {
        Cartesian3.lerp(chaseAnchorRef.current, pos, chaseLerpAlpha, chaseAnchorRef.current);
      }
      viewer.camera.lookAt(chaseAnchorRef.current, new Cartesian3(-60 * Math.cos(yaw), -60 * Math.sin(yaw), 25));
    } else if (replay.camera === "fpv") {
      chaseAnchorRef.current = null;
      viewer.camera.setView({
        destination: pos,
        orientation: {
          heading: yaw,
          pitch,
          roll: CesiumMath.toRadians(interpolated.roll ?? 0)
        }
      });
    } else if (prevCameraModeRef.current !== "free") {
      chaseAnchorRef.current = null;
      viewer.camera.lookAtTransform(Matrix4.IDENTITY);
    }

    prevCameraModeRef.current = replay.camera;
  }, [interpolated, replay.camera, chaseLerpAlpha]);

  function recenterCamera() {
    const viewer = viewerRef.current;
    if (!viewer) {
      return;
    }
    viewer.camera.flyTo({ destination: positionFromFrame(interpolatedRef.current) });
  }

  if (!frames.length) {
    return <p className="text-sm text-muted-foreground">No frames found for replay.</p>;
  }

  return (
    <div className="space-y-3">
      <div className="relative h-[62vh] overflow-hidden rounded-xl border border-border">
        <div ref={containerRef} className="h-full w-full" />

        <div className="absolute right-3 top-3">
          <Button variant="outline" size="sm" onClick={() => setCompactHud((v) => !v)}>
            {compactHud ? "Full HUD" : "Compact HUD"}
          </Button>
        </div>

        <div className="absolute left-3 top-3 flex flex-wrap gap-2">
          <div className="telemetry-pill rounded-md px-2 py-1 text-xs">Alt: {(interpolated.alt ?? 0).toFixed(1)} m</div>
          <div className="telemetry-pill rounded-md px-2 py-1 text-xs">Speed: {(interpolated.speed ?? 0).toFixed(1)} m/s</div>
          <div className={`telemetry-pill rounded-md px-2 py-1 text-xs ${batteryTone}`}>Battery: {batteryPct.toFixed(0)}%</div>
          {!compactHud ? (
            <>
              <div className="telemetry-pill rounded-md px-2 py-1 text-xs">Mode: {replay.camera.toUpperCase()}</div>
              <div className="telemetry-pill rounded-md px-2 py-1 text-xs">R/P/Y: {(interpolated.roll ?? 0).toFixed(1)} / {(interpolated.pitch ?? 0).toFixed(1)} / {(interpolated.yaw ?? 0).toFixed(1)}</div>
            </>
          ) : null}
        </div>
      </div>

      <div className="grid gap-3 rounded-xl border border-border bg-card/80 p-3 md:grid-cols-[auto_1fr_auto] md:items-center">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => seekBy(-5)}>
            <Rewind className="h-4 w-4" />
            -5s
          </Button>
          <Button size="sm" onClick={() => setPlaying(!replay.isPlaying)}>
            {replay.isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            {replay.isPlaying ? "Pause" : "Play"}
          </Button>
          <Button variant="outline" size="sm" onClick={() => seekBy(5)}>
            <FastForward className="h-4 w-4" />
            +5s
          </Button>
          <Button variant="outline" size="sm" onClick={() => { setTime(0); setPlaying(false); }}>
            <RotateCcw className="h-4 w-4" />
            Reset
          </Button>
          <Button variant="outline" size="sm" onClick={recenterCamera}>
            <Camera className="h-4 w-4" />
            Recenter
          </Button>
          <Badge>{formatReplayTime(replay.timeSec)} / {formatReplayTime(maxTime)}</Badge>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{replay.isPlaying ? "Playing" : replay.timeSec >= maxTime ? "Ended" : "Paused"}</span>
            <span>{progressPct.toFixed(1)}% · left {formatReplayTime(maxTime - replay.timeSec)}</span>
          </div>
          <div className="relative">
            <div className="absolute -top-2 left-0 right-0 h-2">
              {visibleEventMarkers.map((event) => (
                <button
                  key={event.key}
                  type="button"
                  className={`absolute h-2 w-[3px] rounded ${eventToneClass(event.tone, nearestEvent?.key === event.key)}`}
                  style={{ left: `${(event.t / Math.max(1e-6, maxTime)) * 100}%` }}
                  onMouseEnter={() => setHoveredEventKey(event.key)}
                  onMouseLeave={() => setHoveredEventKey((prev) => (prev === event.key ? null : prev))}
                  onClick={() => setTime(event.t)}
                  title={`${event.label} @ ${formatReplayTime(event.t)}`}
                />
              ))}
            </div>
            <input
              className="h-1.5 w-full cursor-pointer appearance-none rounded bg-muted"
              type="range"
              min={0}
              max={maxTime}
              step={0.01}
              value={replay.timeSec}
              onChange={(e) => setTime(Number(e.target.value))}
            />
          </div>
          <div className="text-[11px] text-muted-foreground">
            {(() => {
              const active = visibleEventMarkers.find((event) => event.key === hoveredEventKey) ?? nearestEvent;
              if (!active) {
                return "No events on timeline";
              }
              return `Nearest event: ${active.label} (${active.tone}) @ ${formatReplayTime(active.t)}`;
            })()}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          {speedPresets.map((preset) => (
            <Button
              key={preset}
              variant={replay.speed === preset ? "default" : "outline"}
              size="sm"
              onClick={() => setSpeed(preset)}
            >
              {preset}x
            </Button>
          ))}
          <Button variant={replay.camera === "chase" ? "default" : "outline"} size="sm" onClick={() => setCamera("chase")}>
            <Camera className="h-3.5 w-3.5" /> Chase
          </Button>
          <Button variant={replay.camera === "fpv" ? "default" : "outline"} size="sm" onClick={() => setCamera("fpv")}>
            <Camera className="h-3.5 w-3.5" /> FPV
          </Button>
          <Button variant={replay.camera === "free" ? "default" : "outline"} size="sm" onClick={() => setCamera("free")}>
            <Move3D className="h-3.5 w-3.5" /> Free
          </Button>
          <Button variant={chaseStyle === "cinematic" ? "default" : "outline"} size="sm" onClick={() => setChaseStyle((prev) => (prev === "normal" ? "cinematic" : "normal"))}>
            {chaseStyle === "cinematic" ? "Cinematic Chase" : "Normal Chase"}
          </Button>
          <Button variant={importantOnly ? "default" : "outline"} size="sm" onClick={() => setImportantOnly((prev) => !prev)}>
            {importantOnly ? "Important Only" : "All Events"}
          </Button>
          <span className="text-[11px] text-rose-300">Critical</span>
          <span className="text-[11px] text-amber-200">Warning</span>
          <span className="text-[11px] text-sky-300">Info</span>
          <span className="text-[11px] text-muted-foreground">Keys: Space, ←/→, Shift+←/→, 1/2/3, C, R</span>
        </div>
      </div>
    </div>
  );
}
