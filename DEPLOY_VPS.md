# Trajecta VPS Deployment (HTTPS + /trajecta)

This guide deploys the whole project on one VPS and publishes it at:

- https://your-domain/trajecta/

## 0) Big Picture Plan

1. Prepare VPS (Docker, firewall, DNS).
2. Prepare project env (`.env.vps`) with strong secrets and domain.
3. Validate compose config.
4. Build and run stack.
5. Verify HTTPS and application routing under `/trajecta`.
6. Use operational commands for logs/restart/update.

## 1) How Docker works for Java backend in this project

Backend image is built from [Trajecta-api/Dockerfile](Trajecta-api/Dockerfile):

1. Build stage (`gradle:8-jdk21`) compiles the app and creates JAR.
2. Runtime stage (`eclipse-temurin:21-jre-jammy`) copies only resulting JAR.
3. Container starts with `java -jar /app/spring-boot-application.jar`.

So it is NOT using some pre-downloaded static backend image.

- By default, deployment runs with image build (`docker compose ... up --build`).
- This means backend is rebuilt from your current source code on VPS.
- If code changes, run restart/up again to rebuild.

## 2) What gets exposed to internet

- Public: only reverse-proxy edge (ports 80 and 443).
- Internal-only in Docker network: backend, worker, db, redis.
- Localhost-only on VPS: RabbitMQ UI and MinIO ports.

## 3) Prerequisites on VPS

- Ubuntu 22.04+ (or other Linux with Docker Engine + Compose plugin)
- Domain A-record -> VPS IP
- Open ports in firewall:
	- 80/tcp
	- 443/tcp

Install Docker (Ubuntu example):

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl gnupg
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg
echo \
	"deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
	$(. /etc/os-release && echo $VERSION_CODENAME) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo usermod -aG docker $USER
```

Relogin after group change.

## 4) Project files used for deployment

- [docker-compose.vps.yml](docker-compose.vps.yml)
- [.env.vps.example](.env.vps.example)
- [deploy-vps.sh](deploy-vps.sh)
- [deploy-vps.bat](deploy-vps.bat)
- [deploy-vps-ssh.sh](deploy-vps-ssh.sh)
- [deploy-vps-ssh.bat](deploy-vps-ssh.bat)
- [deploy-vps-remote.sh](deploy-vps-remote.sh)
- [infra/caddy/Caddyfile](infra/caddy/Caddyfile)

## 5) Step-by-step deployment

1. Upload/clone repository to VPS.
2. Go to repository root.
3. Create env file:

```bash
cp .env.vps.example .env.vps
```

4. Edit `.env.vps` and set all required values:

- `DOMAIN=your-domain`
- `ACME_EMAIL=you@example.com`
- `DB_PASSWORD=...`
- `RABBIT_PASS=...`
- `MINIO_PASS=...`
- `JWT_SECRET=...` (long random)
- `INTERNAL_WORKER_TOKEN=...` (long random)

5. Make helper script executable:

```bash
chmod +x deploy-vps.sh
```

6. Validate compose:

```bash
./deploy-vps.sh validate
```

Windows alternative:

```bat
deploy-vps.bat validate
```

7. Start stack (with build):

```bash
./deploy-vps.sh up
```

Windows alternative:

```bat
deploy-vps.bat up
```

8. Check service status:

```bash
./deploy-vps.sh status
```

Windows alternative:

```bat
deploy-vps.bat status
```

9. Open app:

- https://your-domain/trajecta/

## 6) Verification checklist

1. Browser opens HTTPS page without cert warning.
2. Login and API calls work under `/trajecta/api/...`.
3. WebSocket updates work under `/trajecta/ws`.
4. Backend logs show normal startup and no repeated crash loop.

Useful logs command:

```bash
./deploy-vps.sh logs
```

Windows alternative:

```bat
deploy-vps.bat logs
```

## 7) Update flow (new code deploy)

1. Pull latest git changes.
2. Run:

```bash
./deploy-vps.sh restart
```

`restart` forces container recreation and rebuilds images from current source.

## 8) Operations cheat sheet

```bash
./deploy-vps.sh up
./deploy-vps.sh status
./deploy-vps.sh logs
./deploy-vps.sh restart
./deploy-vps.sh down
./deploy-vps.sh wipe --yes
```


Full cleanup (destructive) on VPS:

```bash
./deploy-vps.sh wipe --yes
```

This command removes Trajecta containers, images, volumes and compose network, then runs Docker prune for unused host resources.

## 9.2) SSH scenario where script executes ON VPS

If you want deployment commands to execute on VPS (not on local machine), use:

```bash
ssh user@your-vps "cd /opt/Trajecta && chmod +x ./deploy-vps-remote.sh && ./deploy-vps-remote.sh status"
ssh user@your-vps "cd /opt/Trajecta && ./deploy-vps-remote.sh restart"
```

This script runs only on Linux server and forwards action to `deploy-vps.sh` in the same repo directory.

## 10) Notes and troubleshooting

- First TLS issue is usually DNS/port 80-443/firewall problem.
- If cert issuance fails, inspect edge logs first.
- If frontend 404 under `/trajecta`, verify `VITE_APP_BASE_PATH=/trajecta/`.
- If websocket fails, verify `VITE_API_BASE_URL=/trajecta` and `VITE_WS_PATH=/ws`.

## 11) Security recommendations

- Keep `.env.vps` only on server and out of git.
- Disable SSH password login; use key-based auth.
- Configure regular backups for DB and MinIO volumes.
- Enable host-level monitoring and alerts.
