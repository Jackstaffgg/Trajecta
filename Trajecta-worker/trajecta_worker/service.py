from __future__ import annotations

import json
import os
from typing import Any

from .config import DEFAULT_MAX_BAD_DATA_MESSAGES, DEFAULT_MAX_PARSE_MESSAGES, DEFAULT_MAX_TIMELINE_FRAMES
from .models import AnalysisMetrics, AnalysisRequest, AnalysisResult, AnalysisStatus
from .parser import parse_log
from .storage import download_raw_for_task, write_json
from .timeline import build_output


def build_result_payload(result: AnalysisResult) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "taskId": result.taskId,
        "status": result.status,
        "errorMessage": result.errorMessage,
    }
    if result.trajectoryObjectKey is not None:
        payload["trajectoryObjectKey"] = result.trajectoryObjectKey
    if result.trajectoryJson is not None:
        payload["trajectoryJson"] = result.trajectoryJson
    if result.metrics is not None:
        payload["metrics"] = {
            "maxAltitude": result.metrics.maxAltitude,
            "maxSpeed": result.metrics.maxSpeed,
            "flightDuration": result.metrics.flightDuration,
            "distance": result.metrics.distance,
        }
    return payload


def run_local_convert(
    input_path: str,
    output_path: str,
    dt: float,
    pretty: bool,
    compress_gzip: bool,
) -> None:
    data = parse_log(input_path)
    payload = build_output(data, dt=dt)
    write_json(payload, output_path, pretty=pretty, compress_gzip=compress_gzip)
    print(f"Converted: {input_path}")
    print(f"Frames: {len(payload['frames'])}")
    print(f"Events: {len(payload['events'])}")
    print(f"Output: {output_path}")
    if compress_gzip:
        print(f"Output (gzip): {output_path}.gz")


def process_request_message(request: AnalysisRequest, dt: float) -> AnalysisResult:
    source_path = None
    should_cleanup = False
    try:
        if dt <= 0:
            raise ValueError("Timeline step dt must be greater than zero.")

        max_parse_messages = int(os.getenv("MAX_PARSE_MESSAGES", str(DEFAULT_MAX_PARSE_MESSAGES)))
        max_bad_data_messages = int(os.getenv("MAX_BAD_DATA_MESSAGES", str(DEFAULT_MAX_BAD_DATA_MESSAGES)))
        max_timeline_frames = int(os.getenv("MAX_TIMELINE_FRAMES", str(DEFAULT_MAX_TIMELINE_FRAMES)))

        source_path, should_cleanup = download_raw_for_task(request.taskId)
        data = parse_log(
            source_path,
            max_messages=max_parse_messages,
            max_bad_data_messages=max_bad_data_messages,
        )
        payload = build_output(data, dt=dt, max_frames=max_timeline_frames)

        metrics = payload.get("metrics", {})
        return AnalysisResult(
            taskId=request.taskId,
            status=AnalysisStatus.COMPLETED,
            trajectoryJson=json.dumps(payload, ensure_ascii=False),
            metrics=AnalysisMetrics(
                maxAltitude=metrics.get("maxAltitude"),
                maxSpeed=metrics.get("maxSpeed"),
                flightDuration=metrics.get("flightDuration"),
                distance=metrics.get("distance"),
            ),
        )
    except Exception as exc:
        return AnalysisResult(
            taskId=request.taskId,
            status=AnalysisStatus.FAILED,
            errorMessage=str(exc),
        )
    finally:
        if should_cleanup and source_path:
            try:
                os.remove(source_path)
            except OSError:
                pass
