#!/bin/sh
set -eu

: "${MAESTRO_RESULTS:=${RUNNER_TEMP:-/tmp}/shopport-maestro}"
: "${RECOVERY_PROXY_URL:=http://127.0.0.1:4000/__recovery__}"
: "${MAESTRO_API_URL:=http://127.0.0.1:4000}"

app_id="com.cyjoon68.shopport"
metro_pid=""
metro_log_raw="$MAESTRO_RESULTS/metro.raw.log"

sanitize_text() {
  sed \
    -e 's/토너 패드 최저가 찾아줘/[redacted-question]/g' \
    -e 's/maestro-identity-token/[redacted-token]/g' \
    -e 's/maestro-identity-nonce/[redacted-nonce]/g' \
    -E -e 's/([Aa]uthorization:?)[[:space:]]*[Bb]earer[[:space:]]+.*/\1 [redacted]/g' \
    -e 's/([Xx]-[Aa]mz-[Cc]redential=)[^&[:space:]]+/\1[redacted]/g' \
    -e 's/([Xx]-[Aa]mz-[Ss]ignature=)[^&[:space:]]+/\1[redacted]/g' \
    -e 's/([Xx]-[Aa]mz-[Ss]ecurity-[Tt]oken=)[^&[:space:]]+/\1[redacted]/g' \
    -e 's/(accessToken|refreshToken)"?:[[:space:]]*"[^"]+"/\1":"[redacted]"/g'
}

capture_failure() {
  failure_directory="${attempt_directory:-$MAESTRO_RESULTS}/failure"
  mkdir -p "$failure_directory"
  adb exec-out screencap -p > "$failure_directory/screen.png" 2>/dev/null || true
  maestro hierarchy 2>&1 | sanitize_text > "$failure_directory/hierarchy.txt" || true
  adb logcat -d 2>&1 | sanitize_text > "$failure_directory/android-logcat.txt" || true
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
  if test -f "$metro_log_raw"; then
    sanitize_text < "$metro_log_raw" > "$MAESTRO_RESULTS/metro.log"
    rm -f "$metro_log_raw"
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
      tail -n 200 "$metro_log_raw" | sanitize_text
      return 1
    fi
    sleep 1
  done
  tail -n 200 "$metro_log_raw" | sanitize_text
  return 1
}

wait_for_app() {
  output="$MAESTRO_RESULTS/bootstrap-hierarchy.txt"
  for attempt in $(seq 1 120); do
    if maestro hierarchy 2>/dev/null | sanitize_text > "$output" &&
      grep -Eq 'Continue|카카오로 시작하기|메뉴 열기' "$output"; then
      return
    fi
    sleep 1
  done
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
if (field === "runId") assert.match(value, /^[^\r\n]{1,200}$/u);
else
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
  mkdir -p "$destination"
  adb exec-out screencap -p > "$destination/screen.png"
  maestro hierarchy 2>&1 | sanitize_text > "$destination/hierarchy.txt"
  app_pid=$(adb shell pidof "$app_id" 2>/dev/null | tr -d '\r' || true)
  if test -n "$app_pid"; then
    adb logcat -d --pid="$app_pid" 2>&1 | sanitize_text > "$destination/android-logcat.txt"
  else
    adb logcat -d 2>&1 | sanitize_text > "$destination/android-logcat.txt"
  fi
}

assert_uuid() {
  node - "$1" <<'NODE'
import assert from "node:assert/strict";

assert.match(
  process.argv[2],
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu,
);
NODE
}

assert_fixture_text() {
  node - "$1" <<'NODE'
import assert from "node:assert/strict";

assert.match(process.argv[2], /^s[457]-(?:draft|before|after)-[1-5]$/u);
NODE
}

device_sqlite_query() {
  printf '%s\n' "$1" | adb shell run-as "$app_id" sqlite3 files/SQLite/shopport.db \
    | tr -d '\r'
}

wait_for_sqlite_count() {
  sql=$1
  output=$2
  for attempt in $(seq 1 120); do
    result=$(device_sqlite_query "$sql" 2> "$output.error" || true)
    printf '%s\n' "$result" > "$output"
    if test "$result" = "1"; then
      rm -f "$output.error"
      return
    fi
    sleep 0.25
  done
  return 1
}

open_conversation() {
  conversation_id=$1
  output=$2
  assert_uuid "$conversation_id"
  adb shell am start -W \
    -a android.intent.action.VIEW \
    -c android.intent.category.BROWSABLE \
    -d "shopport:///?id=$conversation_id" \
    "$app_id" > "$output"
}

create_conversation() {
  node --input-type=module - "$MAESTRO_API_URL" <<'NODE'
import assert from "node:assert/strict";

const baseUrl = process.argv[2];
const login = await fetch(`${baseUrl}/v1/auth/kakao`, {
  body: JSON.stringify({
    identityToken: "maestro-identity-token",
    nonce: "maestro-identity-nonce",
  }),
  headers: { "content-type": "application/json" },
  method: "POST",
});
assert.equal(login.status, 200, "E2E login failed");
const tokens = await login.json();
assert.equal(typeof tokens.accessToken, "string", "Missing E2E access token");
const response = await fetch(`${baseUrl}/graphql`, {
  body: JSON.stringify({
    query:
      "mutation Create($input: CreateConversationInput!) { createConversation(input: $input) { conversation { id } userErrors { code } } }",
    variables: { input: {} },
  }),
  headers: {
    authorization: `Bearer ${tokens.accessToken}`,
    "content-type": "application/json",
  },
  method: "POST",
});
assert.equal(response.status, 200, "E2E conversation request failed");
const payload = await response.json();
const conversationId = payload.data?.createConversation?.conversation?.id;
assert.match(
  conversationId ?? "",
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu,
  "E2E conversation creation failed",
);
process.stdout.write(conversationId);
NODE
}

create_synthetic_image() {
  output=$1
  attempt=$2
  node --input-type=module - "$output" "$attempt" <<'NODE'
import { createRequire } from "node:module";

const require = createRequire(`${process.cwd()}/shopport-be/package.json`);
const sharp = require("sharp");
const output = process.argv[2];
const attempt = Number(process.argv[3]);
await sharp({
  create: {
    background: { alpha: 1, b: 110 + attempt, g: 70, r: 30 },
    channels: 4,
    height: 96,
    width: 96,
  },
})
  .png()
  .toFile(output);
NODE
}

verify_asset_upload() {
  asset_id=$1
  conversation_id=$2
  output=$3
  assert_uuid "$asset_id"
  assert_uuid "$conversation_id"
  node --input-type=module - "$asset_id" "$conversation_id" "$output" <<'NODE'
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname } from "node:path";

const require = createRequire(`${process.cwd()}/shopport-be/package.json`);
const { HeadObjectCommand, S3Client } = require("@aws-sdk/client-s3");
const { Pool } = require("pg");
const [assetId, conversationId, output] = process.argv.slice(2);
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
let row;
try {
  const result = await pool.query(
    `select original_key as "objectKey",
            content_type as "contentType",
            byte_size::text as "byteSize"
     from assets
     where id = $1 and conversation_id = $2`,
    [assetId, conversationId],
  );
  assert.equal(result.rows.length, 1, "Missing GraphQL-created asset");
  row = result.rows[0];
} finally {
  await pool.end();
}
const bucket = process.env.RAW_ASSET_BUCKET ?? process.env.ASSET_BUCKET;
assert.ok(bucket, "Missing raw asset bucket");
const s3 = new S3Client({
  credentials: { accessKeyId: "test", secretAccessKey: "test" },
  endpoint: process.env.AWS_ENDPOINT_URL,
  forcePathStyle: true,
  region: process.env.AWS_REGION ?? "ap-northeast-2",
});
const head = await s3.send(
  new HeadObjectCommand({ Bucket: bucket, Key: row.objectKey }),
);
assert.equal(head.ContentType, row.contentType);
assert.equal(BigInt(head.ContentLength ?? -1), BigInt(row.byteSize));
const evidence = {
  assetId,
  bucket,
  byteSize: row.byteSize,
  contentType: row.contentType,
  conversationId,
  objectKey: row.objectKey,
};
await mkdir(dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify(evidence, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(evidence)}\n`);
NODE
}

install_failure_trigger() {
  conversation_id=$1
  after_text=$2
  assert_uuid "$conversation_id"
  assert_fixture_text "$after_text"
  device_sqlite_query "
    DROP TRIGGER IF EXISTS e2e_force_draft_failure;
    DROP TABLE IF EXISTS e2e_draft_write_audit;
    CREATE TABLE e2e_draft_write_audit (
      conversation_id TEXT NOT NULL,
      attempted_text TEXT NOT NULL
    );
    CREATE TRIGGER e2e_force_draft_failure
    BEFORE INSERT ON draft
    WHEN NEW.conversation_id = '$conversation_id' AND NEW.text = '$after_text'
    BEGIN
      INSERT INTO e2e_draft_write_audit (conversation_id, attempted_text)
      VALUES (NEW.conversation_id, NEW.text);
      SELECT RAISE(FAIL, 'e2e forced draft write failure');
    END;
  " > /dev/null
}

remove_failure_trigger() {
  device_sqlite_query "
    DROP TRIGGER IF EXISTS e2e_force_draft_failure;
    DROP TABLE IF EXISTS e2e_draft_write_audit;
  " > /dev/null
}

write_attempt_result() {
  destination=$1
  attempt=$2
  node --input-type=module - "$destination" "$attempt" <<'NODE'
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const [directory, attemptText] = process.argv.slice(2);
const read = async (...segments) =>
  JSON.parse(await readFile(join(directory, ...segments), "utf8"));
const s4Before = await read("s4", "after-background", "verification.json");
const s4After = await read("s4", "after-relaunch", "verification.json");
assert.equal(s4After.assetId, s4Before.assetId);
assert.equal(s4After.assetUri, s4Before.assetUri);
assert.equal(s4After.text, s4Before.text);
const s5Before = await read("s5", "before-switch", "verification.json");
const s5After = await read("s5", "after-switch", "verification.json");
assert.deepEqual(s5After, s5Before);
const s7Failure = await read("s7", "after-failure", "verification.json");
const s7Relaunch = await read("s7", "after-relaunch", "verification.json");
assert.deepEqual(s7Relaunch, s7Failure);
const result = {
  attempt: Number(attemptText),
  recovery: await read("after-cold", "verification.json"),
  s4: {
    afterBackground: s4Before,
    afterRelaunch: s4After,
    upload: await read("s4", "upload.json"),
  },
  s5: {
    afterSwitch: s5After,
    beforeSwitch: s5Before,
    terminal: await read("s5", "terminal", "verification.json"),
  },
  s7: {
    afterFailure: s7Failure,
    afterRelaunch: s7Relaunch,
    beforeFailure: await read("s7", "before-failure", "verification.json"),
  },
};
await writeFile(join(directory, "result.json"), `${JSON.stringify(result, null, 2)}\n`);
NODE
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
  > "$metro_log_raw" 2>&1 &
metro_pid=$!
wait_for_metro
adb reverse tcp:8081 tcp:8081
adb reverse tcp:4566 tcp:4566
pnpm --dir shopport-fe exec expo run:android --variant debug --no-bundler
wait_for_app
adb shell run-as "$app_id" id > "$MAESTRO_RESULTS/run-as.txt"
api_level=$(adb shell getprop ro.build.version.sdk | tr -d '\r')
abi=$(adb shell getprop ro.product.cpu.abi | tr -d '\r')
if adb shell run-as "$app_id" sqlite3 -version \
  > "$MAESTRO_RESULTS/device-sqlite.txt" 2>&1; then
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
if test "$device_sqlite" != "true"; then
  sanitize_text < "$MAESTRO_RESULTS/device-sqlite.txt" >&2
  exit 1
fi

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

  s4_directory="$attempt_directory/s4"
  s4_text="s4-draft-$recovery_attempt"
  synthetic_image="${RUNNER_TEMP:-/tmp}/shopport-synthetic-$recovery_attempt.png"
  remote_image="/sdcard/Pictures/shopport-synthetic.png"
  mkdir -p "$s4_directory/compose"
  assert_fixture_text "$s4_text"
  create_synthetic_image "$synthetic_image" "$recovery_attempt"
  adb shell mkdir -p /sdcard/Pictures
  adb push "$synthetic_image" "$remote_image" \
    2>&1 | sanitize_text > "$s4_directory/media-import.txt"
  rm -f "$synthetic_image"
  adb shell am broadcast \
    -a android.intent.action.MEDIA_SCANNER_SCAN_FILE \
    -d "file://$remote_image" \
    > "$s4_directory/media-scan.txt"
  sleep 2
  adb shell pm grant "$app_id" android.permission.READ_MEDIA_IMAGES \
    > "$s4_directory/media-permission.txt" 2>&1 || true
  open_conversation "$thread_id" "$s4_directory/deep-link-before-compose.txt"
  run_maestro \
    "$s4_directory/compose/report.xml" \
    -e "DRAFT_TEXT=$s4_text" \
    shopport-fe/e2e/storage-attach-draft.yaml
  adb shell input keyevent KEYCODE_HOME
  wait_for_sqlite_count \
    "SELECT count(*) FROM draft WHERE conversation_id = '$thread_id' AND text = '$s4_text' AND asset_id IS NOT NULL AND asset_uri IS NOT NULL;" \
    "$s4_directory/live-commit.txt"
  adb shell am force-stop "$app_id"
  capture_sqlite "$s4_directory/after-background"
  node scripts/verify-android-recovery.mjs \
    draft \
    "$s4_directory/after-background/shopport.db" \
    "$thread_id" \
    "$s4_text" \
    "$s4_directory/after-background/verification.json"
  asset_id=$(state_uuid assetId "$s4_directory/after-background/verification.json")
  verify_asset_upload "$asset_id" "$thread_id" "$s4_directory/upload.json"
  open_conversation "$thread_id" "$s4_directory/deep-link-after-background.txt"
  run_maestro \
    "$s4_directory/relaunch-report.xml" \
    -e "DRAFT_TEXT=$s4_text" \
    shopport-fe/e2e/storage-verify-attachment.yaml
  capture_attempt "$s4_directory/ui-after-relaunch"
  adb shell am force-stop "$app_id"
  capture_sqlite "$s4_directory/after-relaunch"
  node scripts/verify-android-recovery.mjs \
    draft \
    "$s4_directory/after-relaunch/shopport.db" \
    "$thread_id" \
    "$s4_text" \
    "$s4_directory/after-relaunch/verification.json"

  s5_directory="$attempt_directory/s5"
  s5_text="s5-draft-$recovery_attempt"
  mkdir -p "$s5_directory/compose"
  assert_fixture_text "$s5_text"
  conversation_b=$(create_conversation)
  assert_uuid "$conversation_b"
  node - "$thread_id" "$conversation_b" > "$s5_directory/conversations.json" <<'NODE'
const [conversationA, conversationB] = process.argv.slice(2);
process.stdout.write(`${JSON.stringify({ conversationA, conversationB }, null, 2)}\n`);
NODE
  open_conversation "$conversation_b" "$s5_directory/deep-link-before-compose.txt"
  run_maestro \
    "$s5_directory/compose/report.xml" \
    -e "DRAFT_TEXT=$s5_text" \
    shopport-fe/e2e/storage-replace-draft.yaml
  adb shell input keyevent KEYCODE_HOME
  wait_for_sqlite_count \
    "SELECT count(*) FROM draft WHERE conversation_id = '$conversation_b' AND text = '$s5_text' AND asset_id IS NULL AND asset_uri IS NULL;" \
    "$s5_directory/live-b-commit.txt"
  adb shell am force-stop "$app_id"
  capture_sqlite "$s5_directory/before-switch"
  node scripts/verify-android-recovery.mjs \
    isolation \
    "$s5_directory/before-switch/shopport.db" \
    "$thread_id" \
    "$s4_text" \
    "$conversation_b" \
    "$s5_text" \
    "$s5_directory/before-switch/verification.json"
  open_conversation "$thread_id" "$s5_directory/deep-link-a.txt"
  sleep 0.2
  open_conversation "$conversation_b" "$s5_directory/deep-link-b.txt"
  run_maestro \
    "$s5_directory/switch-report.xml" \
    -e "EXPECTED_TEXT=$s5_text" \
    -e "ABSENT_TEXT=$s4_text" \
    shopport-fe/e2e/storage-verify-draft.yaml
  capture_attempt "$s5_directory/ui-after-switch"
  adb shell am force-stop "$app_id"
  capture_sqlite "$s5_directory/after-switch"
  node scripts/verify-android-recovery.mjs \
    isolation \
    "$s5_directory/after-switch/shopport.db" \
    "$thread_id" \
    "$s4_text" \
    "$conversation_b" \
    "$s5_text" \
    "$s5_directory/after-switch/verification.json"
  open_conversation "$conversation_b" "$s5_directory/deep-link-before-cancel.txt"
  run_maestro \
    "$s5_directory/cancel-retry-report.xml" \
    -e "DRAFT_TEXT=$s5_text" \
    shopport-fe/e2e/storage-cancel-retry.yaml
  capture_attempt "$s5_directory/ui-after-terminal"
  adb shell input keyevent KEYCODE_HOME
  wait_for_sqlite_count \
    "SELECT count(*) FROM chat_cache WHERE id = '$conversation_b' AND instr(payload, '\"resume\"') = 0 AND instr(payload, '조건에 맞는 상품 다섯 개를 찾았어요.') > 0;" \
    "$s5_directory/live-terminal.txt"
  adb shell am force-stop "$app_id"
  capture_sqlite "$s5_directory/terminal"
  node scripts/verify-android-recovery.mjs \
    terminal \
    "$s5_directory/terminal/shopport.db" \
    "$conversation_b" \
    "$s5_directory/terminal/verification.json"

  s7_directory="$attempt_directory/s7"
  s7_before_text="s7-before-$recovery_attempt"
  s7_after_text="s7-after-$recovery_attempt"
  mkdir -p "$s7_directory/compose-before" "$s7_directory/compose-after"
  assert_fixture_text "$s7_before_text"
  assert_fixture_text "$s7_after_text"
  open_conversation "$conversation_b" "$s7_directory/deep-link-before-draft.txt"
  run_maestro \
    "$s7_directory/compose-before/report.xml" \
    -e "DRAFT_TEXT=$s7_before_text" \
    shopport-fe/e2e/storage-replace-draft.yaml
  adb shell input keyevent KEYCODE_HOME
  wait_for_sqlite_count \
    "SELECT count(*) FROM draft WHERE conversation_id = '$conversation_b' AND text = '$s7_before_text' AND asset_id IS NULL AND asset_uri IS NULL;" \
    "$s7_directory/live-before.txt"
  adb shell am force-stop "$app_id"
  capture_sqlite "$s7_directory/before-failure"
  node scripts/verify-android-recovery.mjs \
    isolation \
    "$s7_directory/before-failure/shopport.db" \
    "$thread_id" \
    "$s4_text" \
    "$conversation_b" \
    "$s7_before_text" \
    "$s7_directory/before-failure/verification.json"
  install_failure_trigger "$conversation_b" "$s7_after_text"
  open_conversation "$conversation_b" "$s7_directory/deep-link-before-failure.txt"
  run_maestro \
    "$s7_directory/precondition-report.xml" \
    -e "EXPECTED_TEXT=$s7_before_text" \
    -e "ABSENT_TEXT=$s7_after_text" \
    shopport-fe/e2e/storage-verify-draft.yaml
  run_maestro \
    "$s7_directory/compose-after/report.xml" \
    -e "DRAFT_TEXT=$s7_after_text" \
    shopport-fe/e2e/storage-replace-draft.yaml
  adb shell input keyevent KEYCODE_HOME
  wait_for_sqlite_count \
    "SELECT CASE WHEN (SELECT count(*) FROM e2e_draft_write_audit WHERE conversation_id = '$conversation_b' AND attempted_text = '$s7_after_text') = 1 AND (SELECT count(*) FROM draft WHERE conversation_id = '$conversation_b' AND text = '$s7_before_text') = 1 AND (SELECT count(*) FROM draft WHERE conversation_id = '$conversation_b' AND text = '$s7_after_text') = 0 THEN 1 ELSE 0 END;" \
    "$s7_directory/live-failure.txt"
  adb shell am force-stop "$app_id"
  capture_sqlite "$s7_directory/after-failure"
  node scripts/verify-android-recovery.mjs \
    failed-draft \
    "$s7_directory/after-failure/shopport.db" \
    "$conversation_b" \
    "$s7_before_text" \
    "$s7_after_text" \
    "$s7_directory/after-failure/verification.json"
  open_conversation "$conversation_b" "$s7_directory/deep-link-after-failure.txt"
  run_maestro \
    "$s7_directory/relaunch-report.xml" \
    -e "EXPECTED_TEXT=$s7_before_text" \
    -e "ABSENT_TEXT=$s7_after_text" \
    shopport-fe/e2e/storage-verify-draft.yaml
  capture_attempt "$s7_directory/ui-after-relaunch"
  adb shell am force-stop "$app_id"
  capture_sqlite "$s7_directory/after-relaunch"
  node scripts/verify-android-recovery.mjs \
    failed-draft \
    "$s7_directory/after-relaunch/shopport.db" \
    "$conversation_b" \
    "$s7_before_text" \
    "$s7_after_text" \
    "$s7_directory/after-relaunch/verification.json"
  remove_failure_trigger
  write_attempt_result "$attempt_directory" "$recovery_attempt"
done

adb shell rm -f /sdcard/Pictures/shopport-synthetic.png

mkdir -p "$MAESTRO_RESULTS/normal"
run_maestro \
  "$MAESTRO_RESULTS/normal/report.xml" \
  shopport-fe/e2e/quick-action-composer.yaml \
  shopport-fe/e2e/drawer-gesture.yaml \
  shopport-fe/e2e/agent-control.yaml
