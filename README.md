# Trajecta

![Monorepo](https://img.shields.io/badge/repo-monorepo-2563eb)
![Backend](https://img.shields.io/badge/backend-Spring_Boot_4-6db33f)
![Frontend](https://img.shields.io/badge/frontend-React_18-61dafb)
![Worker](https://img.shields.io/badge/worker-Python-3776ab)
![Deployment](https://img.shields.io/badge/deploy-Docker_Compose-2496ed)

Trajecta is an end-to-end telemetry analysis platform for ArduPilot flight logs.

It ingests raw `.bin` files, processes them asynchronously, stores artifacts, and delivers a real-time web experience for replay, charts, diagnostics, and administration.

## Quick Links

- [Quick start](#quick-start)
- [Architecture](#architecture)
- [Services](#services)
- [Feature highlights](#feature-highlights)
- [Local development](#local-development)
- [Configuration](#configuration)
- [Testing](#testing-and-quality-checks)
- [Production deployment](#production-deployment-vps)
- [Roadmap](#roadmap)
- [Contributing](#contributing)

## Feature Highlights

- End-to-end telemetry pipeline from file upload to analysis output
- Real-time task updates and notifications over WebSocket/STOMP
- Clean separation of concerns across API, worker, frontend, and edge
- Production-ready reverse proxy routing with HTTPS and `/trajecta` base path
- Practical operations model for local development and VPS deployment

## Quick start

From repository root on Windows:

```bat
start-all-stacks.bat
```

Optional actions:

```bat
start-all-stacks.bat status
start-all-stacks.bat logs
start-all-stacks.bat validate
start-all-stacks.bat down
```

Then open:

- `http://localhost:3000` (frontend)
- `http://localhost:8080/swagger-ui` (API docs)

## Architecture

```text
Browser (React)
   |
   | HTTPS: /trajecta, /trajecta/api, /trajecta/ws
   v
Caddy edge (80/443)
   |                    \
   | /trajecta/*         \ /trajecta/api/* + /trajecta/ws*
   v                      v
Frontend (Nginx)        Backend (Spring Boot)
                             |
                             | publish/consume
                             v
                         RabbitMQ <----> Worker (Python)
                             |
                             +--> PostgreSQL
                             +--> Redis
                             +--> MinIO
```

## Services

| Component | Stack | Responsibility |
|---|---|---|
| `Trajecta-api` | Java 21, Spring Boot, JPA, Flyway, Redis, AMQP, MinIO | Auth, task lifecycle, orchestration, REST API, WebSocket events |
| `Trajecta-worker` | Python, `pymavlink`, `numpy`, `pandas`, `pika` | Telemetry parsing, queue processing, result publishing |
| `Trajecta-frontend` | React 18, TypeScript, Vite, Tailwind, Zustand, ECharts, Resium/Cesium | UI flow, analytics views, replay, diagnostics |
| `infra/caddy` | Caddy | TLS termination, reverse proxy, `/trajecta` routing |

## Repository layout

```text
Trajecta/
  README.md
  start-all-stacks.bat
  docker-compose.vps.yml
  DEPLOY_VPS.md
  infra/caddy/Caddyfile
  Trajecta-api/
  Trajecta-frontend/
  Trajecta-worker/
```

## Local development

### Prerequisites

- Docker Desktop with Compose v2
- Java 21
- Node.js 18+ and npm
- Python 3.10+

### Option A (recommended): monorepo orchestrator

```bat
start-all-stacks.bat
```

Useful actions:

```bat
start-all-stacks.bat status
start-all-stacks.bat logs
start-all-stacks.bat down
start-all-stacks.bat validate
start-all-stacks.bat up skiptests
```

What it does:

1. Builds `Trajecta-api` with Gradle
2. Starts `Trajecta-api/compose.yaml`
3. Starts `Trajecta-worker/docker-compose.yml`
4. Starts `Trajecta-frontend/docker-compose.yml`

### Option B: run each service manually

Backend:

```powershell
Set-Location Z:\Trajecta\Trajecta-api
.\gradlew.bat clean build
.\gradlew.bat bootRun
```

Worker:

```powershell
Set-Location Z:\Trajecta\Trajecta-worker
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python main.py --worker
```

Worker local conversion mode:

```powershell
python main.py --input sample.bin --output out.json --pretty --gzip
```

Frontend:

```powershell
Set-Location Z:\Trajecta\Trajecta-frontend
npm install
npm run dev
```

### Typical local endpoints

- Frontend: `http://localhost:3000`
- Backend: `http://localhost:8080`
- Swagger UI: `http://localhost:8080/swagger-ui`
- OpenAPI JSON: `http://localhost:8080/api-docs`
- RabbitMQ UI: `http://localhost:15672`
- MinIO Console: `http://localhost:9001`

## Configuration

### Root VPS environment (`.env.vps`)

Create from template:

```bash
cp .env.vps.example .env.vps
```

Key variables:

| Group | Variables |
|---|---|
| Edge / TLS | `DOMAIN`, `ACME_EMAIL` |
| Frontend routing | `VITE_APP_BASE_PATH`, `VITE_API_BASE_URL`, `VITE_WS_PATH` |
| PostgreSQL | `DB_USER`, `DB_PASSWORD` |
| RabbitMQ | `RABBIT_USER`, `RABBIT_PASS` |
| MinIO | `MINIO_USER`, `MINIO_PASS` |
| Security | `JWT_SECRET`, `INTERNAL_WORKER_TOKEN` |
| Worker HTTP | `HTTP_TIMEOUT_SECONDS` |

### Security guidance

- Do not commit real credentials or tokens
- Rotate leaked secrets immediately
- Keep production `.env.vps` only on the server

## Testing and quality checks

Backend tests and coverage:

```powershell
Set-Location Z:\Trajecta\Trajecta-api
.\gradlew.bat test
.\gradlew.bat jacocoTestReport
```

Worker tests:

```powershell
Set-Location Z:\Trajecta\Trajecta-worker
python -m pytest
```

Frontend lint:

```powershell
Set-Location Z:\Trajecta\Trajecta-frontend
npm run lint
```

## Production deployment (VPS)

Detailed guide: `DEPLOY_VPS.md`

High-level flow:

1. Prepare VPS (Docker, firewall, DNS)
2. Create `.env.vps` from `.env.vps.example`
3. Validate Compose configuration
4. Start and build stack
5. Verify `https://your-domain/trajecta/`

Commands:

```bash
./deploy-vps.sh validate
./deploy-vps.sh up
./deploy-vps.sh status
./deploy-vps.sh logs
./deploy-vps.sh restart
./deploy-vps.sh down
```

## Operations notes

- Public internet exposure in VPS setup: Caddy only (`80`, `443`)
- Core services run inside `telemetry-network`
- RabbitMQ and MinIO admin endpoints are localhost-bound in VPS compose
- WebSocket traffic is proxied via `/trajecta/ws`

## Roadmap

- Improve observability with centralized logs and metrics dashboards
- Expand task diagnostics and AI-assisted analysis quality checks
- Add release automation for faster and safer VPS updates
- Harden operational playbooks for backup, restore, and incident response

## Contributing

Contributions are welcome.

1. Fork and create a feature branch.
2. Keep changes focused and consistent with existing folder boundaries.
3. Run relevant checks before opening a PR:

```powershell
Set-Location Z:\Trajecta\Trajecta-api
.\gradlew.bat test

Set-Location Z:\Trajecta\Trajecta-worker
python -m pytest

Set-Location Z:\Trajecta\Trajecta-frontend
npm run lint
```

4. Open a pull request with a concise problem statement, change summary, and validation steps.

## Documentation map

- `DEPLOY_VPS.md` - VPS deployment and operations
- `Trajecta-api/README.md` - backend API and domain details
- `Trajecta-frontend/README.md` - frontend modules and runtime notes
- `Trajecta-worker/trajecta_worker/cli.py` - worker CLI entrypoint

---

Trajecta is designed to keep ingestion, processing, and visualization clearly separated while remaining easy to run as a single platform.




