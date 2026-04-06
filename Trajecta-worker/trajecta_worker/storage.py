from __future__ import annotations

import gzip
import json
import os
import tempfile
from pathlib import Path
from typing import Any
from urllib.parse import urljoin
from urllib.request import Request, urlopen

from .config import (
    DEFAULT_API_BASE_URL,
    DEFAULT_DOWNLOAD_CHUNK_SIZE_BYTES,
    DEFAULT_HTTP_TIMEOUT_SECONDS,
    DEFAULT_INTERNAL_RAW_PATH_TEMPLATE,
    DEFAULT_MAX_RAW_DOWNLOAD_BYTES,
    DEFAULT_WORKER_TOKEN_HEADER,
)
from .models import WorkerError


def download_raw_for_task(task_id: int) -> tuple[str, bool]:
    base_url = os.getenv("API_BASE_URL", DEFAULT_API_BASE_URL).rstrip("/") + "/"
    path_template = os.getenv("INTERNAL_RAW_PATH_TEMPLATE", DEFAULT_INTERNAL_RAW_PATH_TEMPLATE)
    worker_token_header = os.getenv("WORKER_TOKEN_HEADER", DEFAULT_WORKER_TOKEN_HEADER)
    worker_token = os.getenv("INTERNAL_WORKER_TOKEN")

    if not worker_token:
        raise WorkerError("INTERNAL_WORKER_TOKEN must be set for worker mode.")

    raw_path = path_template.format(taskId=task_id)
    raw_url = urljoin(base_url, raw_path.lstrip("/"))

    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".bin")
    tmp.close()

    req = Request(raw_url, method="GET")
    req.add_header(worker_token_header, worker_token)

    timeout = int(os.getenv("HTTP_TIMEOUT_SECONDS", str(DEFAULT_HTTP_TIMEOUT_SECONDS)))
    max_download_bytes = int(os.getenv("MAX_RAW_DOWNLOAD_BYTES", str(DEFAULT_MAX_RAW_DOWNLOAD_BYTES)))
    chunk_size_bytes = int(os.getenv("DOWNLOAD_CHUNK_SIZE_BYTES", str(DEFAULT_DOWNLOAD_CHUNK_SIZE_BYTES)))

    try:
        with urlopen(req, timeout=timeout) as response, open(tmp.name, "wb") as out:
            content_length = response.headers.get("Content-Length")
            if content_length is not None:
                try:
                    declared_size = int(content_length)
                except ValueError:
                    declared_size = None
                if declared_size is not None and declared_size > max_download_bytes:
                    raise WorkerError(
                        f"Raw file is too large ({declared_size} bytes). Maximum allowed is {max_download_bytes} bytes."
                    )

            total_downloaded = 0
            while True:
                chunk = response.read(chunk_size_bytes)
                if not chunk:
                    break
                total_downloaded += len(chunk)
                if total_downloaded > max_download_bytes:
                    raise WorkerError(
                        f"Raw file is too large ({total_downloaded} bytes). Maximum allowed is {max_download_bytes} bytes."
                    )
                out.write(chunk)
    except Exception:
        try:
            os.remove(tmp.name)
        except OSError:
            pass
        raise

    return tmp.name, True


def write_json(payload: dict[str, Any], output_path: str, pretty: bool = False, compress_gzip: bool = False) -> None:
    Path(output_path).parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as file:
        json.dump(payload, file, ensure_ascii=False, indent=2 if pretty else None)

    if compress_gzip:
        gz_path = output_path + ".gz"
        with gzip.open(gz_path, "wt", encoding="utf-8") as gz_file:
            json.dump(payload, gz_file, ensure_ascii=False, indent=None)


