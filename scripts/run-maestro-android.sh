#!/bin/sh
set -eu

: "${MAESTRO_RESULTS:=${RUNNER_TEMP:-/tmp}/shopport-maestro}"

pnpm --dir shopport-fe --filter @shopport/mobile exec expo run:android --variant release --no-bundler
adb shell pm clear com.cyjoon68.shopport
mkdir -p "$MAESTRO_RESULTS/artifacts"
maestro_output="$(mktemp -d .maestro-ci-artifacts.XXXXXX)"
trap 'rm -rf -- "$maestro_output"' EXIT
set +e
maestro test \
  --format junit \
  --output "$MAESTRO_RESULTS/report.xml" \
  --test-output-dir "$maestro_output" \
  --debug-output "$maestro_output" \
  shopport-fe/apps/mobile/e2e/quick-action-composer.yaml \
  shopport-fe/apps/mobile/e2e/drawer-gesture.yaml \
  shopport-fe/apps/mobile/e2e/agent-control.yaml
maestro_status=$?
set -e
cp -R "$maestro_output/." "$MAESTRO_RESULTS/artifacts/"
exit "$maestro_status"
