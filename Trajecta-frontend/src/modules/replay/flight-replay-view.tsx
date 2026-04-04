import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Cartesian3,
  Cartographic,
  CallbackPositionProperty,
  CallbackProperty,
  Color,
  ConstantPositionProperty,
  HeadingPitchRoll,
  Ion,
  Math as CesiumMath,
  Quaternion,
  createWorldTerrainAsync,
  Viewer as CesiumViewer
} from "cesium";
import { Pause, Play, Camera, Move3D, Rewind, FastForward, RotateCcw } from "lucide-react";
import { useFlightStore } from "@/store/flight-store";
import { buildHybridTrajectory, buildRelativeTrajectory, interpolateFrame, speedToColor } from "@/modules/replay/replay-utils";
import { CartesianTraceView } from "@/modules/replay/cartesian-trace-view";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { FlightFrame } from "@/types/flight";

const CESIUM_TOKEN = import.meta.env.VITE_CESIUM_ION_TOKEN as string | undefined;
if (CESIUM_TOKEN) {
  Ion.defaultAccessToken = CESIUM_TOKEN;
}

const TRACE_ENTITY_PREFIX = "trace-segment-";

type EventTone = "critical" | "warning" | "info";
type PositionMode = "absolute" | "relative" | "hybrid";
type VisualizationMode = "geo" | "cartesian";

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

function haversineMeters(a: FlightFrame, b: FlightFrame): number {
  const toRad = (v: number) => (v * Math.PI) / 180;
  const r = 6371000;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * r * Math.asin(Math.min(1, Math.sqrt(h)));
}

function median(values: number[]): number {
  if (!values.length) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
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
  const interpolatedRef = useRef(interpolateFrame([], replay.timeSec));
  const isPlayingRef = useRef(replay.isPlaying);
  const timeRef = useRef(replay.timeSec);
  const maxTimeRef = useRef(0);
  const hasInitialFramingRef = useRef(false);
  const eventEntityIdsRef = useRef<string[]>([]);
  const traceEntityIdsRef = useRef<string[]>([]);
  const droneEntityRef = useRef<ReturnType<CesiumViewer["entities"]["add"]> | null>(null);
  const terrainBiasRef = useRef<number | null>(null);
  const [compactHud, setCompactHud] = useState(false);
  const [chaseStyle, setChaseStyle] = useState<"normal" | "cinematic">("normal");
  const [hoveredEventKey, setHoveredEventKey] = useState<string | null>(null);
  const [importantOnly, setImportantOnly] = useState(false);
  const [positionMode, setPositionMode] = useState<PositionMode>("absolute");
  const [visualizationMode, setVisualizationMode] = useState<VisualizationMode>("geo");

  const allFrames = useMemo(
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

  const { frames, startOffset } = useMemo(() => {
    if (!allFrames.length) {
      return { frames: [] as FlightFrame[], startOffset: 0 };
    }

    const origin = allFrames[0];
    const baseAlt = Number.isFinite(origin.alt) ? origin.alt : 0;
    let activeIndex = 0;

    for (let i = 1; i < allFrames.length; i += 1) {
      const frame = allFrames[i];
      const prev = allFrames[i - 1];
      const dt = Math.max(1e-3, frame.t - prev.t);
      const distFromStart = haversineMeters(origin, frame);
      const horizontalSpeed = Number.isFinite(frame.speed) ? Math.abs(frame.speed ?? 0) : haversineMeters(prev, frame) / dt;
      const absoluteSpeed = Math.hypot(horizontalSpeed, Math.abs(frame.climbRate ?? 0));
      const altitudeGain = Math.abs((frame.alt ?? baseAlt) - baseAlt);

      if (absoluteSpeed > 1.2 || distFromStart > 6 || altitudeGain > 2) {
        activeIndex = Math.max(0, i - 3);
        break;
      }
    }

    const offset = allFrames[activeIndex]?.t ?? 0;
    const trimmed = allFrames.slice(activeIndex).map((frame) => ({
      ...frame,
      t: Math.max(0, frame.t - offset)
    }));

    return { frames: trimmed, startOffset: offset };
  }, [allFrames]);

  const maxTime = frames.length ? frames[frames.length - 1].t : 0;
  const relativeFrames = useMemo(() => buildRelativeTrajectory(frames), [frames]);
  const hybridFrames = useMemo(() => buildHybridTrajectory(frames), [frames]);
  const playbackFrames = useMemo(
    () => (positionMode === "relative" ? relativeFrames : positionMode === "hybrid" ? hybridFrames : frames),
    [frames, hybridFrames, positionMode, relativeFrames]
  );
  const speedPresets = [0.25, 0.5, 1, 2, 4];

  const progressPct = maxTime > 0 ? (replay.timeSec / maxTime) * 100 : 0;
  const eventMarkers = useMemo(
    () =>
      (data?.events ?? [])
        .map((event, index) => ({
          key: `${String(event.id ?? event.type ?? "event")}-${index}`,
          t: Number.isFinite(event.t)
            ? Math.max(0, Math.min(maxTime, (event.t as number) - startOffset))
            : 0,
          label: typeof event.type === "string" ? event.type : "EVENT",
          tone: eventToneFromType(typeof event.type === "string" ? event.type : "EVENT")
        }))
        .filter((event) => maxTime > 0 && Number.isFinite(event.t) && event.t <= maxTime),
    [data?.events, maxTime, startOffset]
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

  const chaseViewFrom = useMemo(
    () =>
      chaseStyle === "cinematic"
        ? new Cartesian3(-140, 0, 55)
        : new Cartesian3(-90, 0, 35),
    [chaseStyle]
  );

  const getTerrainBias = useCallback(() => {
    if (terrainBiasRef.current !== null) {
      return terrainBiasRef.current;
    }

    const viewer = viewerRef.current;
    if (!viewer || !frames.length) {
      return 0;
    }

    const sample = frames.slice(0, Math.min(40, frames.length));
    const deltas: number[] = [];
    for (const frame of sample) {
      if (!Number.isFinite(frame.lat) || !Number.isFinite(frame.lon)) {
        continue;
      }
      const globe = viewer.scene?.globe;
      if (!globe || typeof globe.getHeight !== "function") {
        continue;
      }
      const terrain = globe.getHeight(Cartographic.fromDegrees(frame.lon, frame.lat));
      if (terrain !== undefined && Number.isFinite(terrain)) {
        deltas.push(terrain - (frame.alt ?? 0));
      }
    }
    if (!deltas.length) {
      terrainBiasRef.current = 0;
      return 0;
    }

    const delta = median(deltas);
    terrainBiasRef.current = delta > 3 ? delta + 1.5 : 0;
    return terrainBiasRef.current;
  }, [frames]);

  const alignedAltitudeFromFrame = useCallback((frame: { lat: number; lon: number; alt: number }) => {
    const srcAlt = Number.isFinite(frame.alt) ? frame.alt : 0;
    let alt = srcAlt + getTerrainBias();

    const viewer = viewerRef.current;
    if (viewer && Number.isFinite(frame.lat) && Number.isFinite(frame.lon)) {
      const globe = viewer.scene?.globe;
      const terrain = globe?.getHeight(Cartographic.fromDegrees(frame.lon, frame.lat));
      if (terrain !== undefined && Number.isFinite(terrain)) {
        alt = Math.max(alt, terrain + 0.5);
      }
    }

    return alt;
  }, [getTerrainBias, visualizationMode]);

  const positionFromFrameAligned = useCallback((frame: { lat: number; lon: number; alt: number }) => {
    const lat = Number.isFinite(frame.lat) ? frame.lat : 0;
    const lon = Number.isFinite(frame.lon) ? frame.lon : 0;
    const alt = alignedAltitudeFromFrame({ lat, lon, alt: frame.alt });
    return Cartesian3.fromDegrees(lon, lat, alt);
  }, [alignedAltitudeFromFrame]);

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
    if (replay.timeSec > maxTime && maxTime > 0) {
      setTime(maxTime);
      setPlaying(false);
    }
  }, [maxTime, replay.timeSec, setPlaying, setTime]);

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

  const interpolated = useMemo(
    () => interpolateFrame(playbackFrames, replay.timeSec),
    [playbackFrames, replay.timeSec]
  );
  const terrainAtDrone = (() => {
    const viewer = viewerRef.current;
    if (!viewer) {
      return undefined;
    }

    if (
      visualizationMode !== "geo" ||
      !Number.isFinite(interpolated.lat) ||
      !Number.isFinite(interpolated.lon)
    ) {
      return undefined;
    }

    const globe = viewer.scene?.globe;
    const terrain = globe?.getHeight(Cartographic.fromDegrees(interpolated.lon, interpolated.lat));
    return terrain !== undefined && Number.isFinite(terrain) ? terrain : undefined;
  })();
  const alignedAltitude = alignedAltitudeFromFrame({ lat: interpolated.lat, lon: interpolated.lon, alt: interpolated.alt });
  const altitudeAgl = terrainAtDrone !== undefined ? Math.max(0, alignedAltitude - terrainAtDrone) : Math.max(0, alignedAltitude);
  const horizontalSpeed = Math.max(0, interpolated.speed ?? 0);
  const verticalSpeed = interpolated.climbRate ?? 0;
  const absoluteSpeed = Math.hypot(horizontalSpeed, verticalSpeed);
  const batteryPct = interpolated.battery ?? 0;
  const batteryTone = batteryPct <= 20 ? "text-rose-300" : batteryPct <= 40 ? "text-amber-200" : "text-emerald-200";

  useEffect(() => {
    interpolatedRef.current = interpolated;
  }, [interpolated]);

  const replayEvents = useMemo(
    () =>
      (data?.events ?? []).map((event, index) => {
        const localT = Number.isFinite(event.t) ? Math.max(0, (event.t as number) - startOffset) : 0;
        const near = playbackFrames.find((f) => Math.abs(f.t - localT) < 0.2) ?? playbackFrames[0];
        const label = typeof event.type === "string" ? event.type : "EVENT";
        return {
          key: `${String(event.id ?? event.type ?? "event")}-${index}`,
          near,
          label,
          tone: eventToneFromType(label)
        };
      }),
    [data?.events, playbackFrames, startOffset]
  );

  const visibleReplayEvents = useMemo(
    () => (importantOnly ? replayEvents.filter((event) => event.tone !== "info") : replayEvents),
    [replayEvents, importantOnly]
  );

  const traceSegments = useMemo(() => {
    if (visualizationMode !== "geo") {
      return [] as Array<{ id: string; color: Color; positions: Cartesian3[] }>;
    }

    if (playbackFrames.length < 2) {
      return [] as Array<{ id: string; color: Color; positions: Cartesian3[] }>;
    }

    const maxSamples = 1800;
    const stride = Math.max(1, Math.ceil(playbackFrames.length / maxSamples));
    const sampled = playbackFrames.filter((_, idx) => idx % stride === 0);
    if (sampled[sampled.length - 1] !== playbackFrames[playbackFrames.length - 1]) {
      sampled.push(playbackFrames[playbackFrames.length - 1]);
    }

    const optimized: FlightFrame[] = [];
    for (const frame of sampled) {
      if (!optimized.length) {
        optimized.push(frame);
        continue;
      }
      const prev = optimized[optimized.length - 1];
      if (haversineMeters(prev, frame) >= 1.2 || Math.abs((frame.alt ?? 0) - (prev.alt ?? 0)) >= 0.8) {
        optimized.push(frame);
      }
    }
    if (optimized[optimized.length - 1] !== playbackFrames[playbackFrames.length - 1]) {
      optimized.push(playbackFrames[playbackFrames.length - 1]);
    }

    const maxAbsSpeed = Math.max(
      1,
      ...optimized.map((f) => Math.hypot(Math.abs(f.speed ?? 0), Math.abs(f.climbRate ?? 0)))
    );

    const segments: Array<{ id: string; color: Color; positions: Cartesian3[] }> = [];
    let activeBucket = -1;
    let activePositions: Cartesian3[] = [];

    for (let i = 1; i < optimized.length; i += 1) {
      const current = optimized[i];
      const prev = optimized[i - 1];
      const absSpeed = Math.hypot(Math.abs(current.speed ?? 0), Math.abs(current.climbRate ?? 0));
      const bucket = Math.min(6, Math.floor((absSpeed / maxAbsSpeed) * 7));
      const p0 = positionFromFrameAligned(prev);
      const p1 = positionFromFrameAligned(current);

      if (bucket !== activeBucket) {
        if (activePositions.length >= 2 && activeBucket >= 0) {
          const bucketSpeed = (activeBucket / 6) * maxAbsSpeed;
          segments.push({
            id: `${TRACE_ENTITY_PREFIX}${segments.length}`,
            color: speedToColor(bucketSpeed, maxAbsSpeed),
            positions: activePositions
          });
        }
        activeBucket = bucket;
        activePositions = [p0, p1];
      } else {
        activePositions.push(p1);
      }
    }

    if (activePositions.length >= 2 && activeBucket >= 0) {
      const bucketSpeed = (activeBucket / 6) * maxAbsSpeed;
      segments.push({
        id: `${TRACE_ENTITY_PREFIX}${segments.length}`,
        color: speedToColor(bucketSpeed, maxAbsSpeed),
        positions: activePositions
      });
    }

    return segments;
  }, [playbackFrames, positionFromFrameAligned, visualizationMode]);

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
    viewer.scene.globe.depthTestAgainstTerrain = true;

    void createWorldTerrainAsync()
      .then((terrainProvider) => {
        if (!viewer.isDestroyed()) {
          viewer.scene.terrainProvider = terrainProvider;
          terrainBiasRef.current = null;
        }
      })
      .catch(() => {
        // Keep default ellipsoid terrain if world terrain cannot be loaded.
      });

    viewerRef.current = viewer;
    const droneEntity = viewer.entities.add({
      id: "replay-drone",
      position: new CallbackPositionProperty(() => positionFromFrameAligned(interpolatedRef.current), false),
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
    droneEntityRef.current = droneEntity;

    return () => {
      droneEntityRef.current = null;
      viewerRef.current = null;
      viewer.destroy();
    };
  }, [positionFromFrameAligned]);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) {
      return;
    }

    for (const id of traceEntityIdsRef.current) {
      viewer.entities.removeById(id);
    }
    traceEntityIdsRef.current = [];

    for (const segment of traceSegments) {
      traceEntityIdsRef.current.push(segment.id);
      viewer.entities.add({
        id: segment.id,
        polyline: {
          positions: segment.positions,
          width: 3,
          material: segment.color
        }
      });
    }
  }, [traceSegments]);

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
        position: positionFromFrameAligned(event.near),
        point: {
          pixelSize: 7,
          color: eventToneColor(event.tone),
          outlineColor: Color.BLACK,
          outlineWidth: 2
        }
      });
    });
  }, [visibleReplayEvents, positionFromFrameAligned]);

  useEffect(() => {
    hasInitialFramingRef.current = false;
    terrainBiasRef.current = null;
  }, [playbackFrames, visualizationMode]);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || !playbackFrames.length || hasInitialFramingRef.current) {
      return;
    }

    hasInitialFramingRef.current = true;
    viewer.camera.flyTo({
      destination: positionFromFrameAligned(playbackFrames[0])
    });
  }, [playbackFrames, positionFromFrameAligned]);

  useEffect(() => {
    const viewer = viewerRef.current;
    const droneEntity = droneEntityRef.current;
    if (!viewer || !droneEntity) {
      return;
    }

    if (replay.camera === "chase") {
      droneEntity.viewFrom = new ConstantPositionProperty(Cartesian3.clone(chaseViewFrom));
      if (viewer.trackedEntity !== droneEntity) {
        viewer.trackedEntity = droneEntity;
      }
      return;
    }

    if (viewer.trackedEntity) {
      viewer.trackedEntity = undefined;
    }
  }, [replay.camera, chaseViewFrom]);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || replay.camera !== "fpv") {
      return;
    }

    const pos = positionFromFrameAligned(interpolated);
    const yaw = CesiumMath.toRadians(interpolated.yaw ?? 0);
    const pitch = CesiumMath.toRadians(interpolated.pitch ?? 0);

    viewer.camera.setView({
      destination: pos,
      orientation: {
        heading: yaw,
        pitch,
        roll: CesiumMath.toRadians(interpolated.roll ?? 0)
      }
    });
  }, [interpolated, replay.camera, positionFromFrameAligned]);

  function recenterCamera() {
    const viewer = viewerRef.current;
    if (!viewer) {
      return;
    }

    const droneEntity = droneEntityRef.current;
    if (replay.camera === "chase" && droneEntity) {
      droneEntity.viewFrom = new ConstantPositionProperty(Cartesian3.clone(chaseViewFrom));
      viewer.trackedEntity = undefined;
      viewer.trackedEntity = droneEntity;
      return;
    }

    viewer.camera.flyTo({ destination: positionFromFrameAligned(interpolatedRef.current) });
  }

  if (!playbackFrames.length) {
    return <p className="text-sm text-muted-foreground">No frames found for replay.</p>;
  }

  return (
    <div className="space-y-3">
      <div className="relative h-[62vh] overflow-hidden rounded-xl border border-border">
        {visualizationMode === "geo" ? (
          <div ref={containerRef} className="h-full w-full" />
        ) : (
          <CartesianTraceView frames={playbackFrames} currentFrame={interpolated} />
        )}

        <div className="absolute right-3 top-3">
          <Button variant="outline" size="sm" onClick={() => setCompactHud((v) => !v)}>
            {compactHud ? "Full HUD" : "Compact HUD"}
          </Button>
        </div>

        <div className="absolute left-3 top-3 flex flex-wrap gap-2">
          <div className="telemetry-pill rounded-md px-2 py-1 text-xs">Alt AGL: {altitudeAgl.toFixed(1)} m</div>
          <div className="telemetry-pill rounded-md px-2 py-1 text-xs">Alt MSL: {alignedAltitude.toFixed(1)} m</div>
          <div className="telemetry-pill rounded-md px-2 py-1 text-xs">Speed ABS: {absoluteSpeed.toFixed(1)} m/s</div>
          <div className="telemetry-pill rounded-md px-2 py-1 text-xs">Speed H/V: {horizontalSpeed.toFixed(1)} / {verticalSpeed.toFixed(1)} m/s</div>
          <div className={`telemetry-pill rounded-md px-2 py-1 text-xs ${batteryTone}`}>Battery: {batteryPct.toFixed(0)}%</div>
          {!compactHud ? (
            <>
              <div className="telemetry-pill rounded-md px-2 py-1 text-xs">Mode: {replay.camera.toUpperCase()}</div>
              <div className="telemetry-pill rounded-md px-2 py-1 text-xs">R/P/Y: {(interpolated.roll ?? 0).toFixed(1)} / {(interpolated.pitch ?? 0).toFixed(1)} / {(interpolated.yaw ?? 0).toFixed(1)}</div>
            </>
          ) : null}
        </div>
      </div>

      <div className="space-y-3 rounded-xl border border-border bg-card/80 p-3">
        <div className="grid gap-3 lg:grid-cols-3">
          <section className="rounded-lg border border-border/70 bg-background/30 p-3">
            <p className="mb-2 text-[11px] uppercase tracking-wide text-muted-foreground">Playback</p>
            <div className="flex flex-wrap items-center gap-2">
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
            </div>
            <div className="mt-2">
              <Badge>{formatReplayTime(replay.timeSec)} / {formatReplayTime(maxTime)}</Badge>
            </div>
          </section>

          <section className="rounded-lg border border-border/70 bg-background/30 p-3 lg:col-span-2">
            <p className="mb-2 text-[11px] uppercase tracking-wide text-muted-foreground">Timeline</p>
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
          </section>
        </div>

        <section className="rounded-lg border border-border/70 bg-background/30 p-3">
          <p className="mb-2 text-[11px] uppercase tracking-wide text-muted-foreground">Camera and Filters</p>
          <div className="flex flex-wrap items-center gap-2">
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
            <Button variant={positionMode === "absolute" ? "default" : "outline"} size="sm" onClick={() => setPositionMode("absolute") }>
              GPS Absolute
            </Button>
            <Button variant={positionMode === "relative" ? "default" : "outline"} size="sm" onClick={() => setPositionMode("relative") }>
              Relative INS
            </Button>
            <Button variant={positionMode === "hybrid" ? "default" : "outline"} size="sm" onClick={() => setPositionMode("hybrid") }>
              Hybrid GPS+INS
            </Button>
            <Button variant={visualizationMode === "geo" ? "default" : "outline"} size="sm" onClick={() => setVisualizationMode("geo") }>
              Geo Globe
            </Button>
            <Button variant={visualizationMode === "cartesian" ? "default" : "outline"} size="sm" onClick={() => setVisualizationMode("cartesian") }>
              Cartesian 3D
            </Button>
            <span className="text-[11px] text-rose-300">Critical</span>
            <span className="text-[11px] text-amber-200">Warning</span>
            <span className="text-[11px] text-sky-300">Info</span>
            <span className="text-[11px] text-muted-foreground">Trace color: blue (slow) to red (fast)</span>
            <span className="text-[11px] text-muted-foreground">Position mode: {positionMode === "absolute" ? "GPS absolute" : positionMode === "relative" ? "Relative INS from start" : "Hybrid GPS+INS"}</span>
            <span className="text-[11px] text-muted-foreground">Viz: {visualizationMode === "geo" ? "Geographic globe" : "Standalone Cartesian 3D"}</span>
            <span className="text-[11px] text-muted-foreground">Keys: Space, ←/→, Shift+←/→, 1/2/3, C, R</span>
          </div>
        </section>
      </div>
    </div>
  );
}
