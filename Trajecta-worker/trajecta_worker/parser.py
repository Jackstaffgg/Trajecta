from __future__ import annotations

import math
import os
from typing import Any

import numpy as np
from pymavlink import mavutil

from .config import TIME_FIELDS


DATAFLASH_HEAD1 = 0xA3
DATAFLASH_HEAD2 = 0x95
_DATAFLASH_SIGNATURE = bytes((DATAFLASH_HEAD1, DATAFLASH_HEAD2))
_HEADER_SCAN_BYTES = 64 * 1024


# Common ArduPilot EV identifiers from AP_Logger::LogEvent.
ARDUPILOT_EV_MAP: dict[int, tuple[str, str, str]] = {
    10: ("ARMED", "Vehicle armed", "info"),
    11: ("DISARMED", "Vehicle disarmed", "info"),
    15: ("AUTO_ARMED", "Vehicle auto-armed", "info"),
    17: ("LAND_COMPLETE_MAYBE", "Landing likely complete", "info"),
    18: ("LAND_COMPLETE", "Landing complete", "info"),
    19: ("LOST_GPS", "GPS signal lost", "warning"),
    21: ("FLIP_START", "Flip maneuver started", "info"),
    22: ("FLIP_END", "Flip maneuver ended", "info"),
    25: ("SET_HOME", "Home position updated", "info"),
    26: ("SET_SIMPLE_ON", "Simple mode enabled", "info"),
    27: ("SET_SIMPLE_OFF", "Simple mode disabled", "info"),
    28: ("NOT_LANDED", "Vehicle no longer landed", "info"),
    29: ("SET_SUPERSIMPLE_ON", "Super Simple mode enabled", "info"),
    30: ("AUTOTUNE_INITIALISED", "Autotune initialized", "info"),
    31: ("AUTOTUNE_OFF", "Autotune disabled", "info"),
    32: ("AUTOTUNE_RESTART", "Autotune restarted", "info"),
    33: ("AUTOTUNE_SUCCESS", "Autotune completed successfully", "info"),
    34: ("AUTOTUNE_FAILED", "Autotune failed", "warning"),
    35: ("AUTOTUNE_REACHED_LIMIT", "Autotune reached limit", "warning"),
    36: ("AUTOTUNE_PILOT_TESTING", "Autotune pilot testing phase", "info"),
    37: ("AUTOTUNE_SAVEDGAINS", "Autotune gains saved", "info"),
    38: ("SAVE_TRIM", "Trim values saved", "info"),
    39: ("SAVEWP_ADD_WP", "Waypoint added", "info"),
    41: ("FENCE_ENABLE", "Fence enabled", "info"),
    42: ("FENCE_DISABLE", "Fence disabled", "info"),
    46: ("GRIPPER_GRAB", "Gripper grabbed payload", "info"),
    47: ("GRIPPER_RELEASE", "Gripper released payload", "info"),
    49: ("PARACHUTE_DISABLED", "Parachute disabled", "warning"),
    50: ("PARACHUTE_ENABLED", "Parachute enabled", "warning"),
    51: ("PARACHUTE_RELEASED", "Parachute deployed", "critical"),
    52: ("LANDING_GEAR_DEPLOYED", "Landing gear deployed", "info"),
    53: ("LANDING_GEAR_RETRACTED", "Landing gear retracted", "info"),
    54: ("MOTORS_EMERGENCY_STOPPED", "Emergency motor stop", "critical"),
    55: ("MOTORS_EMERGENCY_STOP_CLEARED", "Emergency motor stop cleared", "warning"),
    60: ("EKF_ALT_RESET", "EKF altitude reset", "warning"),
    61: ("LAND_CANCELLED_BY_PILOT", "Landing cancelled by pilot", "warning"),
    62: ("EKF_YAW_RESET", "EKF yaw reset", "warning"),
    67: ("GPS_PRIMARY_CHANGED", "Primary GPS changed", "warning"),
    73: ("LAND_REPO_ACTIVE", "Land reposition active", "info"),
    74: ("STANDBY_ENABLE", "Standby enabled", "info"),
    75: ("STANDBY_DISABLE", "Standby disabled", "info"),
    76: ("FENCE_ALT_MAX_ENABLE", "Max altitude fence enabled", "info"),
    77: ("FENCE_ALT_MAX_DISABLE", "Max altitude fence disabled", "info"),
    78: ("FENCE_CIRCLE_ENABLE", "Circle fence enabled", "info"),
    79: ("FENCE_CIRCLE_DISABLE", "Circle fence disabled", "info"),
    80: ("FENCE_ALT_MIN_ENABLE", "Min altitude fence enabled", "info"),
    81: ("FENCE_ALT_MIN_DISABLE", "Min altitude fence disabled", "info"),
    82: ("FENCE_POLYGON_ENABLE", "Polygon fence enabled", "info"),
    83: ("FENCE_POLYGON_DISABLE", "Polygon fence disabled", "info"),
    85: ("EK3_SOURCES_SET_TO_PRIMARY", "EKF3 source set switched to primary", "warning"),
    86: ("EK3_SOURCES_SET_TO_SECONDARY", "EKF3 source set switched to secondary", "warning"),
    87: ("EK3_SOURCES_SET_TO_TERTIARY", "EKF3 source set switched to tertiary", "warning"),
    90: ("AIRSPEED_PRIMARY_CHANGED", "Primary airspeed sensor changed", "warning"),
    163: ("SURFACED", "Vehicle surfaced", "info"),
    164: ("NOT_SURFACED", "Vehicle submerged", "info"),
    165: ("BOTTOMED", "Vehicle reached bottom", "warning"),
    166: ("NOT_BOTTOMED", "Vehicle left bottom", "info"),
}


def decode_ardupilot_event(event_id_raw: Any, event_value_raw: Any) -> dict[str, Any]:
    event_id = to_float(event_id_raw)
    event_value = safe_json_value(event_value_raw)
    if event_id is None:
        return {
            "eventId": None,
            "code": "EV_UNKNOWN",
            "type": "EV_UNKNOWN",
            "description": "ArduPilot event with unknown identifier",
            "severity": "info",
            "value": event_value,
        }

    event_id_int = int(event_id)
    code, description, severity = ARDUPILOT_EV_MAP.get(
        event_id_int,
        (
            f"EV_{event_id_int}",
            f"ArduPilot event #{event_id_int}",
            "info",
        ),
    )

    return {
        "eventId": event_id_int,
        "code": code,
        "type": code,
        "description": description,
        "severity": severity,
        "value": event_value,
    }


def to_seconds(msg_dict: dict[str, Any]) -> float | None:
    if msg_dict.get("TimeUS") is not None:
        return float(msg_dict["TimeUS"]) / 1e6
    if msg_dict.get("TimeMS") is not None:
        return float(msg_dict["TimeMS"]) / 1e3
    if msg_dict.get("TimeS") is not None:
        return float(msg_dict["TimeS"])
    if msg_dict.get("T") is not None:
        return float(msg_dict["T"])
    return None


def first_present(msg_dict: dict[str, Any], keys: list[str]) -> Any:
    for key in keys:
        if key in msg_dict and msg_dict[key] is not None:
            return msg_dict[key]
    return None


def to_float(value: Any) -> float | None:
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def normalize_lat(value: float | None) -> float | None:
    if value is None:
        return None
    abs_value = abs(value)
    normalized = value / 1e7 if abs_value > 180 else value
    if abs(normalized) > 90:
        return None
    return normalized


def normalize_lon(value: float | None) -> float | None:
    if value is None:
        return None
    abs_value = abs(value)
    normalized = value / 1e7 if abs_value > 180 else value
    if abs(normalized) > 180:
        return None
    return normalized


def normalize_alt_meters(value: float | None) -> float | None:
    if value is None:
        return None
    # Some logs store altitude in centimeters.
    return value / 100.0 if abs(value) > 10000 else value


def normalize_speed_mps(value: float | None) -> float | None:
    if value is None:
        return None
    # ArduPilot can report speed in cm/s; convert suspiciously large values.
    return value / 100.0 if abs(value) > 120 else value


def normalize_percent(value: float | None) -> float | None:
    if value is None:
        return None
    if 0 <= value <= 1:
        return value * 100.0
    return value


def safe_json_value(value: Any) -> Any:
    if value is None:
        return None
    if isinstance(value, (str, bool)):
        return value
    if isinstance(value, (int, float)):
        if isinstance(value, float) and math.isnan(value):
            return None
        return value
    if isinstance(value, (np.integer, np.floating)):
        if np.isnan(value):
            return None
        return float(value)
    return str(value)


def _validate_dataflash_file(bin_path: str) -> None:
    if not os.path.isfile(bin_path):
        raise ValueError(f"Input file not found: {bin_path}")

    with open(bin_path, "rb") as source:
        header_window = source.read(_HEADER_SCAN_BYTES)

    if len(header_window) < 3:
        raise ValueError("Parse error: file is too short to be a DataFlash BIN log.")

    if _DATAFLASH_SIGNATURE not in header_window:
        raise ValueError("Parse error: invalid DataFlash BIN header (expected 0xA3 0x95 signature).")


def parse_log(bin_path: str) -> dict[str, Any]:
    _validate_dataflash_file(bin_path)
    log = mavutil.mavlink_connection(bin_path)

    data = {
        "gps": {"t": [], "lat": [], "lon": [], "alt": [], "speed": [], "vz": []},
        "att": {"t": [], "roll": [], "pitch": [], "yaw": []},
        "ctun": {"t": [], "throttle": [], "alt": [], "dalt": [], "crt": []},
        "bat": {"t": [], "remainingPct": []},
        "imu": {"t": [], "accx": [], "accy": [], "accz": [], "gyrx": [], "gyry": [], "gyrz": []},
        "vibe": {"t": [], "x": [], "y": [], "z": []},
        "pid": {"t": [], "roll": [], "pitch": [], "yaw": []},
        "baro": {"t": [], "alt": []},
        "gpa": {"t": [], "acc": []},
        "mode": {"t": [], "mode": []},
        "stat_rows": [],
        "pm_rows": [],
        "events": [],
        "params": {},
    }

    while True:
        msg = log.recv_match(blocking=False)
        if msg is None:
            break

        mtype = msg.get_type()
        if mtype in ("FMT", "FMTU", "UNIT", "MULT", "MSG"):
            continue

        md = msg.to_dict()
        t = to_seconds(md)
        if t is None:
            continue

        if mtype == "GPS":
            data["gps"]["t"].append(t)
            data["gps"]["lat"].append(normalize_lat(to_float(first_present(md, ["Lat", "lat"]))))
            data["gps"]["lon"].append(normalize_lon(to_float(first_present(md, ["Lng", "Lon", "lon"]))))
            data["gps"]["alt"].append(normalize_alt_meters(to_float(first_present(md, ["Alt", "AltMSL", "alt"]))))
            data["gps"]["speed"].append(normalize_speed_mps(to_float(first_present(md, ["Spd", "GSpd", "Speed", "spd"]))))
            data["gps"]["vz"].append(normalize_speed_mps(to_float(first_present(md, ["VZ", "Vz", "Climb", "ClimbRate"]))))

        elif mtype == "ATT":
            data["att"]["t"].append(t)
            data["att"]["roll"].append(to_float(first_present(md, ["Roll", "roll"])))
            data["att"]["pitch"].append(to_float(first_present(md, ["Pitch", "pitch"])))
            data["att"]["yaw"].append(to_float(first_present(md, ["Yaw", "yaw"])))

        elif mtype == "CTUN":
            data["ctun"]["t"].append(t)
            data["ctun"]["throttle"].append(to_float(first_present(md, ["ThO", "ThrOut", "Thr", "Throttle"])))
            data["ctun"]["alt"].append(normalize_alt_meters(to_float(first_present(md, ["Alt", "alt"]))))
            data["ctun"]["dalt"].append(normalize_alt_meters(to_float(first_present(md, ["DAlt", "dalt"]))))
            data["ctun"]["crt"].append(normalize_speed_mps(to_float(first_present(md, ["CRt", "ClimbRate", "Vz", "VZ"]))))

        elif mtype.startswith("BAT"):
            data["bat"]["t"].append(t)
            data["bat"]["remainingPct"].append(
                normalize_percent(
                    to_float(
                        first_present(
                            md,
                            ["RemPct", "Remain", "Remaining", "Pct", "Rem", "BatPct", "BattPct"],
                        )
                    )
                )
            )

        elif mtype.startswith("IMU"):
            data["imu"]["t"].append(t)
            data["imu"]["accx"].append(to_float(first_present(md, ["AccX", "Ax", "XAcc"])))
            data["imu"]["accy"].append(to_float(first_present(md, ["AccY", "Ay", "YAcc"])))
            data["imu"]["accz"].append(to_float(first_present(md, ["AccZ", "Az", "ZAcc"])))
            data["imu"]["gyrx"].append(to_float(first_present(md, ["GyrX", "GyroX", "Gx"])))
            data["imu"]["gyry"].append(to_float(first_present(md, ["GyrY", "GyroY", "Gy"])))
            data["imu"]["gyrz"].append(to_float(first_present(md, ["GyrZ", "GyroZ", "Gz"])))

        elif mtype == "VIBE":
            data["vibe"]["t"].append(t)
            data["vibe"]["x"].append(to_float(first_present(md, ["VibeX", "X"])))
            data["vibe"]["y"].append(to_float(first_present(md, ["VibeY", "Y"])))
            data["vibe"]["z"].append(to_float(first_present(md, ["VibeZ", "Z"])))

        elif mtype in ("PID", "PIDR", "PIDP", "PIDY"):
            data["pid"]["t"].append(t)
            if mtype == "PID":
                data["pid"]["roll"].append(to_float(first_present(md, ["Roll", "R"])))
                data["pid"]["pitch"].append(to_float(first_present(md, ["Pitch", "P"])))
                data["pid"]["yaw"].append(to_float(first_present(md, ["Yaw", "Y"])))
            else:
                out_val = to_float(first_present(md, ["Out", "P", "I", "D", "Err", "Tar", "Act"]))
                data["pid"]["roll"].append(out_val if mtype == "PIDR" else np.nan)
                data["pid"]["pitch"].append(out_val if mtype == "PIDP" else np.nan)
                data["pid"]["yaw"].append(out_val if mtype == "PIDY" else np.nan)

        elif mtype == "BARO":
            data["baro"]["t"].append(t)
            data["baro"]["alt"].append(normalize_alt_meters(to_float(first_present(md, ["Alt", "PressAlt", "alt"]))))

        elif mtype == "GPA":
            data["gpa"]["t"].append(t)
            data["gpa"]["acc"].append(to_float(first_present(md, ["Acc", "HAcc", "VAcc", "HDop", "VDop"])))

        elif mtype == "MODE":
            data["mode"]["t"].append(t)
            mode_val = first_present(md, ["Mode", "mode", "ModeNum"])
            data["mode"]["mode"].append(safe_json_value(mode_val) if mode_val is not None else "UNKNOWN")

        elif mtype == "EV":
            event_type = first_present(md, ["Id", "Type", "Event", "id"])
            event_value = first_present(md, ["Value", "Val", "Name", "Reason"])
            decoded_event = decode_ardupilot_event(event_type, event_value)
            data["events"].append(
                {
                    "t": t,
                    **decoded_event,
                }
            )

        elif mtype == "PARM":
            name = first_present(md, ["Name", "name"])
            value = first_present(md, ["Value", "value"])
            if name is not None:
                data["params"][str(name)] = safe_json_value(value)

        elif mtype == "STAT":
            row = {"t": t}
            for key, value in md.items():
                if key in TIME_FIELDS or key == "mavpackettype":
                    continue
                row[key] = safe_json_value(value)
            data["stat_rows"].append(row)

        elif mtype == "PM":
            row = {"t": t}
            for key, value in md.items():
                if key in TIME_FIELDS or key == "mavpackettype":
                    continue
                row[key] = safe_json_value(value)
            data["pm_rows"].append(row)

    data["events"] = sorted(data["events"], key=lambda item: item["t"])
    return data
