import { useEffect, useMemo, useRef, useState } from "react";
import type { FlightFrame } from "@/types/flight";

type Vec3 = { x: number; y: number; z: number };

type CartesianTraceViewProps = {
  frames: FlightFrame[];
  currentFrame: FlightFrame;
};

const BASE_SCALE = 0.6;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function toLocalFrames(frames: FlightFrame[]): Vec3[] {
  if (!frames.length) {
    return [];
  }

  const start = frames[0];
  const cosLat = Math.max(1e-6, Math.cos((start.lat * Math.PI) / 180));
  const metersPerDegLat = 111320;
  const metersPerDegLon = 111320 * cosLat;
  const baseAlt = Number.isFinite(start.alt) ? start.alt : 0;

  return frames.map((frame) => ({
    x: ((frame.lon ?? start.lon) - start.lon) * metersPerDegLon,
    y: ((frame.lat ?? start.lat) - start.lat) * metersPerDegLat,
    z: (Number.isFinite(frame.alt) ? frame.alt : baseAlt) - baseAlt,
  }));
}

function rotatePoint(point: Vec3, yaw: number, pitch: number): Vec3 {
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);

  const x1 = point.x * cy - point.y * sy;
  const y1 = point.x * sy + point.y * cy;
  const z1 = point.z;

  return {
    x: x1,
    y: y1 * cp - z1 * sp,
    z: y1 * sp + z1 * cp,
  };
}

export function CartesianTraceView({ frames, currentFrame }: CartesianTraceViewProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [yaw, setYaw] = useState(-0.8);
  const [pitch, setPitch] = useState(0.55);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{ x: number; y: number; mode: "orbit" | "pan" } | null>(null);

  const localFrames = useMemo(() => toLocalFrames(frames), [frames]);
  const localCurrent = useMemo(() => toLocalFrames([frames[0], currentFrame])[1] ?? { x: 0, y: 0, z: 0 }, [currentFrame, frames]);

  const sceneExtent = useMemo(() => {
    if (!localFrames.length) {
      return 1;
    }
    return localFrames.reduce((max, point) => {
      const norm = Math.max(Math.abs(point.x), Math.abs(point.y), Math.abs(point.z));
      return Math.max(max, norm);
    }, 1);
  }, [localFrames]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }

    const pixelRatio = Math.max(1, window.devicePixelRatio || 1);
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    canvas.width = Math.floor(width * pixelRatio);
    canvas.height = Math.floor(height * pixelRatio);
    ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);

    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#0f172a";
    ctx.fillRect(0, 0, width, height);

    const centerX = width / 2 + pan.x;
    const centerY = height / 2 + pan.y;
    const scale = (Math.min(width, height) / Math.max(1, sceneExtent)) * BASE_SCALE * zoom;

    const project = (point: Vec3) => {
      const r = rotatePoint(point, yaw, pitch);
      return {
        x: centerX + r.x * scale,
        y: centerY - r.z * scale,
        depth: r.y,
      };
    };

    const drawAxis = (to: Vec3, color: string, label: string) => {
      const a = project({ x: 0, y: 0, z: 0 });
      const b = project(to);
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      ctx.fillStyle = color;
      ctx.font = "11px monospace";
      ctx.fillText(label, b.x + 6, b.y - 4);
    };

    const axisSize = Math.max(40, sceneExtent * 0.6);
    drawAxis({ x: axisSize, y: 0, z: 0 }, "#f97316", "X (East)");
    drawAxis({ x: 0, y: axisSize, z: 0 }, "#22c55e", "Y (North)");
    drawAxis({ x: 0, y: 0, z: axisSize }, "#38bdf8", "Z (Up)");

    if (localFrames.length >= 2) {
      const projected = localFrames.map(project);
      ctx.lineWidth = 2;
      for (let i = 1; i < projected.length; i += 1) {
        const p0 = projected[i - 1];
        const p1 = projected[i];
        const speedRatio = i / projected.length;
        ctx.strokeStyle = `hsl(${220 - speedRatio * 220}, 85%, 58%)`;
        ctx.beginPath();
        ctx.moveTo(p0.x, p0.y);
        ctx.lineTo(p1.x, p1.y);
        ctx.stroke();
      }
    }

    const current = project(localCurrent);
    ctx.fillStyle = "#f8fafc";
    ctx.beginPath();
    ctx.arc(current.x, current.y, 5, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#cbd5e1";
    ctx.font = "12px monospace";
    ctx.fillText("Cartesian 3D (independent viewer)", 12, 18);
    ctx.fillText("LMB: orbit | RMB/Shift+LMB: pan | Wheel: zoom", 12, 36);
  }, [localFrames, localCurrent, pan.x, pan.y, pitch, sceneExtent, yaw, zoom]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const onPointerDown = (event: PointerEvent) => {
      const mode = event.button === 2 || event.shiftKey ? "pan" : "orbit";
      dragRef.current = { x: event.clientX, y: event.clientY, mode };
      canvas.setPointerCapture(event.pointerId);
    };

    const onPointerMove = (event: PointerEvent) => {
      if (!dragRef.current) {
        return;
      }
      const dx = event.clientX - dragRef.current.x;
      const dy = event.clientY - dragRef.current.y;
      dragRef.current.x = event.clientX;
      dragRef.current.y = event.clientY;

      if (dragRef.current.mode === "orbit") {
        setYaw((prev) => prev + dx * 0.006);
        setPitch((prev) => clamp(prev + dy * 0.005, -1.45, 1.45));
      } else {
        setPan((prev) => ({ x: prev.x + dx, y: prev.y + dy }));
      }
    };

    const onPointerUp = (event: PointerEvent) => {
      if (dragRef.current) {
        dragRef.current = null;
      }
      if (canvas.hasPointerCapture(event.pointerId)) {
        canvas.releasePointerCapture(event.pointerId);
      }
    };

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const factor = event.deltaY < 0 ? 1.1 : 0.9;
      setZoom((prev) => clamp(prev * factor, 0.2, 8));
    };

    const onContextMenu = (event: MouseEvent) => {
      event.preventDefault();
    };

    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointercancel", onPointerUp);
    canvas.addEventListener("wheel", onWheel, { passive: false });
    canvas.addEventListener("contextmenu", onContextMenu);

    return () => {
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerUp);
      canvas.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("contextmenu", onContextMenu);
    };
  }, []);

  return <canvas ref={canvasRef} className="h-full w-full" />;
}
