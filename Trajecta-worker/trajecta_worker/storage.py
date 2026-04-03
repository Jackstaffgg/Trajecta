from __future__ import annotations

import gzip
import io
import json
import os
import tempfile
from pathlib import Path
from typing import Any

from minio import Minio

from .config import DEFAULT_MINIO_SECURE
from .models import WorkerError


def get_minio_client() -> Minio:
    endpoint = os.getenv("MINIO_ENDPOINT")
    access_key = os.getenv("MINIO_ACCESS_KEY")
    secret_key = os.getenv("MINIO_SECRET_KEY")

    if not endpoint or not access_key or not secret_key:
        raise WorkerError("MINIO_ENDPOINT, MINIO_ACCESS_KEY and MINIO_SECRET_KEY must be set for worker mode.")

    secure_value = os.getenv("MINIO_SECURE")
    secure = DEFAULT_MINIO_SECURE if secure_value is None else secure_value.lower() in ("1", "true", "yes", "y", "on")
    return Minio(endpoint, access_key=access_key, secret_key=secret_key, secure=secure)


def ensure_bucket_exists(client: Minio, bucket_name: str) -> None:
    if not client.bucket_exists(bucket_name):
        client.make_bucket(bucket_name)


def download_source_object(client: Minio, bucket: str, object_key: str) -> tuple[str, bool]:
    suffix = Path(object_key).suffix or ".bin"
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=suffix)
    tmp.close()
    client.fget_object(bucket, object_key, tmp.name)
    return tmp.name, True


def upload_result_object(client: Minio, bucket: str, object_key: str, payload: dict[str, Any]) -> str:
    data = json.dumps(payload, ensure_ascii=False, indent=None).encode("utf-8")
    ensure_bucket_exists(client, bucket)
    client.put_object(
        bucket_name=bucket,
        object_name=object_key,
        data=io.BytesIO(data),
        length=len(data),
        content_type="application/json",
    )
    return object_key


def write_json(payload: dict[str, Any], output_path: str, pretty: bool = False, compress_gzip: bool = False) -> None:
    Path(output_path).parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as file:
        json.dump(payload, file, ensure_ascii=False, indent=2 if pretty else None)

    if compress_gzip:
        gz_path = output_path + ".gz"
        with gzip.open(gz_path, "wt", encoding="utf-8") as gz_file:
            json.dump(payload, gz_file, ensure_ascii=False, indent=None)


def result_key_for_input(object_key: str, task_id: int) -> str:
    base = Path(object_key).with_suffix(".json").as_posix()
    if base == object_key:
        base = f"{object_key}.json"
    return f"analysis/{task_id}/{base}".replace("//", "/")
