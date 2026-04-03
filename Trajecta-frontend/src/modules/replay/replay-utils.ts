import {
  Cartesian3,
  Color,
  HeadingPitchRoll,
  JulianDate,
  Math as CesiumMath,
  Quaternion,
  Transforms,
  type Matrix4
} from "cesium";
import type { FlightFrame } from "@/types/flight";

export function findFramePair(frames: FlightFrame[], t: number): [FlightFrame, FlightFrame, number] {
  if (frames.length === 0) {
    const empty: FlightFrame = { t: 0, lat: 0, lon: 0, alt: 0 };
    return [empty, empty, 0];
  }
  if (t <= frames[0].t) {
    return [frames[0], frames[0], 0];
  }
  const last = frames[frames.length - 1];
  if (t >= last.t) {
    return [last, last, 0];
  }

  let lo = 0;
  let hi = frames.length - 1;
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (frames[mid].t < t) {
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }

  const nextIdx = Math.min(lo, frames.length - 1);
  const prevIdx = Math.max(nextIdx - 1, 0);
  const a = frames[prevIdx];
  const b = frames[nextIdx];
  const span = Math.max(1e-6, b.t - a.t);
  const alpha = (t - a.t) / span;
  return [a, b, alpha];
}

export function interpolateFrame(frames: FlightFrame[], t: number): FlightFrame {
  const [a, b, alpha] = findFramePair(frames, t);

  const qa = Quaternion.fromHeadingPitchRoll(
    new HeadingPitchRoll(
      CesiumMath.toRadians(a.yaw ?? 0),
      CesiumMath.toRadians(a.pitch ?? 0),
      CesiumMath.toRadians(a.roll ?? 0)
    )
  );
  const qb = Quaternion.fromHeadingPitchRoll(
    new HeadingPitchRoll(
      CesiumMath.toRadians(b.yaw ?? 0),
      CesiumMath.toRadians(b.pitch ?? 0),
      CesiumMath.toRadians(b.roll ?? 0)
    )
  );
  const qm = Quaternion.slerp(qa, qb, alpha, new Quaternion());
  const hpr = HeadingPitchRoll.fromQuaternion(qm);

  return {
    t,
    lat: CesiumMath.lerp(a.lat, b.lat, alpha),
    lon: CesiumMath.lerp(a.lon, b.lon, alpha),
    alt: CesiumMath.lerp(a.alt, b.alt, alpha),
    speed: CesiumMath.lerp(a.speed ?? 0, b.speed ?? 0, alpha),
    battery: CesiumMath.lerp(a.battery ?? 0, b.battery ?? 0, alpha),
    accelX: CesiumMath.lerp(a.accelX ?? 0, b.accelX ?? 0, alpha),
    accelY: CesiumMath.lerp(a.accelY ?? 0, b.accelY ?? 0, alpha),
    accelZ: CesiumMath.lerp(a.accelZ ?? 0, b.accelZ ?? 0, alpha),
    roll: CesiumMath.toDegrees(hpr.roll),
    pitch: CesiumMath.toDegrees(hpr.pitch),
    yaw: CesiumMath.toDegrees(hpr.heading),
    climbRate: CesiumMath.lerp(a.climbRate ?? 0, b.climbRate ?? 0, alpha)
  };
}

export function speedToColor(speed = 0, maxSpeed = 30) {
  const n = Math.min(1, Math.max(0, speed / Math.max(1, maxSpeed)));
  return Color.fromHsl((0.66 - n * 0.66) * 0.8, 0.9, 0.55, 0.9);
}

export function positionFromFrame(frame: FlightFrame) {
  return Cartesian3.fromDegrees(frame.lon, frame.lat, frame.alt);
}

export function droneModelMatrix(frame: FlightFrame, result?: Matrix4) {
  const pos = positionFromFrame(frame);
  const hpr = new HeadingPitchRoll(
    CesiumMath.toRadians(frame.yaw ?? 0),
    CesiumMath.toRadians(frame.pitch ?? 0),
    CesiumMath.toRadians(frame.roll ?? 0)
  );
  return Transforms.headingPitchRollToFixedFrame(pos, hpr, undefined, undefined, result);
}

export function toJulian(seconds: number) {
  return JulianDate.addSeconds(JulianDate.now(), seconds, new JulianDate());
}
