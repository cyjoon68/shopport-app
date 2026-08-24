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

if ! node --env-file=shopport-be/.env -e 'process.exit(process.env.COMMAND_CODE_API_KEY ? 0 : 1)' || [ -z "${KAKAO_IDENTITY_TOKEN:-}" ] || [ -z "${KAKAO_IDENTITY_NONCE:-}" ]; then
  echo "Integration E2E requires Command Code and Kakao credentials" >&2
  exit 1
fi

cleanup() {
  docker compose --env-file shopport-infra/.env --env-file shopport-be/.env down --volumes --remove-orphans
}
trap cleanup EXIT INT TERM

docker compose --env-file shopport-infra/.env --env-file shopport-be/.env up --build --wait api
node ./scripts/integration-e2e.mjs
