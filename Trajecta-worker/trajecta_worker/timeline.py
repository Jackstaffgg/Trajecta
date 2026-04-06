from __future__ import annotations

import math
from typing import Any

import numpy as np
import pandas as pd

from .models import AnalysisMetrics


MAX_REASONABLE_GPS_SPEED_MPS = 200.0


def estimate_sampling_hz(timestamps: list[float]) -> float | None:
    if len(timestamps) < 2:
        return None
    arr = np.array(timestamps, dtype=float)
    diffs = np.diff(arr)
    diffs = diffs[diffs > 0]
    if diffs.size == 0:
        return None
    median_dt = float(np.median(diffs))
    if median_dt <= 0:
        return None
    return float(1.0 / median_dt)


def summarize_parsing(data: dict[str, Any]) -> dict[str, Any]:
    gps_hz = estimate_sampling_hz(data.get("gps", {}).get("t", []))
    imu_hz = estimate_sampling_hz(data.get("imu", {}).get("t", []))
    bat_hz = estimate_sampling_hz(data.get("bat", {}).get("t", []))

    return {
        "messages": {
            "gps": {
                "samplingHz": gps_hz,
                "units": {
                    "lat": "deg",
                    "lon": "deg",
                    "alt": "m",
                    "speed": "m/s",
                    "vz": "m/s",
                },
            },
            "bat": {
                "samplingHz": bat_hz,
                "units": {
                    "remainingPct": "%",
                },
            },
            "imu": {
                "samplingHz": imu_hz,
                "units": {
                    "accx": "m/s^2",
                    "accy": "m/s^2",
                    "accz": "m/s^2",
                    "gyrx": "rad/s",
                    "gyry": "rad/s",
                    "gyrz": "rad/s",
                },
            },
        },
        "analysisDataFrame": {
            "gps": {
                "columns": ["t", "lat", "lon", "alt", "speed", "vz"],
                "rows": len(data.get("gps", {}).get("t", [])),
            },
            "bat": {
                "columns": ["t", "remainingPct"],
                "rows": len(data.get("bat", {}).get("t", [])),
            },
            "imu": {
                "columns": ["t", "accx", "accy", "accz", "gyrx", "gyry", "gyrz"],
                "rows": len(data.get("imu", {}).get("t", [])),
            },
        },
    }


def integrate_velocity_trapezoidal(frames: list[dict[str, Any]]) -> dict[str, np.ndarray]:
    n = len(frames)
    if n == 0:
        empty = np.array([], dtype=float)
        return {"vx": empty, "vy": empty, "vz": empty, "horizontal": empty, "total": empty}

    t = np.array([float(frame.get("t", 0.0)) for frame in frames], dtype=float)
    ax = np.array([maybe_float(frame.get("imu", {}).get("accel", [None, None, None])[0]) for frame in frames], dtype=float)
    ay = np.array([maybe_float(frame.get("imu", {}).get("accel", [None, None, None])[1]) for frame in frames], dtype=float)
    az = np.array([maybe_float(frame.get("imu", {}).get("accel", [None, None, None])[2]) for frame in frames], dtype=float)

    def remove_bias(arr: np.ndarray) -> np.ndarray:
        valid = arr[~np.isnan(arr)]
        if valid.size == 0:
            return arr
        return arr - float(np.median(valid))

    ax = remove_bias(ax)
    ay = remove_bias(ay)
    az = remove_bias(az)

    vx = np.zeros(n, dtype=float)
    vy = np.zeros(n, dtype=float)
    vz = np.zeros(n, dtype=float)

    for i in range(1, n):
        dt = t[i] - t[i - 1]
        if not np.isfinite(dt) or dt <= 0:
            dt = 0.0

        a_prev = np.array([ax[i - 1], ay[i - 1], az[i - 1]], dtype=float)
        a_curr = np.array([ax[i], ay[i], az[i]], dtype=float)
        if np.isnan(a_prev).any() or np.isnan(a_curr).any():
            vx[i] = vx[i - 1]
            vy[i] = vy[i - 1]
            vz[i] = vz[i - 1]
            continue

        # Trapezoidal integration for velocity from acceleration arrays.
        v_step = 0.5 * (a_prev + a_curr) * dt
        vx[i] = vx[i - 1] + v_step[0]
        vy[i] = vy[i - 1] + v_step[1]
        vz[i] = vz[i - 1] + v_step[2]

    horizontal = np.sqrt(vx * vx + vy * vy)
    total = np.sqrt(horizontal * horizontal + vz * vz)
    return {"vx": vx, "vy": vy, "vz": vz, "horizontal": horizontal, "total": total}


def as_dataframe(topic_data: dict[str, list[Any]]) -> pd.DataFrame:
    if not topic_data["t"]:
        return pd.DataFrame(columns=list(topic_data.keys()))
    df = pd.DataFrame(topic_data)
    return df.sort_values("t").drop_duplicates(subset="t", keep="last")


def sanitize_gps_dataframe(gps_df: pd.DataFrame) -> pd.DataFrame:
    if gps_df.empty or len(gps_df.index) < 3:
        return gps_df

    sanitized = gps_df.copy().reset_index(drop=True)
    for column in ("t", "lat", "lon", "alt", "speed", "vz"):
        if column in sanitized:
            sanitized[column] = pd.to_numeric(sanitized[column], errors="coerce")

    prev_lat = maybe_float(sanitized.at[0, "lat"]) if "lat" in sanitized else None
    prev_lon = maybe_float(sanitized.at[0, "lon"]) if "lon" in sanitized else None
    prev_t = maybe_float(sanitized.at[0, "t"]) if "t" in sanitized else None

    for i in range(1, len(sanitized.index)):
        t = maybe_float(sanitized.at[i, "t"]) if "t" in sanitized else None
        lat = maybe_float(sanitized.at[i, "lat"]) if "lat" in sanitized else None
        lon = maybe_float(sanitized.at[i, "lon"]) if "lon" in sanitized else None

        if None in (prev_t, prev_lat, prev_lon, t, lat, lon):
            if None not in (t, lat, lon):
                prev_t, prev_lat, prev_lon = t, lat, lon
            continue

        dt = max(1e-3, t - prev_t)
        dist = haversine_m(prev_lat, prev_lon, lat, lon)
        implied_speed = (dist / dt) if dist is not None else 0.0

        # Remove single-point GPS teleports but keep future points recoverable.
        if implied_speed > MAX_REASONABLE_GPS_SPEED_MPS:
            for col in ("lat", "lon", "alt", "speed", "vz"):
                if col in sanitized:
                    sanitized.at[i, col] = np.nan
            continue

        prev_t, prev_lat, prev_lon = t, lat, lon

    return sanitized


def build_uniform_timeline(data: dict[str, Any], dt: float, max_frames: int | None = None) -> np.ndarray:
    starts: list[float] = []
    ends: list[float] = []

    for key in ("gps", "att", "ctun", "bat", "imu", "vibe", "pid", "baro", "gpa", "mode"):
        t = data[key]["t"]
        if t:
            starts.append(float(np.min(t)))
            ends.append(float(np.max(t)))

    if data["stat_rows"]:
        stat_t = [row["t"] for row in data["stat_rows"]]
        starts.append(float(np.min(stat_t)))
        ends.append(float(np.max(stat_t)))

    if data["pm_rows"]:
        pm_t = [row["t"] for row in data["pm_rows"]]
        starts.append(float(np.min(pm_t)))
        ends.append(float(np.max(pm_t)))

    if data["events"]:
        ev_t = [event["t"] for event in data["events"]]
        starts.append(float(np.min(ev_t)))
        ends.append(float(np.max(ev_t)))

    if not starts:
        raise ValueError("No timestamped data found in log.")

    if dt <= 0:
        raise ValueError("Timeline step dt must be greater than zero.")

    start_time = min(starts)
    end_time = max(ends)
    frame_count = int(np.floor((end_time - start_time) / dt)) + 1
    if max_frames is not None and frame_count > max_frames:
        raise ValueError(
            f"Telemetry timeline is too large: expected {frame_count} frames, limit is {max_frames}."
        )

    return np.arange(start_time, end_time + dt * 0.5, dt)


def interpolate_continuous(
    df: pd.DataFrame,
    timeline: np.ndarray,
    columns: list[str],
    angle_columns: list[str] | None = None,
) -> dict[str, np.ndarray]:
    out: dict[str, np.ndarray] = {}
    if df.empty:
        for column in columns:
            out[column] = np.full(timeline.shape, np.nan, dtype=float)
        return out

    t = pd.to_numeric(df["t"], errors="coerce").to_numpy(dtype=float)
    angle_columns = angle_columns or []

    for column in columns:
        v = pd.to_numeric(df[column], errors="coerce").to_numpy(dtype=float)
        valid = ~(np.isnan(t) | np.isnan(v))

        if valid.sum() == 0:
            out[column] = np.full(timeline.shape, np.nan, dtype=float)
            continue

        t_valid = t[valid]
        v_valid = v[valid]

        if len(t_valid) == 1:
            out[column] = np.full(timeline.shape, v_valid[0], dtype=float)
            continue

        if column in angle_columns:
            rad = np.deg2rad(v_valid)
            unwrapped = np.unwrap(rad)
            interp = np.interp(timeline, t_valid, unwrapped)
            wrapped = (interp + np.pi) % (2 * np.pi) - np.pi
            out[column] = np.rad2deg(wrapped)
        else:
            out[column] = np.interp(timeline, t_valid, v_valid)

    return out


def align_discrete_mode(mode_data: dict[str, list[Any]], timeline: np.ndarray) -> np.ndarray:
    if not mode_data["t"]:
        return np.array(["UNKNOWN"] * len(timeline), dtype=object)

    mode_df = pd.DataFrame(mode_data).sort_values("t").drop_duplicates(subset="t", keep="last")
    mode_series = pd.Series(mode_df["mode"].astype(str).to_list(), index=mode_df["t"].to_numpy(dtype=float))
    mode_series = mode_series[~mode_series.index.duplicated(keep="last")].sort_index()
    aligned = mode_series.reindex(timeline, method="ffill")
    return aligned.fillna("UNKNOWN").to_numpy(dtype=object)


def align_structured_rows(rows: list[dict[str, Any]], timeline: np.ndarray, linear_numeric: bool) -> list[dict[str, Any]]:
    if not rows:
        return [{} for _ in timeline]

    df = pd.DataFrame(rows).sort_values("t").drop_duplicates(subset="t", keep="last")
    columns = [column for column in df.columns if column != "t"]
    if not columns:
        return [{} for _ in timeline]

    idx = pd.Index(df["t"].to_numpy(dtype=float), name="t")
    work = df[columns].copy()
    work.index = idx

    all_idx = idx.union(pd.Index(timeline, name="t")).sort_values()
    work = work.reindex(all_idx)

    numeric_cols: list[str] = []
    other_cols: list[str] = []
    for column in work.columns:
        if pd.api.types.is_numeric_dtype(work[column]):
            numeric_cols.append(column)
        else:
            other_cols.append(column)

    if numeric_cols:
        if linear_numeric:
            work[numeric_cols] = work[numeric_cols].interpolate(method="index", limit_direction="both")
        else:
            work[numeric_cols] = work[numeric_cols].ffill().bfill()

    if other_cols:
        work[other_cols] = work[other_cols].ffill().bfill()

    aligned = work.reindex(timeline)
    result: list[dict[str, Any]] = []
    for _, row in aligned.iterrows():
        clean_row: dict[str, Any] = {}
        for key, value in row.items():
            if pd.isna(value):
                clean_row[key] = None
            elif isinstance(value, (np.integer, np.floating)):
                clean_row[key] = float(value)
            else:
                clean_row[key] = value
        result.append(clean_row)
    return result


def maybe_float(value: Any) -> float | None:
    if value is None:
        return None
    if isinstance(value, (np.floating, float)) and np.isnan(value):
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def haversine_m(lat1: float | None, lon1: float | None, lat2: float | None, lon2: float | None) -> float | None:
    if None in (lat1, lon1, lat2, lon2):
        return None
    radius = 6371000.0
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2.0) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2.0) ** 2
    return 2.0 * radius * math.asin(math.sqrt(a))


def track_distance_and_speed(frames: list[dict[str, Any]]) -> tuple[float, float | None]:
    if len(frames) < 2:
        return 0.0, None

    distance = 0.0
    max_speed: float | None = None

    prev = frames[0]
    for frame in frames[1:]:
        prev_t = maybe_float(prev.get("t"))
        cur_t = maybe_float(frame.get("t"))
        dt = (cur_t - prev_t) if prev_t is not None and cur_t is not None else None
        if dt is None or dt <= 0:
            prev = frame
            continue

        lat1 = maybe_float(prev.get("pos", {}).get("lat"))
        lon1 = maybe_float(prev.get("pos", {}).get("lon"))
        lat2 = maybe_float(frame.get("pos", {}).get("lat"))
        lon2 = maybe_float(frame.get("pos", {}).get("lon"))
        segment = haversine_m(lat1, lon1, lat2, lon2)
        if segment is None:
            prev = frame
            continue

        segment_speed = segment / dt
        if not np.isfinite(segment_speed) or segment_speed > MAX_REASONABLE_GPS_SPEED_MPS:
            prev = frame
            continue

        distance += float(segment)
        if max_speed is None or segment_speed > max_speed:
            max_speed = float(segment_speed)

        prev = frame

    return float(distance), max_speed


def compute_metrics(frames: list[dict[str, Any]]) -> AnalysisMetrics:
    if not frames:
        return AnalysisMetrics()

    altitudes = [frame["pos"]["alt"] for frame in frames if frame.get("pos", {}).get("alt") is not None]
    gps_speed = np.array(
        [
            float(frame.get("vel"))
            for frame in frames
            if frame.get("vel") is not None and abs(float(frame.get("vel"))) <= MAX_REASONABLE_GPS_SPEED_MPS
        ],
        dtype=float,
    )
    distance, track_max = track_distance_and_speed(frames)
    gps_max = float(np.nanmax(gps_speed)) if gps_speed.size else None
    speed_candidates = [value for value in (track_max, gps_max) if value is not None and value > 0]
    max_speed = max(speed_candidates) if speed_candidates else None

    return AnalysisMetrics(
        maxAltitude=float(np.nanmax(altitudes)) if altitudes else None,
        maxSpeed=max_speed,
        flightDuration=float(frames[-1]["t"] - frames[0]["t"]) if len(frames) >= 2 else 0.0,
        distance=distance,
    )


def compute_extended_metrics(frames: list[dict[str, Any]]) -> dict[str, float | None]:
    if not frames:
        return {
            "maxHorizontalSpeed": None,
            "maxVerticalSpeed": None,
            "maxAcceleration": None,
            "maxClimbRate": None,
            "totalFlightDuration": 0.0,
            "totalDistance": 0.0,
        }

    accel_norm: list[float] = []
    for frame in frames:
        accel = frame.get("imu", {}).get("accel", [])
        if len(accel) == 3 and all(value is not None for value in accel):
            accel_norm.append(float(np.linalg.norm(np.array(accel, dtype=float))))

    distance, track_max = track_distance_and_speed(frames)

    climb_rates = np.array(
        [
            float(frame.get("climbRate"))
            for frame in frames
            if frame.get("climbRate") is not None
        ],
        dtype=float,
    )
    gps_speed = np.array(
        [
            float(frame.get("vel"))
            for frame in frames
            if frame.get("vel") is not None and abs(float(frame.get("vel"))) <= MAX_REASONABLE_GPS_SPEED_MPS
        ],
        dtype=float,
    )

    gps_max = float(np.nanmax(gps_speed)) if gps_speed.size else None
    horizontal_candidates = [value for value in (track_max, gps_max) if value is not None and value > 0]
    max_horizontal = max(horizontal_candidates) if horizontal_candidates else None

    alt_vertical_rates: list[float] = []
    for i in range(1, len(frames)):
        prev = frames[i - 1]
        curr = frames[i]
        prev_t = maybe_float(prev.get("t"))
        curr_t = maybe_float(curr.get("t"))
        prev_alt = maybe_float(prev.get("pos", {}).get("alt"))
        curr_alt = maybe_float(curr.get("pos", {}).get("alt"))
        if None in (prev_t, curr_t, prev_alt, curr_alt):
            continue
        dt = curr_t - prev_t
        if dt <= 0:
            continue
        vertical = abs((curr_alt - prev_alt) / dt)
        if np.isfinite(vertical) and vertical <= MAX_REASONABLE_GPS_SPEED_MPS:
            alt_vertical_rates.append(float(vertical))

    climb_abs = np.abs(climb_rates)
    climb_abs = climb_abs[np.isfinite(climb_abs)]
    climb_abs = climb_abs[climb_abs <= MAX_REASONABLE_GPS_SPEED_MPS]
    climb_pos = climb_rates[np.isfinite(climb_rates)]
    climb_pos = climb_pos[(climb_pos >= 0) & (climb_pos <= MAX_REASONABLE_GPS_SPEED_MPS)]

    max_vertical = float(np.nanmax(climb_abs)) if climb_abs.size else (max(alt_vertical_rates) if alt_vertical_rates else None)
    max_climb = float(np.nanmax(climb_pos)) if climb_pos.size else (max(alt_vertical_rates) if alt_vertical_rates else None)

    return {
        "maxHorizontalSpeed": max_horizontal,
        "maxVerticalSpeed": max_vertical,
        "maxAcceleration": float(np.nanmax(accel_norm)) if accel_norm else None,
        "maxClimbRate": max_climb,
        "totalFlightDuration": float(frames[-1]["t"] - frames[0]["t"]) if len(frames) >= 2 else 0.0,
        "totalDistance": float(distance),
    }


def build_frames(data: dict[str, Any], timeline: np.ndarray) -> list[dict[str, Any]]:
    gps_df = sanitize_gps_dataframe(as_dataframe(data["gps"]))
    att_df = as_dataframe(data["att"])
    ctun_df = as_dataframe(data["ctun"])
    imu_df = as_dataframe(data["imu"])
    vibe_df = as_dataframe(data["vibe"])
    pid_df = as_dataframe(data["pid"])
    baro_df = as_dataframe(data["baro"])
    gpa_df = as_dataframe(data["gpa"])

    gps = interpolate_continuous(gps_df, timeline, ["lat", "lon", "alt", "speed", "vz"])
    att = interpolate_continuous(att_df, timeline, ["roll", "pitch", "yaw"], angle_columns=["yaw"])
    ctun = interpolate_continuous(ctun_df, timeline, ["throttle", "alt", "dalt", "crt"])
    bat_df = as_dataframe(data["bat"])
    bat = interpolate_continuous(bat_df, timeline, ["remainingPct"])
    imu = interpolate_continuous(imu_df, timeline, ["accx", "accy", "accz", "gyrx", "gyry", "gyrz"])
    vibe = interpolate_continuous(vibe_df, timeline, ["x", "y", "z"])
    pid = interpolate_continuous(pid_df, timeline, ["roll", "pitch", "yaw"])
    baro = interpolate_continuous(baro_df, timeline, ["alt"])
    gpa = interpolate_continuous(gpa_df, timeline, ["acc"])

    mode = align_discrete_mode(data["mode"], timeline)
    stat_aligned = align_structured_rows(data["stat_rows"], timeline, linear_numeric=False)
    pm_aligned = align_structured_rows(data["pm_rows"], timeline, linear_numeric=True)

    frames: list[dict[str, Any]] = []
    for index, t in enumerate(timeline):
        pos_alt = maybe_float(gps["alt"][index])
        if pos_alt is None:
            pos_alt = maybe_float(ctun["alt"][index])
        climb_rate = maybe_float(ctun["crt"][index])
        if climb_rate is None:
            climb_rate = maybe_float(gps["vz"][index])

        frames.append(
            {
                "t": float(t),
                "pos": {
                    "lat": maybe_float(gps["lat"][index]),
                    "lon": maybe_float(gps["lon"][index]),
                    "alt": pos_alt,
                },
                "att": {
                    "roll": maybe_float(att["roll"][index]),
                    "pitch": maybe_float(att["pitch"][index]),
                    "yaw": maybe_float(att["yaw"][index]),
                },
                "vel": maybe_float(gps["speed"][index]),
                "climbRate": climb_rate,
                "battery": maybe_float(bat["remainingPct"][index]),
                "throttle": maybe_float(ctun["throttle"][index]),
                "imu": {
                    "accel": [maybe_float(imu["accx"][index]), maybe_float(imu["accy"][index]), maybe_float(imu["accz"][index])],
                    "gyro": [maybe_float(imu["gyrx"][index]), maybe_float(imu["gyry"][index]), maybe_float(imu["gyrz"][index])],
                },
                "vibe": {
                    "x": maybe_float(vibe["x"][index]),
                    "y": maybe_float(vibe["y"][index]),
                    "z": maybe_float(vibe["z"][index]),
                },
                "pid": {
                    "roll": maybe_float(pid["roll"][index]),
                    "pitch": maybe_float(pid["pitch"][index]),
                    "yaw": maybe_float(pid["yaw"][index]),
                },
                "baro": maybe_float(baro["alt"][index]),
                "stat": stat_aligned[index],
                "pm": pm_aligned[index],
                "gpa": maybe_float(gpa["acc"][index]),
                "mode": str(mode[index]) if mode[index] is not None else "UNKNOWN",
            }
        )

    return frames


def build_output(data: dict[str, Any], dt: float, max_frames: int | None = None) -> dict[str, Any]:
    timeline = build_uniform_timeline(data, dt, max_frames=max_frames)
    frames = build_frames(data, timeline)
    start_time = float(timeline[0])
    end_time = float(timeline[-1])
    metrics = compute_metrics(frames)
    extended_metrics = compute_extended_metrics(frames)
    parsing = summarize_parsing(data)

    return {
        "meta": {
            "start_time": start_time,
            "duration": float(max(0.0, end_time - start_time)),
            "dt": float(dt),
            "parsing": parsing,
        },
        "frames": frames,
        "events": sorted(
            [
                {
                    "t": float(event["t"]),
                    "type": str(event.get("type") or "EVENT"),
                    **({"eventId": int(event["eventId"])} if event.get("eventId") is not None else {}),
                    **({"code": str(event["code"])} if event.get("code") is not None else {}),
                    **({"description": str(event["description"])} if event.get("description") is not None else {}),
                    **({"severity": str(event["severity"])} if event.get("severity") is not None else {}),
                    **({"value": event["value"]} if event.get("value") is not None else {}),
                }
                for event in data["events"]
            ],
            key=lambda item: item["t"],
        ),
        "params": data["params"],
        "metrics": {
            "maxAltitude": metrics.maxAltitude,
            "maxSpeed": metrics.maxSpeed,
            "flightDuration": metrics.flightDuration,
            "distance": metrics.distance,
            "maxHorizontalSpeed": extended_metrics["maxHorizontalSpeed"],
            "maxVerticalSpeed": extended_metrics["maxVerticalSpeed"],
            "maxAcceleration": extended_metrics["maxAcceleration"],
            "maxClimbRate": extended_metrics["maxClimbRate"],
            "totalFlightDuration": extended_metrics["totalFlightDuration"],
            "totalDistance": extended_metrics["totalDistance"],
        },
    }
