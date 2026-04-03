from __future__ import annotations

import os
from typing import Any

from .models import AnalysisMetrics, AnalysisRequest, AnalysisResult, AnalysisStatus
from .parser import parse_log
from .storage import download_source_object, result_key_for_input, upload_result_object, write_json
from .timeline import build_output


def build_result_payload(result: AnalysisResult) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "taskId": result.taskId,
        "status": result.status,
        "trajectoryObjectKey": result.trajectoryObjectKey,
        "errorMessage": result.errorMessage,
    }
    if result.metrics is not None:
        payload["metrics"] = {
            "maxAltitude": result.metrics.maxAltitude,
            "maxSpeed": result.metrics.maxSpeed,
            "flightDuration": result.metrics.flightDuration,
            "distance": result.metrics.distance,
            "climbRate": result.metrics.climbRate,
            "accelMagnitudeMax": result.metrics.accelMagnitudeMax,
        }
    return payload


def run_local_convert(input_path: str, output_path: str, dt: float, pretty: bool, compress_gzip: bool) -> None:
    data = parse_log(input_path)
    payload = build_output(data, dt=dt)
    write_json(payload, output_path, pretty=pretty, compress_gzip=compress_gzip)
    print(f"Converted: {input_path}")
    print(f"Frames: {len(payload['frames'])}")
    print(f"Events: {len(payload['events'])}")
    print(f"Output: {output_path}")
    if compress_gzip:
        print(f"Output (gzip): {output_path}.gz")


def process_request_message(request: AnalysisRequest, dt: float, client: Any) -> AnalysisResult:
    source_path = None
    should_cleanup = False
    try:
        source_path, should_cleanup = download_source_object(client, request.bucket, request.objectKey)
        data = parse_log(source_path)
        payload = build_output(data, dt=dt)

        result_object_key = result_key_for_input(request.objectKey, request.taskId)
        upload_result_object(client, request.bucket, result_object_key, payload)

        metrics = payload.get("metrics", {})
        return AnalysisResult(
            taskId=request.taskId,
            status=AnalysisStatus.COMPLETED,
            trajectoryObjectKey=result_object_key,
            metrics=AnalysisMetrics(
                maxAltitude=metrics.get("maxAltitude"),
                maxSpeed=metrics.get("maxSpeed"),
                flightDuration=metrics.get("flightDuration"),
                distance=metrics.get("distance"),
                climbRate=metrics.get("climbRate"),
                accelMagnitudeMax=metrics.get("accelMagnitudeMax"),
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
