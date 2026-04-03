from __future__ import annotations

import gzip
import json
import os
import tempfile
from pathlib import Path
from urllib.parse import urljoin
from urllib.request import Request, urlopen

from .config import (
    DEFAULT_API_BASE_URL,
    DEFAULT_HTTP_TIMEOUT_SECONDS,
    DEFAULT_INTERNAL_RAW_PATH_TEMPLATE,
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
    with urlopen(req, timeout=timeout) as response, open(tmp.name, "wb") as out:
        out.write(response.read())

    return tmp.name, True


def write_json(payload: dict[str, Any], output_path: str, pretty: bool = False, compress_gzip: bool = False) -> None:
    Path(output_path).parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as file:
        json.dump(payload, file, ensure_ascii=False, indent=2 if pretty else None)

    if compress_gzip:
        gz_path = output_path + ".gz"
        with gzip.open(gz_path, "wt", encoding="utf-8") as gz_file:
            json.dump(payload, gz_file, ensure_ascii=False, indent=None)


