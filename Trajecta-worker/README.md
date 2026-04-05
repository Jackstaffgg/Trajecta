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
- [Theoretical Justification](#theoretical-justification)

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

## Theoretical Justification

This section documents mathematical choices that are already implemented in code.

1. Uniform timeline and interpolation (`trajecta_worker/timeline.py`)
- A uniform timeline is built with step `dt`, then numeric channels are interpolated.
- For continuous values (position, speed, battery, IMU) linear interpolation is used.
- For mode/state channels, forward-fill is used instead of interpolation.
- Yaw is interpolated with angle unwrapping to avoid jumps near `-180/180` degrees.

2. GPS outlier rejection (`sanitize_gps_dataframe`)
- Segment speed is estimated as `v = distance / dt` using haversine distance.
- If implied speed is unrealistically high (`MAX_REASONABLE_GPS_SPEED_MPS`), that sample is treated as a spike and removed from position/speed channels.
- This protects distance and speed metrics from single-point GPS teleports.

3. Why we do not use raw IMU double integration for headline speed metrics
- Accelerometer measurements contain bias and noise.
- Velocity from acceleration is computed as `v(t) = integral(a(t) dt)`; position requires a second integration.
- Even small bias accumulates over time (drift), and the error grows rapidly for long trajectories.
- For this reason, worker computes `maxSpeed/maxHorizontalSpeed/totalDistance` primarily from GPS track geometry and time deltas, with outlier filtering.
- IMU integration is still useful for diagnostic signals, but not as the primary source for public KPI speed values.

4. Vertical metrics consistency (`compute_extended_metrics`)
- `maxVerticalSpeed` and `maxClimbRate` are taken from bounded climb-rate data when available.
- Fallback is altitude derivative `(alt2 - alt1) / dt` with finite/reasonable bounds.
- This keeps vertical metrics physically plausible and consistent with timeline duration/distance.

5. About quaternions vs Euler angles
- Current log format already provides attitude as Euler (`roll/pitch/yaw`), and current pipeline keeps this representation.
- To reduce discontinuity artifacts, yaw unwrapping is applied before interpolation.
- Quaternions are beneficial in 3D orientation pipelines to avoid gimbal lock and improve composition stability; they can be introduced later if raw quaternion channels are added to parsing/output contracts.
