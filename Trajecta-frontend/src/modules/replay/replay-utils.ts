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

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

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
  const lat = Number.isFinite(frame.lat) ? clamp(frame.lat, -90, 90) : 0;
  const lon = Number.isFinite(frame.lon) ? clamp(frame.lon, -180, 180) : 0;
  const alt = Number.isFinite(frame.alt) ? frame.alt : 0;
  return Cartesian3.fromDegrees(lon, lat, alt);
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

export function buildRelativeTrajectory(frames: FlightFrame[]): FlightFrame[] {
  if (frames.length <= 1) {
    return frames;
  }

  const start = frames[0];
  const startLat = Number.isFinite(start.lat) ? start.lat : 0;
  const startLon = Number.isFinite(start.lon) ? start.lon : 0;
  const startAlt = Number.isFinite(start.alt) ? start.alt : 0;

  const earthRadius = 6378137;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const toDeg = (rad: number) => (rad * 180) / Math.PI;

  let east = 0;
  let north = 0;
  let up = 0;
  let velEast = 0;
  let velNorth = 0;
  let velUp = 0;

  let gravityEast = 0;
  let gravityNorth = 0;
  let gravityUp = 9.81;

  const out: FlightFrame[] = [{ ...start }];

  for (let i = 1; i < frames.length; i += 1) {
    const prev = frames[i - 1];
    const current = frames[i];

    const dt = clamp(current.t - prev.t, 1e-3, 0.5);

    const roll = toRad(current.roll ?? 0);
    const pitch = toRad(current.pitch ?? 0);
    const yaw = toRad(current.yaw ?? 0);

    const cphi = Math.cos(roll);
    const sphi = Math.sin(roll);
    const cth = Math.cos(pitch);
    const sth = Math.sin(pitch);
    const cps = Math.cos(yaw);
    const sps = Math.sin(yaw);

    const axBody = current.accelX ?? 0;
    const ayBody = current.accelY ?? 0;
    const azBody = current.accelZ ?? 0;

    // Body FRD -> NED rotation, then NED -> ENU.
    const accNorth = cth * cps * axBody + (sphi * sth * cps - cphi * sps) * ayBody + (cphi * sth * cps + sphi * sps) * azBody;
    const accEast = cth * sps * axBody + (sphi * sth * sps + cphi * cps) * ayBody + (cphi * sth * sps - sphi * cps) * azBody;
    const accDown = -sth * axBody + sphi * cth * ayBody + cphi * cth * azBody;

    const accENU = {
      east: Number.isFinite(accEast) ? accEast : 0,
      north: Number.isFinite(accNorth) ? accNorth : 0,
      up: Number.isFinite(-accDown) ? -accDown : 0
    };

    const gravityAlpha = 0.02;
    gravityEast = gravityEast * (1 - gravityAlpha) + accENU.east * gravityAlpha;
    gravityNorth = gravityNorth * (1 - gravityAlpha) + accENU.north * gravityAlpha;
    gravityUp = gravityUp * (1 - gravityAlpha) + accENU.up * gravityAlpha;

    const linAccEast = accENU.east - gravityEast;
    const linAccNorth = accENU.north - gravityNorth;
    const linAccUp = accENU.up - gravityUp;

    velEast = (velEast + linAccEast * dt) * 0.985;
    velNorth = (velNorth + linAccNorth * dt) * 0.985;
    velUp = (velUp + linAccUp * dt) * 0.985;

    const horizontalSpeedHint = current.speed;
    if (Number.isFinite(horizontalSpeedHint) && (horizontalSpeedHint ?? 0) >= 0) {
      const currentHorizontal = Math.hypot(velEast, velNorth);
      const targetHorizontal = clamp(horizontalSpeedHint ?? 0, 0, 120);
      if (currentHorizontal > 1e-6) {
        const blend = 0.12;
        const scale = ((1 - blend) * currentHorizontal + blend * targetHorizontal) / currentHorizontal;
        velEast *= scale;
        velNorth *= scale;
      }
    }

    if (Number.isFinite(current.climbRate)) {
      velUp = velUp * 0.85 + (current.climbRate ?? 0) * 0.15;
    }

    east += velEast * dt;
    north += velNorth * dt;
    up += velUp * dt;

    const lat = startLat + toDeg(north / earthRadius);
    const lon = startLon + toDeg(east / (earthRadius * Math.max(1e-6, Math.cos(toRad(startLat)))));
    const alt = startAlt + up;

    out.push({
      ...current,
      lat,
      lon,
      alt
    });
  }

  return out;
}

export function buildHybridTrajectory(frames: FlightFrame[]): FlightFrame[] {
  if (frames.length <= 1) {
    return frames;
  }

  const relative = buildRelativeTrajectory(frames);
  const out: FlightFrame[] = [{ ...frames[0] }];

  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const hav = (a: FlightFrame, b: FlightFrame) => {
    const r = 6371000;
    const dLat = toRad(b.lat - a.lat);
    const dLon = toRad(b.lon - a.lon);
    const lat1 = toRad(a.lat);
    const lat2 = toRad(b.lat);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
    return 2 * r * Math.asin(Math.min(1, Math.sqrt(h)));
  };

  const gpsTrustHistory: number[] = [];

  for (let i = 1; i < frames.length; i += 1) {
    const gps = frames[i];
    const gpsPrev = frames[i - 1];
    const ins = relative[i];
    const insPrev = relative[i - 1];

    const dt = clamp(gps.t - gpsPrev.t, 1e-3, 0.5);
    const gpsSpeed = hav(gpsPrev, gps) / dt;
    const insSpeed = hav(insPrev, ins) / dt;
    const speedHint = Number.isFinite(gps.speed) ? Math.abs(gps.speed ?? 0) : gpsSpeed;

    const gpsLooksBad = gpsSpeed > 95 || gpsSpeed > speedHint * 2.8 + 12;
    const insLooksBad = insSpeed > 140;

    let gpsTrust = 0.72;
    if (gpsLooksBad) {
      gpsTrust = 0.1;
    } else if (insLooksBad) {
      gpsTrust = 0.92;
    } else {
      const disagreement = hav(gps, ins);
      gpsTrust = clamp(0.9 - disagreement / 120, 0.2, 0.9);
    }

    gpsTrustHistory.push(gpsTrust);
    const recent = gpsTrustHistory.slice(-12);
    const smoothedTrust = recent.reduce((acc, value) => acc + value, 0) / recent.length;

    out.push({
      ...gps,
      lat: gps.lat * smoothedTrust + ins.lat * (1 - smoothedTrust),
      lon: gps.lon * smoothedTrust + ins.lon * (1 - smoothedTrust),
      alt: gps.alt * smoothedTrust + ins.alt * (1 - smoothedTrust)
    });
  }

  return out;
}
