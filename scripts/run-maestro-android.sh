#!/bin/sh
set -eu

: "${MAESTRO_RESULTS:=${RUNNER_TEMP:-/tmp}/shopport-maestro}"

pnpm --dir shopport-fe --filter @shopport/mobile exec expo run:android --variant release --no-bundler
adb shell pm clear com.cyjoon68.shopport
mkdir -p "$MAESTRO_RESULTS/artifacts"
set +e
maestro test \
  --format junit \
  --output "$MAESTRO_RESULTS/report.xml" \
  shopport-fe/apps/mobile/e2e/quick-action-composer.yaml \
  shopport-fe/apps/mobile/e2e/drawer-gesture.yaml \
  shopport-fe/apps/mobile/e2e/agent-control.yaml
maestro_status=$?
maestro_default_output="${HOME:?}/.maestro/tests"
if test -d "$maestro_default_output"; then
  cp -R "$maestro_default_output/." "$MAESTRO_RESULTS/artifacts/"
fi
adb exec-out screencap -p > "$MAESTRO_RESULTS/artifacts/final-screen.png"
maestro hierarchy > "$MAESTRO_RESULTS/artifacts/final-hierarchy.txt" 2>&1
adb logcat -d > "$MAESTRO_RESULTS/artifacts/android-logcat.txt" 2>&1
set -e
exit "$maestro_status"
