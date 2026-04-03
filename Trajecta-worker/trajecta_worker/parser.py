from __future__ import annotations

import math
from typing import Any

import numpy as np
from pymavlink import mavutil

from .config import TIME_FIELDS


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


def parse_log(bin_path: str) -> dict[str, Any]:
    log = mavutil.mavlink_connection(bin_path)

    data = {
        "gps": {"t": [], "lat": [], "lon": [], "alt": [], "speed": []},
        "att": {"t": [], "roll": [], "pitch": [], "yaw": []},
        "ctun": {"t": [], "throttle": [], "alt": [], "dalt": []},
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
            data["gps"]["lat"].append(to_float(first_present(md, ["Lat", "lat"])))
            data["gps"]["lon"].append(to_float(first_present(md, ["Lng", "Lon", "lon"])))
            data["gps"]["alt"].append(to_float(first_present(md, ["Alt", "AltMSL", "alt"])))
            data["gps"]["speed"].append(to_float(first_present(md, ["Spd", "GSpd", "Speed", "spd"])))

        elif mtype == "ATT":
            data["att"]["t"].append(t)
            data["att"]["roll"].append(to_float(first_present(md, ["Roll", "roll"])))
            data["att"]["pitch"].append(to_float(first_present(md, ["Pitch", "pitch"])))
            data["att"]["yaw"].append(to_float(first_present(md, ["Yaw", "yaw"])))

        elif mtype == "CTUN":
            data["ctun"]["t"].append(t)
            data["ctun"]["throttle"].append(to_float(first_present(md, ["ThO", "ThrOut", "Thr", "Throttle"])))
            data["ctun"]["alt"].append(to_float(first_present(md, ["Alt", "alt"])))
            data["ctun"]["dalt"].append(to_float(first_present(md, ["DAlt", "dalt"])))

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
            data["baro"]["alt"].append(to_float(first_present(md, ["Alt", "PressAlt", "alt"])))

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
            data["events"].append(
                {
                    "t": t,
                    "type": str(event_type) if event_type is not None else "EV",
                    "value": str(event_value) if event_value is not None else None,
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
