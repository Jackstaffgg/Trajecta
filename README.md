# Trajecta

![Repo](https://img.shields.io/badge/repo-monorepo-2563eb)
![Backend](https://img.shields.io/badge/backend-Spring%20Boot%204.0.5-6db33f)
![Frontend](https://img.shields.io/badge/frontend-React%2018-61dafb)
![Worker](https://img.shields.io/badge/worker-Python%203.12-3776ab)
![Deploy](https://img.shields.io/badge/deploy-Docker%20Compose-2496ed)

Trajecta is an end-to-end telemetry processing and visualization platform for ArduPilot flight logs.

It includes:
- a Java backend API for auth, task orchestration, notifications, and admin operations
- a Python worker for parsing `.bin` logs and producing normalized trajectories
- a React frontend for upload, replay, analytics, diagnostics, and administration

## Table of Contents

- [Platform Overview](#platform-overview)
- [Architecture](#architecture)
- [Repository Layout](#repository-layout)
- [Quick Start](#quick-start)
- [Run Modes](#run-modes)
- [Configuration](#configuration)
- [Services and Ports](#services-and-ports)
- [Quality Checks](#quality-checks)
- [Deployment](#deployment)
- [Operational Notes](#operational-notes)
- [Troubleshooting](#troubleshooting)
- [Documentation Map](#documentation-map)

## Platform Overview

Core workflow:
1. User uploads a telemetry `.bin` file from the web UI.
2. Backend stores source file and creates an analysis task.
3. Backend publishes a parse request to RabbitMQ.
4. Worker downloads raw telemetry from internal API, parses it, and publishes a result.
5. Backend stores trajectory output, updates task state, and emits WebSocket events.
6. Frontend receives realtime updates and renders replay/charts/diagnostics.

## Architecture

```text
Browser (React + Vite)
    |
    | HTTP / WebSocket
    v
Frontend (Nginx, Trajecta-frontend)
    |                             \
    | /api/* and /ws proxied       \ static assets
    v                               \
Backend (Spring Boot, Trajecta-api)
    |
    | RabbitMQ request/result messages
    v
Worker (Python, Trajecta-worker)

Data services used by backend:
- PostgreSQL
- Redis
- MinIO
```

For VPS deployment, `docker-compose.vps.yml` also adds Caddy (`edge`) in front of frontend/backend.

## Repository Layout

```text
Trajecta/
  README.md
  DEPLOY_VPS.md
  deploy-vps.sh
  docker-compose.vps.yml
  start-all-stacks.bat
  infra/caddy/Caddyfile
  Trajecta-api/
  Trajecta-frontend/
  Trajecta-worker/
```

## Quick Start

### Recommended (Windows)

From repository root:

```bat
start-all-stacks.bat
```

Useful commands:

```bat
start-all-stacks.bat status
start-all-stacks.bat logs
start-all-stacks.bat validate
start-all-stacks.bat up build
start-all-stacks.bat up tests
start-all-stacks.bat up workers 2
set WORKER_REPLICAS=2 && start-all-stacks.bat up
start-all-stacks.bat down
```

Host diagnostics (from repo root):

```powershell
.\check-system.ps1
.\check-system.ps1 -ApiUrl "http://localhost:8080" -FrontendUrl "http://localhost:3000" -UsersCount 50
.\check-system.ps1 -AdminToken "<jwt_admin_token>"
.\check-system.ps1 -UsersCount 120 -ProbePath "/api/public/ping"
```

```bash
./check-system.sh
ADMIN_TOKEN="<jwt_admin_token>" ./check-system.sh "http://localhost:8080" 50 "http://localhost:3000"
```

Typical local URLs:
- Frontend: `http://localhost:3000`
- API Swagger UI: `http://localhost:8080/swagger-ui`
- RabbitMQ UI: `http://localhost:15672`
- MinIO Console: `http://localhost:9001`

## Run Modes

### Monorepo script mode

`start-all-stacks.bat` performs:
1. Optional API Gradle build (`build` or `tests` flags)
2. API compose startup (`Trajecta-api/compose.yaml`, `backend`)
3. Worker compose startup (`Trajecta-worker/docker-compose.yml`, `worker`)
4. Frontend compose startup (`Trajecta-frontend/docker-compose.yml`, `frontend`)

By default, script starts all stacks via Docker Compose without Gradle build.
Worker service can be scaled with `workers N` argument or `WORKER_REPLICAS` environment variable.

### Manual module mode

Backend:

```powershell
Set-Location .\Trajecta-api
.\gradlew.bat clean build
.\gradlew.bat bootRun
```

Worker:

```powershell
Set-Location .\Trajecta-worker
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python main.py --worker
```

Frontend:

```powershell
Set-Location .\Trajecta-frontend
npm install
npm run dev
```

## Configuration

### Local compose defaults

Each module compose file contains local defaults (for development only).

### VPS environment

VPS deploy uses:
- `docker-compose.vps.yml`
- `.env.vps` (required)
- `deploy-vps.sh`

Important: if you use `docker compose` directly, pass `--env-file .env.vps`.
Without it, `${...}` values from `docker-compose.vps.yml` resolve as empty and services may fail to start.

Create `.env.vps` from template:

```bash
cp .env.vps.example .env.vps
```

High-level variable groups:
- TLS and domain: `DOMAIN`, `ACME_EMAIL`
- Backend and security: `DB_*`, `RABBIT_*`, `MINIO_*`, `JWT_SECRET`, `INTERNAL_WORKER_TOKEN`
- Frontend routing: `VITE_APP_BASE_PATH`, `VITE_API_BASE_URL`, `VITE_WS_PATH`
- Worker runtime: `HTTP_TIMEOUT_SECONDS`
- Worker scaling and limits: `WORKER_REPLICAS`, `WORKER_CPU_LIMIT`, `WORKER_MEM_LIMIT`

For a single 3 CPU / 4 GB VPS, a practical baseline is:
- `WORKER_REPLICAS=2`
- `WORKER_CPU_LIMIT=0.7`
- `WORKER_MEM_LIMIT=576m`
- `BACKEND_MEM_LIMIT=768m`

## Services and Ports

### Local API compose (`Trajecta-api/compose.yaml`)

- `backend`: `8080:8080`
- `db`: `5432:5432`
- `redis`: `6379:6379`
- `rabbitmq`: `5672:5672`, `15672:15672`
- `minio`: `9000:9000`, `9001:9001`

### Local frontend compose (`Trajecta-frontend/docker-compose.yml`)

- `frontend`: `3000:80`

### Local worker compose (`Trajecta-worker/docker-compose.yml`)

- `worker` (no published host port)

### VPS compose (`docker-compose.vps.yml`)

- Public entry: Caddy `80:80`, `443:443`
- RabbitMQ management and MinIO ports bound to localhost only

## Quality Checks

Backend:

```powershell
Set-Location .\Trajecta-api
.\gradlew.bat test
.\gradlew.bat jacocoTestReport
```

Worker:

```powershell
Set-Location .\Trajecta-worker
python -m unittest discover -s tests -v
```

Frontend:

```powershell
Set-Location .\Trajecta-frontend
npm run lint
npm run build
```

## Deployment

### VPS helper script

```bash
./deploy-vps.sh validate
./deploy-vps.sh up
./deploy-vps.sh status
./deploy-vps.sh logs
./deploy-vps.sh restart
./deploy-vps.sh down
./deploy-vps.sh wipe --yes
```

Windows volume reset helper:

```powershell
.\reset-vps-volumes.ps1 all -Down -Yes
.\reset-vps-volumes.ps1 db redis -Down -Yes
.\reset-vps-volumes.ps1 minio -ProjectName trajecta -Yes
.\reset-vps-volumes.ps1 edge -DryRun
```

Direct compose equivalents:

```bash
docker compose --env-file .env.vps -f docker-compose.vps.yml config >/dev/null
docker compose --env-file .env.vps -f docker-compose.vps.yml up -d --build --remove-orphans
docker compose --env-file .env.vps -f docker-compose.vps.yml ps
```

For full production notes and setup sequence, see `DEPLOY_VPS.md`.

## Operational Notes

- Keep secrets out of git.
- Rotate credentials if leaked.
- Keep production `.env.vps` only on the server.
- Internal worker endpoint authorization depends on `INTERNAL_WORKER_TOKEN` and `X-Worker-Token` header.
- WebSocket auth requires `Authorization: Bearer <JWT>` in STOMP `CONNECT` headers.

## Troubleshooting

- Compose startup issues:
  - verify Docker Desktop/daemon is running
  - run `start-all-stacks.bat validate` or `./deploy-vps.sh validate`
- Frontend loads but API calls fail:
  - verify backend service is healthy
  - verify `VITE_API_BASE_URL` and nginx upstream settings
- Worker fails to process tasks:
  - verify RabbitMQ connectivity and queue names
  - verify `INTERNAL_WORKER_TOKEN` is set consistently

## Documentation Map

- `Trajecta-api/README.md` - backend endpoints, config, run and tests
- `Trajecta-frontend/README.md` - frontend architecture, env, docker and scripts
- `Trajecta-worker/README.md` - worker CLI modes, env, docker and tests
- `DEPLOY_VPS.md` - VPS deployment and operations

