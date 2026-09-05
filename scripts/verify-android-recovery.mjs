import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { pathToFileURL } from "node:url";

const requireFromBackend = createRequire(
  new URL("../shopport-be/package.json", import.meta.url),
);
const { Pool } = requireFromBackend("pg");
const expectedText = "조건에 맞는 상품 다섯 개를 찾았어요.";
const expectedProductIds = [95, 96, 97, 98, 99].map(
  (suffix) => `0198a122-0c00-7000-8000-${String(suffix).padStart(12, "0")}`,
);
const expectedEventTypes = [
  "CUSTOM",
  "RUN_STARTED",
  "TOOL_CALL_START",
  "TOOL_CALL_ARGS",
  "TOOL_CALL_END",
  "TOOL_CALL_RESULT",
  "TEXT_MESSAGE_START",
  "TEXT_MESSAGE_CONTENT",
  "TEXT_MESSAGE_CONTENT",
  "TEXT_MESSAGE_CONTENT",
  "TEXT_MESSAGE_END",
  "RUN_FINISHED",
];
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

const sortedProductIds = (parts) =>
  parts
    .flatMap((part) => {
      if (part?.type !== "tool-result" || typeof part.content !== "string")
        return [];
      let content;
      try {
        content = JSON.parse(part.content);
      } catch {
        return [];
      }
      return Array.isArray(content?.products)
        ? content.products.flatMap((product) =>
            typeof product?.id === "string" ? [product.id] : [],
          )
        : [];
    })
    .sort();

export const verifySqliteSnapshot = ({
  databasePath,
  phase,
  runId,
  threadId,
}) => {
  assert.match(runId, uuidPattern);
  assert.match(threadId, uuidPattern);
  assert.ok(phase === "before" || phase === "after");
  const database = new DatabaseSync(databasePath, { readOnly: true });
  let row;
  try {
    row = database
      .prepare("SELECT payload FROM chat_cache WHERE id = ?")
      .get(threadId);
  } finally {
    database.close();
  }
  assert.equal(typeof row?.payload, "string", "Missing native chat cache row");
  let persisted;
  try {
    persisted = JSON.parse(row.payload);
  } catch {
    assert.fail("Invalid native chat cache payload");
  }
  assert.ok(Array.isArray(persisted?.messages), "Invalid native chat messages");
  assert.equal(persisted.messages.length, 2, "Unexpected native message count");
  const messageIds = persisted.messages.map(({ id }) => id);
  assert.equal(
    new Set(messageIds).size,
    messageIds.length,
    "Duplicate message ID",
  );
  const assistant = persisted.messages.filter(
    ({ role }) => role === "assistant",
  );
  assert.equal(assistant.length, 1, "Unexpected native assistant count");
  assert.ok(
    Array.isArray(assistant[0]?.parts),
    "Missing native assistant parts",
  );
  const text = assistant[0].parts
    .flatMap((part) =>
      part?.type === "text" && typeof part.content === "string"
        ? [part.content]
        : [],
    )
    .join("");
  assert.equal(text, phase === "before" ? "조건에 맞는 " : expectedText);
  const productIds = sortedProductIds(assistant[0].parts);
  assert.deepEqual(productIds, expectedProductIds);
  const resumePresent = persisted.resume !== undefined;
  if (phase === "before") {
    assert.equal(persisted.resume?.resumeState?.runId, runId);
    assert.equal(persisted.resume?.resumeState?.threadId, threadId);
  } else {
    assert.equal(
      resumePresent,
      false,
      "Terminal native resume was not cleared",
    );
  }
  return {
    assistantCount: assistant.length,
    messageCount: persisted.messages.length,
    phase,
    productIds,
    resumePresent,
    runId,
    text,
    threadId,
  };
};

export const verifyPostgresRun = async ({ pool, runId, threadId }) => {
  const eventResult = await pool.query(
    `select id::text, chunk
     from ai_run_events
     where run_id = $1
     order by ai_run_events.id`,
    [runId],
  );
  const eventIds = eventResult.rows.map(({ id }) => id);
  assert.equal(eventIds.length, expectedEventTypes.length);
  assert.equal(new Set(eventIds).size, eventIds.length);
  assert.ok(
    eventIds.every(
      (id, index) =>
        /^\d+$/u.test(id) &&
        (index === 0 || BigInt(id) > BigInt(eventIds[index - 1])),
    ),
    "PostgreSQL event cursors are not strictly increasing",
  );
  const eventTypes = eventResult.rows.map(({ chunk }) => chunk?.type);
  assert.deepEqual(eventTypes, expectedEventTypes);
  const messageCount = await pool.query(
    `select count(*)::int as count
     from messages
     where conversation_id = $1 and role = 'assistant' and run_id = $2`,
    [threadId, runId],
  );
  assert.equal(messageCount.rows[0]?.count, 1);
  const persisted = await pool.query(
    `select r.status, r.stream_closed_at, p.kind, p.payload
     from ai_runs r
     left join messages m on m.run_id = r.id and m.role = 'assistant'
     left join message_parts p on p.message_id = m.id
     where r.id = $1
     order by p.position`,
    [runId],
  );
  assert.ok(persisted.rows.length > 0);
  assert.ok(persisted.rows.every(({ status }) => status === "completed"));
  assert.ok(persisted.rows.every(({ stream_closed_at }) => stream_closed_at));
  assert.equal(
    persisted.rows.find(({ kind }) => kind === "text")?.payload?.text,
    expectedText,
  );
  const productIds = persisted.rows
    .filter(({ kind }) => kind === "product_reference")
    .flatMap(({ payload }) =>
      typeof payload?.productId === "string" ? [payload.productId] : [],
    )
    .sort();
  assert.deepEqual(productIds, expectedProductIds);
  return {
    assistantCount: messageCount.rows[0].count,
    eventCount: eventIds.length,
    eventIds,
    eventTypes,
    productIds,
    runId,
    status: "completed",
    text: expectedText,
    threadId,
  };
};

const main = async () => {
  const [phase, databasePath, runId, threadId, outputPath] =
    process.argv.slice(2);
  assert.ok(
    phase === "before" || phase === "after",
    "Expected before or after",
  );
  assert.ok(
    databasePath && runId && threadId && outputPath,
    "Missing arguments",
  );
  const sqlite = verifySqliteSnapshot({ databasePath, phase, runId, threadId });
  let postgres = null;
  if (phase === "after") {
    assert.ok(
      process.env.DATABASE_URL,
      "DATABASE_URL is required after recovery",
    );
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    try {
      postgres = await verifyPostgresRun({ pool, runId, threadId });
    } finally {
      await pool.end();
    }
  }
  const evidence = { phase, postgres, sqlite };
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(evidence, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(evidence)}\n`);
};

const invokedPath = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href
  : "";
if (invokedPath === import.meta.url) {
  try {
    await main();
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? error.message : "Native recovery verification failed"}\n`,
    );
    process.exitCode = 1;
  }
}
