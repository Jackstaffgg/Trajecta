import { useEffect, useMemo, useRef } from "react";
import {
  Cartesian2,
  Cartesian3,
  CallbackPositionProperty,
  CallbackProperty,
  Color,
  Ion,
  LabelStyle,
  Matrix4,
  Math as CesiumMath,
  PolylineGlowMaterialProperty,
  Quaternion,
  HeadingPitchRoll,
  VerticalOrigin,
  Viewer as CesiumViewer
} from "cesium";
import {
  Viewer,
  Entity,
  PolylineGraphics,
  ModelGraphics,
  BillboardGraphics,
  LabelGraphics,
  type CesiumComponentRef
} from "resium";
import { Pause, Play, Camera, Move3D } from "lucide-react";
import { useFlightStore } from "@/store/flight-store";
import { interpolateFrame, speedToColor, positionFromFrame } from "@/modules/replay/replay-utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const CESIUM_TOKEN = import.meta.env.VITE_CESIUM_ION_TOKEN as string | undefined;
if (CESIUM_TOKEN) {
  Ion.defaultAccessToken = CESIUM_TOKEN;
}

export function FlightReplayView() {
  const data = useFlightStore((s) => s.data);
  const replay = useFlightStore((s) => s.replay);
  const setTime = useFlightStore((s) => s.setReplayTime);
  const setPlaying = useFlightStore((s) => s.setReplayPlaying);
  const setCamera = useFlightStore((s) => s.setReplayCamera);
  const viewerRef = useRef<CesiumViewer | null>(null);
  const resiumRef = useRef<CesiumComponentRef<CesiumViewer> | null>(null);

  const frames = data?.frames ?? [];
  const maxTime = frames.length ? frames[frames.length - 1].t : 0;
  const maxSpeed = data?.metrics.maxSpeed ?? 30;

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

  const interpolated = useMemo(() => interpolateFrame(frames, replay.timeSec), [frames, replay.timeSec]);

  const traceSegments = useMemo(() => {
    const parts: Array<{ positions: Cartesian3[]; color: Color }> = [];
    for (let i = 1; i < frames.length; i += 1) {
      const a = frames[i - 1];
      const b = frames[i];
      parts.push({
        positions: [positionFromFrame(a), positionFromFrame(b)],
        color: speedToColor((a.speed ?? 0 + (b.speed ?? 0)) / 2, maxSpeed)
      });
    }
    return parts;
  }, [frames, maxSpeed]);

  useEffect(() => {
    viewerRef.current = resiumRef.current?.cesiumElement ?? null;
  }, []);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) {
      return;
    }

    const pos = positionFromFrame(interpolated);
    const yaw = CesiumMath.toRadians(interpolated.yaw ?? 0);
    const pitch = CesiumMath.toRadians(interpolated.pitch ?? 0);

    if (replay.camera === "chase") {
      viewer.camera.lookAt(pos, new Cartesian3(-60 * Math.cos(yaw), -60 * Math.sin(yaw), 25));
    } else if (replay.camera === "fpv") {
      viewer.camera.setView({
        destination: pos,
        orientation: {
          heading: yaw,
          pitch,
          roll: CesiumMath.toRadians(interpolated.roll ?? 0)
        }
      });
    } else {
      viewer.camera.lookAtTransform(Matrix4.IDENTITY);
    }
  }, [interpolated, replay.camera]);

  const orientation = useMemo(
    () =>
      new CallbackProperty(
        () =>
          Quaternion.fromHeadingPitchRoll(
            new HeadingPitchRoll(
              CesiumMath.toRadians(interpolated.yaw ?? 0),
              CesiumMath.toRadians(interpolated.pitch ?? 0),
              CesiumMath.toRadians(interpolated.roll ?? 0)
            )
          ),
        false
      ),
    [interpolated]
  );

  const eventEntities = useMemo(
    () =>
      (data?.events ?? []).map((event, index) => {
        const near = frames.find((f) => Math.abs(f.t - event.t) < 0.2) ?? frames[0];
        if (!near) {
          return null;
        }
        return (
          <Entity key={`${event.id ?? event.type}-${index}`} position={positionFromFrame(near)}>
            <BillboardGraphics
              image="https://cdn-icons-png.flaticon.com/512/1827/1827392.png"
              scale={0.05}
              verticalOrigin={VerticalOrigin.BOTTOM}
            />
            <LabelGraphics
              text={event.type}
              font="12px Manrope"
              pixelOffset={new Cartesian2(0, -30)}
              fillColor={Color.CYAN}
              style={LabelStyle.FILL_AND_OUTLINE}
              outlineColor={Color.BLACK}
              outlineWidth={2}
            />
          </Entity>
        );
      }),
    [data?.events, frames]
  );

  if (!frames.length) {
    return <p className="text-sm text-muted-foreground">No frames found for replay.</p>;
  }

  return (
    <div className="space-y-3">
      <div className="relative h-[62vh] overflow-hidden rounded-xl border border-border">
        <Viewer
          full
          timeline={false}
          animation={false}
          baseLayerPicker={false}
          geocoder={false}
          homeButton={false}
          navigationHelpButton={false}
          sceneModePicker={false}
          ref={resiumRef}
        >
          {traceSegments.map((seg, idx) => (
            <Entity key={idx}>
              <PolylineGraphics
                positions={seg.positions}
                width={4}
                material={new PolylineGlowMaterialProperty({
                  glowPower: 0.2,
                  taperPower: 0.5,
                  color: seg.color
                })}
              />
            </Entity>
          ))}

          <Entity
            name="drone"
            position={
              new CallbackPositionProperty(() => positionFromFrame(interpolated), false)
            }
            orientation={orientation}
          >
            <ModelGraphics
              uri="https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/CesiumDrone/glTF-Binary/CesiumDrone.glb"
              scale={1.2}
              minimumPixelSize={64}
            />
          </Entity>

          {eventEntities}
        </Viewer>

        <div className="absolute left-3 top-3 flex flex-wrap gap-2">
          <div className="telemetry-pill rounded-md px-2 py-1 text-xs">
            Alt MSL: {(interpolated.alt ?? 0).toFixed(1)} m
          </div>
          <div className="telemetry-pill rounded-md px-2 py-1 text-xs">
            Speed: {(interpolated.speed ?? 0).toFixed(1)} m/s
          </div>
          <div className="telemetry-pill rounded-md px-2 py-1 text-xs">
            Battery: {(interpolated.battery ?? 0).toFixed(0)}%
          </div>
          <div className="telemetry-pill rounded-md px-2 py-1 text-xs">
            R/P/Y: {(interpolated.roll ?? 0).toFixed(1)} / {(interpolated.pitch ?? 0).toFixed(1)} / {(interpolated.yaw ?? 0).toFixed(1)}
          </div>
        </div>
      </div>

      <div className="grid gap-3 rounded-xl border border-border bg-card/80 p-3 md:grid-cols-[auto_1fr_auto] md:items-center">
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={() => setPlaying(!replay.isPlaying)}>
            {replay.isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            {replay.isPlaying ? "Pause" : "Play"}
          </Button>
          <Badge>{replay.timeSec.toFixed(1)} s</Badge>
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

        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button variant={replay.camera === "chase" ? "default" : "outline"} size="sm" onClick={() => setCamera("chase")}>
            <Camera className="h-3.5 w-3.5" /> Chase
          </Button>
          <Button variant={replay.camera === "fpv" ? "default" : "outline"} size="sm" onClick={() => setCamera("fpv")}>
            <Camera className="h-3.5 w-3.5" /> FPV
          </Button>
          <Button variant={replay.camera === "free" ? "default" : "outline"} size="sm" onClick={() => setCamera("free")}>
            <Move3D className="h-3.5 w-3.5" /> Free
          </Button>
        </div>
      </div>
    </div>
  );
}
