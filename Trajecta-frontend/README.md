# Trajecta Frontend

React + Vite application for ArduPilot flight log analysis.

## Stack

- React 18 + TypeScript + Vite
- Tailwind CSS
- Zustand global state
- Resium/Cesium for 3D replay
- ECharts for telemetry timelines
- Virtualized params table via @tanstack/react-virtual

## Project Structure

- src/App.tsx: app flow (auth -> upload -> processing -> analysis modules)
- src/hooks/useFlightData.ts: log loading/normalization and global data access
- src/store/flight-store.ts: global store for auth, flight object, mode, replay state
- src/modules/dashboard: summary cards and metadata
- src/modules/replay: 3D replay with timeline, camera modes, HUD, event markers
- src/modules/charts: synchronized time-series charts and shared scrubber
- src/modules/params: searchable, virtualized parameters table
- src/modules/diagnostics: AI diagnostics panel
- src/components/layout: sidebar and flow screens
- src/components/ui: shadcn-style primitives

## useFlightData Hook

The hook wraps data lifecycle:

- normalizeFlightJson(raw): normalizes JSON structure to metadata/frames/events/params/metrics
- loadFromFile(file): reads JSON, parses it, normalizes, and stores in Zustand
- maxTimeSec: derived value from the last frame timestamp
- clear(): resets the current flight data

This keeps UI modules focused on rendering and interaction, while ingestion logic remains centralized.

## Run

1. npm install
2. npm run dev
3. open browser at localhost URL from Vite

## Environment Variables

- VITE_CESIUM_ION_TOKEN: optional token for Cesium terrain/imagery providers
- VITE_APP_BASE_PATH: public app base path (for subpath deploys, e.g. /trajecta/)
- VITE_API_BASE_URL: API prefix/base (for subpath deploys, e.g. /trajecta)
- VITE_WS_PATH: websocket endpoint path suffix (default /ws)

## Docker (Production)

Frontend is built into static assets and served by Nginx.
Nginx proxies backend traffic over Docker network:

- /api/* -> backend container
- /ws -> backend WebSocket endpoint

Files:

- Dockerfile
- docker-compose.yml
- nginx/default.conf.template

### Start with existing API and Worker stack

1. Start API infrastructure and backend first so telemetry-network exists.
2. Start frontend compose from this folder.

If telemetry-network does not exist yet, create it manually:

- docker network create telemetry-network

Expected backend upstream in Docker network is `backend:8080` by default.
You can override it with BACKEND_UPSTREAM.

Example env values for consistency with current project:

- BACKEND_UPSTREAM=backend:8080
- VITE_CESIUM_ION_TOKEN=<optional>

Frontend published port:

- http://localhost:3000

### Full stack deploy order (current project)

1. Start API stack:
	docker compose -f ../Trajecta-api/compose.yaml up -d
2. Start worker:
	docker compose -f ../Trajecta-worker/docker-compose.yml up -d
3. Start frontend:
	docker compose up -d

Stop order:

1. docker compose down
2. docker compose -f ../Trajecta-worker/docker-compose.yml down
3. docker compose -f ../Trajecta-api/compose.yaml down
