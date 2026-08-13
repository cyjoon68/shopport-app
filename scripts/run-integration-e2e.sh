#!/bin/sh
set -eu

: "${COMPOSE_PROJECT_NAME:=shopport-e2e}"
: "${POSTGRES_PORT:=55432}"
: "${REDIS_PORT:=56379}"
: "${API_PORT:=44000}"
: "${SHOPPORT_API_URL:=http://127.0.0.1:${API_PORT}}"
: "${COMPOSE_PROGRESS:=plain}"
export API_PORT COMPOSE_PROGRESS COMPOSE_PROJECT_NAME POSTGRES_PORT REDIS_PORT
export SHOPPORT_API_URL

cleanup() {
  docker compose down --volumes --remove-orphans
}
trap cleanup EXIT INT TERM

docker compose up --build --wait api
node ./scripts/integration-e2e.mjs
