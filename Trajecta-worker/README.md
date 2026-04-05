# Trajecta Worker

![Module](https://img.shields.io/badge/module-worker-3776ab)
![Python](https://img.shields.io/badge/python-3.12-1f2937)

Python worker for telemetry parsing and result publishing.

## Table of Contents

- [Overview](#overview)
- [Runtime and Dependencies](#runtime-and-dependencies)
- [CLI Modes](#cli-modes)
- [Local Run](#local-run)
- [Environment Variables](#environment-variables)
- [Docker](#docker)
- [Tests](#tests)

## Overview

Responsibilities:
- consume task messages from RabbitMQ
- download raw `.bin` from API internal endpoint
- parse telemetry and build normalized timeline payload
- publish result payload to RabbitMQ
- support local offline conversion mode

## Runtime and Dependencies

- Python 3.12 (Docker image)
- packages from `requirements.txt`:
  - `numpy`
  - `pandas`
  - `pymavlink`
  - `pika`

Entry point:
- `main.py` -> `trajecta_worker.cli.main`

## CLI Modes

From `trajecta_worker/cli.py`:

- `--worker` run RabbitMQ worker mode
- `--dt <float>` timeline step (default `0.1`)
- `--input/-i <path>` local `.bin` input
- `--output/-o <path>` local `.json` output
- `--pretty` pretty-print JSON (local mode)
- `--gzip` write `.json.gz` in local mode

## Local Run

Setup:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

Worker mode:

```powershell
python main.py --worker
```

Local conversion mode:

```powershell
python main.py --input sample.bin --output out.json --pretty --gzip
```

## Environment Variables

Derived from `trajecta_worker/config.py`, `trajecta_worker/messaging.py`, and `trajecta_worker/storage.py`.

RabbitMQ:
- `RABBITMQ_URL`
- `REQUEST_EXCHANGE`
- `REQUEST_ROUTING_KEY`
- `REQUEST_QUEUE`
- `RESULTS_EXCHANGE`
- `RESULTS_ROUTING_KEY`
- `RESULTS_QUEUE`

API integration:
- `API_BASE_URL`
- `INTERNAL_RAW_PATH_TEMPLATE` (default `/api/internal/v1/tasks/{taskId}/raw`)
- `WORKER_TOKEN_HEADER` (default `X-Worker-Token`)
- `INTERNAL_WORKER_TOKEN` (required)
- `HTTP_TIMEOUT_SECONDS`

## Docker

- `Dockerfile` command: `python main.py --worker`
- `docker-compose.yml` service: `worker`
- network: external `telemetry-network`

Run:

```bash
docker compose up --build -d worker
```

## Tests

Unit tests are in `tests/`.

```powershell
python -m unittest discover -s tests -v
```
