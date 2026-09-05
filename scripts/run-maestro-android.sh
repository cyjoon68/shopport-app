#!/bin/sh
set -eu

: "${MAESTRO_RESULTS:=${RUNNER_TEMP:-/tmp}/shopport-maestro}"
: "${RECOVERY_PROXY_URL:=http://127.0.0.1:4000/__recovery__}"

app_id="com.cyjoon68.shopport"
metro_pid=""

sanitize_text() {
  sed \
    -e 's/토너 패드 최저가 찾아줘/[redacted-question]/g' \
    -e 's/maestro-identity-token/[redacted-token]/g' \
    -e 's/maestro-identity-nonce/[redacted-nonce]/g' \
    -E -e 's/([Aa]uthorization:?)[[:space:]]*[Bb]earer[[:space:]]+.*/\1 [redacted]/g'
}

capture_failure() {
  mkdir -p "$MAESTRO_RESULTS/failure"
  adb exec-out screencap -p > "$MAESTRO_RESULTS/failure/screen.png" 2>/dev/null || true
  maestro hierarchy 2>&1 | sanitize_text > "$MAESTRO_RESULTS/failure/hierarchy.txt" || true
  adb logcat -d 2>&1 | sanitize_text > "$MAESTRO_RESULTS/failure/android-logcat.txt" || true
}

cleanup() {
  status=$?
  if test "$status" -ne 0; then
    capture_failure
  fi
  if test -n "$metro_pid"; then
    kill "$metro_pid" 2>/dev/null || true
    wait "$metro_pid" 2>/dev/null || true
  fi
}

trap cleanup EXIT
trap 'exit 130' INT TERM

wait_for_metro() {
  for attempt in $(seq 1 120); do
    if curl --fail --silent http://127.0.0.1:8081/status | grep -q 'packager-status:running'; then
      return
    fi
    if ! kill -0 "$metro_pid" 2>/dev/null; then
      tail -n 200 "$MAESTRO_RESULTS/metro.log"
      return 1
    fi
    sleep 1
  done
  tail -n 200 "$MAESTRO_RESULTS/metro.log"
  return 1
}

wait_for_proxy() {
  condition=$1
  output=$2
  for attempt in $(seq 1 160); do
    if curl --fail --silent --show-error "$RECOVERY_PROXY_URL/state" > "$output"; then
      if node - "$condition" "$output" <<'NODE'
import { readFileSync } from "node:fs";

const condition = process.argv[2];
const state = JSON.parse(readFileSync(process.argv[3], "utf8"));
const matched =
  condition === "hot"
    ? state.phase === "holding-hot-retry" && state.upstreamComplete === true
    : condition === "closed"
      ? state.hotRetryClosed === true && state.upstreamComplete === true
      : state.phase === "complete";
process.exit(matched ? 0 : 1);
NODE
      then
        return
      fi
    fi
    sleep 0.25
  done
  sanitize_text < "$output" >&2
  return 1
}

state_uuid() {
  field=$1
  state_file=$2
  node - "$field" "$state_file" <<'NODE'
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const field = process.argv[2];
const state = JSON.parse(readFileSync(process.argv[3], "utf8"));
const value = state[field];
assert.match(
  value,
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu,
);
process.stdout.write(value);
NODE
}

capture_sqlite() {
  destination=$1
  mkdir -p "$destination"
  : > "$destination/files.txt"
  for sqlite_file in shopport.db shopport.db-wal shopport.db-shm; do
    if adb shell run-as "$app_id" ls "files/SQLite/$sqlite_file" >/dev/null 2>&1; then
      adb exec-out run-as "$app_id" cat "files/SQLite/$sqlite_file" \
        > "$destination/$sqlite_file"
      printf '%s\n' "$sqlite_file" >> "$destination/files.txt"
    fi
  done
  test -s "$destination/shopport.db"
  sha256sum "$destination"/shopport.db* > "$destination/sha256.txt"
}

capture_attempt() {
  destination=$1
  adb exec-out screencap -p > "$destination/screen.png"
  maestro hierarchy 2>&1 | sanitize_text > "$destination/hierarchy.txt"
  app_pid=$(adb shell pidof "$app_id" | tr -d '\r')
  if test -n "$app_pid"; then
    adb logcat -d --pid="$app_pid" 2>&1 | sanitize_text > "$destination/android-logcat.txt"
  else
    adb logcat -d 2>&1 | sanitize_text > "$destination/android-logcat.txt"
  fi
}

assert_proxy_evidence() {
  state_file=$1
  node - "$state_file" <<'NODE'
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const state = JSON.parse(readFileSync(process.argv[2], "utf8"));
assert.equal(state.phase, "complete");
assert.equal(state.requestCount, 3);
assert.equal(typeof state.firstInitialEnvelopeId, "string");
assert.equal(state.firstColdEnvelopeId, state.firstInitialEnvelopeId);
assert.equal(state.requests[0]?.kind, "initial");
assert.equal(state.requests[0]?.method, "POST");
assert.equal(state.requests[0]?.lastEventId, null);
assert.equal(state.requests[1]?.kind, "hot-retry");
assert.equal(state.requests[1]?.method, "POST");
assert.equal(state.requests[1]?.lastEventId, state.faultEventId);
assert.equal(state.requests[2]?.kind, "cold-join");
assert.equal(state.requests[2]?.method, "GET");
assert.equal(
  state.requests[2]?.path,
  `/v1/ai/chat?offset=-1&runId=${state.runId}`,
);
assert.equal(state.requests[2]?.xRunId, null);
assert.equal(state.requests[2]?.lastEventId, null);
NODE
}

run_maestro() {
  report=$1
  shift
  raw_report="$report.raw"
  raw_output="$report.output.raw"
  if maestro test --format junit --output "$raw_report" "$@" > "$raw_output" 2>&1; then
    maestro_status=0
  else
    maestro_status=$?
  fi
  sanitize_text < "$raw_output" > "${report%.xml}.log"
  cat "${report%.xml}.log"
  if test -f "$raw_report"; then
    sanitize_text < "$raw_report" > "$report"
  fi
  rm -f "$raw_output" "$raw_report"
  return "$maestro_status"
}

mkdir -p "$MAESTRO_RESULTS"
CI=1 pnpm --dir shopport-fe exec expo start --dev-client --port 8081 \
  > "$MAESTRO_RESULTS/metro.log" 2>&1 &
metro_pid=$!
wait_for_metro
adb reverse tcp:8081 tcp:8081
pnpm --dir shopport-fe exec expo run:android --variant debug --no-bundler
adb shell run-as "$app_id" id > "$MAESTRO_RESULTS/run-as.txt"
api_level=$(adb shell getprop ro.build.version.sdk | tr -d '\r')
abi=$(adb shell getprop ro.product.cpu.abi | tr -d '\r')
if adb shell 'command -v sqlite3' >/dev/null 2>&1; then
  device_sqlite=true
else
  device_sqlite=false
fi
node - "$api_level" "$abi" "$device_sqlite" > "$MAESTRO_RESULTS/environment.json" <<'NODE'
const [apiLevel, abi, deviceSqlite] = process.argv.slice(2);
process.stdout.write(
  `${JSON.stringify(
    {
      abi,
      apiLevel,
      appVariant: "debug",
      attempts: 5,
      deviceSqlite: deviceSqlite === "true",
      emulator: "pixel_7",
      metro: true,
      sqliteVerifier: "node:sqlite",
    },
    null,
    2,
  )}\n`,
);
NODE

for recovery_attempt in $(seq 1 5); do
  attempt_directory="$MAESTRO_RESULTS/attempt-$recovery_attempt"
  mkdir -p "$attempt_directory"
  adb logcat -c
  curl --fail --silent --show-error \
    -H 'content-type: application/json' \
    -d "{\"attempt\":$recovery_attempt}" \
    "$RECOVERY_PROXY_URL/arm" > "$attempt_directory/arm.json"
  run_maestro \
    "$attempt_directory/start-report.xml" \
    shopport-fe/e2e/recovery-start.yaml
  wait_for_proxy hot "$attempt_directory/hot-state.json"
  run_id=$(state_uuid runId "$attempt_directory/hot-state.json")
  thread_id=$(state_uuid threadId "$attempt_directory/hot-state.json")
  sleep 1
  adb shell am force-stop "$app_id"
  wait_for_proxy closed "$attempt_directory/stopped-state.json"
  capture_sqlite "$attempt_directory/before-cold"
  node scripts/verify-android-recovery.mjs \
    before \
    "$attempt_directory/before-cold/shopport.db" \
    "$run_id" \
    "$thread_id" \
    "$attempt_directory/before-cold/verification.json"
  curl --fail --silent --show-error \
    -H 'content-type: application/json' \
    -d '{}' \
    "$RECOVERY_PROXY_URL/release" > "$attempt_directory/release.json"
  adb shell am start -W \
    -a android.intent.action.VIEW \
    -c android.intent.category.BROWSABLE \
    -d "shopport:///?id=$thread_id" \
    "$app_id" > "$attempt_directory/deep-link.txt"
  wait_for_proxy complete "$attempt_directory/complete-state.json"
  assert_proxy_evidence "$attempt_directory/complete-state.json"
  run_maestro \
    "$attempt_directory/verify-report.xml" \
    shopport-fe/e2e/recovery-verify.yaml
  capture_attempt "$attempt_directory"
  sleep 1
  adb shell am force-stop "$app_id"
  capture_sqlite "$attempt_directory/after-cold"
  node scripts/verify-android-recovery.mjs \
    after \
    "$attempt_directory/after-cold/shopport.db" \
    "$run_id" \
    "$thread_id" \
    "$attempt_directory/after-cold/verification.json"
done

mkdir -p "$MAESTRO_RESULTS/normal"
run_maestro \
  "$MAESTRO_RESULTS/normal/report.xml" \
  shopport-fe/e2e/quick-action-composer.yaml \
  shopport-fe/e2e/drawer-gesture.yaml \
  shopport-fe/e2e/agent-control.yaml
