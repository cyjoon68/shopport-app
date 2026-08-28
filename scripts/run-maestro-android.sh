#!/bin/sh
set -eu

: "${MAESTRO_RESULTS:=${RUNNER_TEMP:-/tmp}/shopport-maestro}"

pnpm --dir shopport-fe --filter @shopport/mobile exec expo run:android --variant release --no-bundler
adb shell pm clear com.cyjoon68.shopport
mkdir -p "$MAESTRO_RESULTS/artifacts"
maestro test \
  --format junit \
  --output "$MAESTRO_RESULTS/report.xml" \
  --test-output-dir "$MAESTRO_RESULTS/artifacts" \
  --debug-output "$MAESTRO_RESULTS/artifacts" \
  shopport-fe/apps/mobile/e2e/quick-action-composer.yaml \
  shopport-fe/apps/mobile/e2e/drawer-gesture.yaml \
  shopport-fe/apps/mobile/e2e/agent-control.yaml
