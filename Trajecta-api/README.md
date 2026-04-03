# Trajecta API

Trajecta API is a Spring Boot backend for telemetry ingestion and trajectory analysis orchestration.
It provides secure REST endpoints, asynchronous task processing, object storage integration, and real-time WebSocket updates.

## Table of Contents

- [Overview](#overview)
- [Core Features](#core-features)
- [Technology Stack](#technology-stack)
- [Architecture](#architecture)
- [REST API](#rest-api)
- [WebSocket Contract](#websocket-contract)
- [Asynchronous Processing Flow](#asynchronous-processing-flow)
- [Project Structure](#project-structure)
- [Configuration](#configuration)
- [Run the Project](#run-the-project)
- [One-Command Build and Compose Startup](#one-command-build-and-compose-startup)
- [Quick Start (Recommended)](#quick-start-recommended)
- [Testing and Coverage](#testing-and-coverage)
- [Metrics and Monitoring](#metrics-and-monitoring)
- [Operational Notes](#operational-notes)
- [Troubleshooting](#troubleshooting)

## Overview

The service manages telemetry analysis tasks:

1. A client uploads a `.bin` telemetry file.
2. The backend stores the source file in MinIO.
3. The backend publishes analysis requests through RabbitMQ.
4. A worker processes the telemetry and returns a result.
5. The backend updates task status, stores trajectory output, and emits WebSocket events.

The project is designed around the following principles:

- Strong validation for user input and object keys
- JWT-based authentication and role-based authorization
- Isolated internal worker endpoints with an extra worker token
- Event-driven processing for scalability
- Standardized API envelope for successful and failed responses

## Core Features

- JWT authentication (`register`, `login`)
- User profile management and admin user management
- Telemetry task creation and lifecycle tracking
- Source and trajectory file download endpoints
- Notification management
- Real-time user events over STOMP/WebSocket
- Redis-backed rate limiting for login and task creation
- PostgreSQL persistence with Flyway support
- MinIO object storage integration

## Technology Stack

- Java 21
- Spring Boot 4.0.5
- Spring Web, Validation, Security
- Spring Data JPA (PostgreSQL)
- Spring AMQP (RabbitMQ)
- Spring Data Redis
- Spring WebSocket (STOMP)
- MapStruct + Lombok
- SpringDoc OpenAPI UI
- JUnit 5 + Mockito
- JaCoCo
- Docker + Docker Compose

## Architecture

Main layers:

- `controller`: REST entry points (`/api/v1/**` and `/api/internal/**`)
- `service`: business logic and orchestration
- `repo`: JPA repositories
- `mapper`: DTO <-> domain mappings
- `dto`: API, messaging, and WebSocket payload models
- `messaging`: RabbitMQ producer/consumer integration
- `storage`: object key generation and file storage abstraction
- `security`: JWT auth and rate limiting
- `event`: domain event publishing

## REST API

Base path groups:

- Public API: `/api/v1/**`
- Internal worker API: `/api/internal/**`

Main endpoint groups:

- Authentication
  - `POST /api/v1/auth/register`
  - `POST /api/v1/auth/login`

- Tasks
  - `POST /api/v1/tasks` (multipart form data)
  - `GET /api/v1/tasks/{taskId}`
  - `GET /api/v1/tasks?offset=0&limit=20`
  - `POST /api/v1/tasks/{taskId}/ai-conclusion`
  - `GET /api/v1/tasks/{taskId}/raw`
  - `GET /api/v1/tasks/{taskId}/trajectory`

- Notifications
  - `GET /api/v1/notifications`
  - `PATCH /api/v1/notifications/{id}/read`
  - `PATCH /api/v1/notifications/read-all`
  - `DELETE /api/v1/notifications/{id}`

- Current user
  - `GET /api/v1/users/me`
  - `PUT /api/v1/users`

- Admin users
  - `GET /api/v1/admin/users`
  - `POST /api/v1/admin/users`
  - `GET /api/v1/admin/users/{id}`
  - `PUT /api/v1/admin/users/{id}`
  - `DELETE /api/v1/admin/users/{id}`

- Internal worker
  - `GET /api/internal/v1/tasks/{taskId}/raw` (requires `X-Worker-Token`)

OpenAPI endpoints:

- Swagger UI: `http://localhost:8080/swagger-ui`
- OpenAPI JSON: `http://localhost:8080/api-docs`
- WebSocket contract docs endpoint: `GET /api/v1/ws/contract`

## WebSocket Contract

Transport details:

- STOMP endpoint: `/ws`
- Broker prefixes: `/topic`, `/queue`
- Application prefix: `/app`
- User event destination: `/user/queue/events`

Authentication:

- Send `Authorization: Bearer <JWT_TOKEN>` in STOMP `CONNECT` headers

Event envelope:

- `SocketEvent`
  - `type`: `NEW_NOTIFICATION` or `TASK_STATUS_UPDATE`
  - `payload`: typed payload object

Payload models:

- `NotificationPayload`
- `TaskUpdateStatusPayload`

## Asynchronous Processing Flow

1. `FlightTaskService` creates task and uploads source file.
2. `EventPublisher` emits analysis request event.
3. `AnalysisProducer` publishes request to RabbitMQ.
4. Worker processes telemetry and returns result.
5. `AnalysisConsumer` delegates to task completion.
6. Task state changes are persisted and emitted to users over WebSocket.

## Project Structure

```text
src/main/java/dev/knalis/trajectaapi/
  config/
  controller/
  dto/
  event/
  exception/
  factory/
  mapper/
  messaging/
  model/
  repo/
  security/
  service/
  storage/

src/main/resources/
  application.yml
  db/migration/
```

## Configuration

Important environment variables (defaults are defined in `application.yml`):

- Database
  - `DB_HOST` (default: `localhost`)
  - `DB_USER` (default: `user`)
  - `DB_PASSWORD` (default: `password123`)

- RabbitMQ
  - `RABBIT_HOST` (default: `localhost`)
  - `RABBIT_USER` (default: `guest`)
  - `RABBIT_PASS` (default: `guest`)

- Redis
  - `REDIS_HOST` (default: `localhost`)

- MinIO
  - `MINIO_URL` (default: `http://localhost:9000`)
  - `MINIO_USER` (default: `admin`)
  - `MINIO_PASS` (default: `password123`)

- Security
  - `JWT_SECRET`
  - `INTERNAL_WORKER_TOKEN`

Rate limit configuration:

- `LOGIN_RATE_LIMIT_MAX_ATTEMPTS`
- `LOGIN_RATE_LIMIT_WINDOW_SECONDS`
- `TASK_CREATE_RATE_LIMIT_MAX_ATTEMPTS`
- `TASK_CREATE_RATE_LIMIT_WINDOW_SECONDS`

## Run the Project

### Option 1: Local JVM run (dependencies external)

```powershell
.\gradlew.bat clean build
.\gradlew.bat bootRun
```

### Option 2: Docker Compose stack

```powershell
docker compose -f compose.yaml up --build -d
```

This stack includes:

- `db` (PostgreSQL)
- `redis`
- `rabbitmq`
- `minio`
- `minio-init`
- `backend`

## One-Command Build and Compose Startup

A ready-to-run Windows script is included:

- `scripts/start-all.bat`

Default behavior:

1. Runs Gradle `clean build`
2. Runs Docker Compose `up --build --force-recreate --remove-orphans -d`

Usage:

```bat
scripts\start-all.bat
```

Useful optional flags:

```bat
scripts\start-all.bat skiptests
scripts\start-all.bat skipcompose
scripts\start-all.bat skipbuild
scripts\start-all.bat autologs
```

Flag reference:

- `skiptests` - build without tests (`-x test`)
- `skipbuild` - skip Gradle build step
- `skipcompose` - skip Docker Compose startup
- `autologs` - automatically follow compose logs after startup

## Quick Start (Recommended)

For a full local environment with rebuild and container recreation:

```bat
scripts\start-all.bat
```

For startup with automatic log tailing:

```bat
scripts\start-all.bat autologs
```

Then open:

- API docs: `http://localhost:8080/swagger-ui`
- RabbitMQ UI: `http://localhost:15672`
- MinIO Console: `http://localhost:9001`

## Testing and Coverage

Run unit tests:

```powershell
.\gradlew.bat test
```

Generate coverage report:

```powershell
.\gradlew.bat jacocoTestReport
```

Coverage reports:

- HTML: `build/reports/jacoco/test/html/index.html`
- XML: `build/reports/jacoco/test/jacocoTestReport.xml`

## Metrics and Monitoring

Actuator endpoints are enabled and exposed over HTTP.

- Base metrics list: `http://localhost:8080/actuator/metrics`
- Prometheus scrape endpoint: `http://localhost:8080/actuator/prometheus`
- Health endpoint: `http://localhost:8080/actuator/health`

Custom business counters currently emitted include:

- `auth.register.success`
- `auth.login.success`
- `auth.login.failure`
- `auth.login.rateLimited`
- `tasks.created`
- `tasks.completed.success`
- `tasks.completed.failed_result`
- `tasks.completed.failed_missing_trajectory`
- `tasks.aiConclusion.added`
- `notifications.created`
- `notifications.markAsRead.single`
- `notifications.markAsRead.bulk`
- `notifications.deleted`

## Operational Notes

- File upload constraints:
  - only `.bin`
  - max 50 MB
- Task pagination constraints:
  - `offset >= 0`
  - `1 <= limit <= 100`
  - `offset % limit == 0`
- Internal worker endpoint is protected by `X-Worker-Token`
- JWT is required for public protected endpoints and WebSocket CONNECT

Default seed behavior:

- On startup, the app seeds an admin user only if username `knalis` does not exist.
- Seed credentials:
  - username: `knalis`
  - password: `Knl123`
- If PostgreSQL volume already contains this user with a different password hash, login with `Knl123` can fail.

## Troubleshooting

- Docker compose fails to start
  - Ensure Docker Desktop is running
  - Check port usage: `5432`, `5672`, `6379`, `9000`, `9001`, `8080`, `15672`

- Swagger UI not reachable
  - Verify backend is up on `8080`
  - Open `http://localhost:8080/swagger-ui`

- Authentication issues
  - Check `JWT_SECRET` consistency between components
  - Ensure `Authorization: Bearer <token>` format is correct
  - If `knalis` / `Knl123` returns 401, your DB volume likely has an older user record

- Reset local environment (destructive, removes local data volumes)

```powershell
docker compose -f compose.yaml down -v --remove-orphans
docker compose -f compose.yaml up --build --force-recreate -d
```

- WebSocket schema not visible in Swagger UI
  - Open `GET /api/v1/ws/contract` in Swagger (tag `WebSocket`)
  - Check raw schema list in `http://localhost:8080/api-docs`

- Worker authorization issues
  - Check `INTERNAL_WORKER_TOKEN`
  - Ensure request header is exactly `X-Worker-Token`

