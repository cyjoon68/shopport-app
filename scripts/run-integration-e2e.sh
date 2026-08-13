#!/bin/sh
set -eu

cleanup() {
  docker compose down --volumes --remove-orphans
}
trap cleanup EXIT INT TERM

docker compose up --build --wait api
node ./scripts/integration-e2e.mjs
