#!/usr/bin/env sh
set -eu

COMPOSE_FILE="docker-compose.vps.yml"
ENV_FILE=".env.vps"

if [ ! -f "$COMPOSE_FILE" ]; then
  echo "[ERROR] Missing $COMPOSE_FILE in current directory"
  exit 1
fi

if [ ! -f "$ENV_FILE" ]; then
  echo "[ERROR] Missing $ENV_FILE. Create it from .env.vps.example"
  exit 1
fi

run_compose() {
  docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"
}

action="${1:-up}"

case "$action" in
  up)
    run_compose up -d --build --remove-orphans
    ;;
  pull)
    run_compose pull
    ;;
  down)
    run_compose down --remove-orphans
    ;;
  restart)
    run_compose up -d --build --force-recreate --remove-orphans
    ;;
  logs)
    run_compose logs -f --tail=200
    ;;
  status)
    run_compose ps
    ;;
  validate)
    run_compose config > /dev/null
    echo "[OK] Compose config is valid"
    ;;
  *)
    echo "Usage: ./deploy-vps.sh [up|pull|down|restart|logs|status|validate]"
    exit 1
    ;;
esac
