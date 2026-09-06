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
const { validate: validateUuid, v5: uuidv5 } = requireFromBackend("uuid");
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
const runIdPattern = /^[^\r\n]{1,200}$/u;
const runIdNamespace = "00000000-0000-4000-8000-000000000001";

export const storageRunIdFor = (runId) =>
  validateUuid(runId) ? runId : uuidv5(runId, runIdNamespace);

const withDatabase = (databasePath, read) => {
  const database = new DatabaseSync(databasePath, { readOnly: true });
  try {
    return read(database);
  } finally {
    database.close();
  }
};

const draftRow = (database, conversationId) =>
  database
    .prepare(
      "SELECT text, asset_id AS assetId, asset_uri AS assetUri FROM draft WHERE conversation_id = ?",
    )
    .get(conversationId);

const persistedChat = (database, conversationId) => {
  const row = database
    .prepare("SELECT payload FROM chat_cache WHERE id = ?")
    .get(conversationId);
  assert.equal(typeof row?.payload, "string", "Missing native chat cache row");
  try {
    return JSON.parse(row.payload);
  } catch {
    assert.fail("Invalid native chat cache payload");
  }
};

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
  assert.match(runId, runIdPattern);
  assert.match(threadId, uuidPattern);
  assert.ok(phase === "before" || phase === "after");
  const persisted = withDatabase(databasePath, (database) =>
    persistedChat(database, threadId),
  );
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

export const verifyDraftAttachmentSnapshot = ({
  assetId,
  assetUri,
  conversationId,
  databasePath,
  text,
}) => {
  assert.match(conversationId, uuidPattern);
  const row = withDatabase(databasePath, (database) =>
    draftRow(database, conversationId),
  );
  assert.equal(row?.text, text, "Native draft text mismatch");
  assert.match(
    row?.assetId ?? "",
    uuidPattern,
    "Missing native draft asset ID",
  );
  assert.match(
    row?.assetUri ?? "",
    /^(?:content|file):\/\//u,
    "Missing native draft asset URI",
  );
  if (assetId !== undefined) assert.equal(row.assetId, assetId);
  if (assetUri !== undefined) assert.equal(row.assetUri, assetUri);
  return {
    assetId: row.assetId,
    assetUri: row.assetUri,
    assetUriScope: "same-install",
    conversationId,
    text: row.text,
  };
};

export const verifyDraftIsolationSnapshot = ({
  conversationA,
  conversationB,
  databasePath,
  textA,
  textB,
}) => {
  assert.match(conversationA, uuidPattern);
  assert.match(conversationB, uuidPattern);
  assert.notEqual(conversationA, conversationB);
  const { draftA, draftB } = withDatabase(databasePath, (database) => ({
    draftA: draftRow(database, conversationA),
    draftB: draftRow(database, conversationB),
  }));
  assert.equal(draftA?.text, textA, "Conversation A draft mismatch");
  assert.equal(draftB?.text, textB, "Conversation B draft mismatch");
  assert.notEqual(draftA.text, draftB.text);
  assert.match(
    draftA.assetId ?? "",
    uuidPattern,
    "Conversation A asset missing",
  );
  assert.match(
    draftA.assetUri ?? "",
    /^(?:content|file):\/\//u,
    "Conversation A asset URI missing",
  );
  assert.equal(draftB.assetId, null, "Conversation B inherited A asset ID");
  assert.equal(draftB.assetUri, null, "Conversation B inherited A asset URI");
  return {
    conversationA,
    conversationB,
    draftA: {
      assetId: draftA.assetId,
      assetUri: draftA.assetUri,
      text: draftA.text,
    },
    draftB: {
      assetId: draftB.assetId,
      assetUri: draftB.assetUri,
      text: draftB.text,
    },
  };
};

export const verifyTerminalChatSnapshot = ({
  conversationId,
  databasePath,
}) => {
  assert.match(conversationId, uuidPattern);
  const persisted = withDatabase(databasePath, (database) =>
    persistedChat(database, conversationId),
  );
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
  assert.equal(text, expectedText);
  const productIds = sortedProductIds(assistant[0].parts);
  assert.deepEqual(productIds, expectedProductIds);
  const resumePresent = persisted.resume !== undefined;
  assert.equal(resumePresent, false, "Terminal native resume was not cleared");
  return {
    assistantCount: assistant.length,
    conversationId,
    messageCount: persisted.messages.length,
    productIds,
    resumePresent,
    text,
  };
};

export const verifyFailedDraftSnapshot = ({
  afterText,
  beforeText,
  conversationId,
  databasePath,
}) => {
  assert.match(conversationId, uuidPattern);
  const { audit, row } = withDatabase(databasePath, (database) => ({
    audit: database
      .prepare(
        "SELECT conversation_id AS conversationId, attempted_text AS attemptedText FROM e2e_draft_write_audit WHERE conversation_id = ?",
      )
      .all(conversationId),
    row: draftRow(database, conversationId),
  }));
  assert.equal(row?.text, beforeText, "Failed draft replaced the prior value");
  assert.equal(audit.length, 1, "Unexpected failed draft audit count");
  assert.equal(audit[0]?.attemptedText, afterText);
  assert.equal(audit[0]?.conversationId, conversationId);
  return {
    attemptedText: audit[0].attemptedText,
    conversationId,
    persistedText: row.text,
  };
};

export const verifyPostgresRun = async ({ pool, runId, threadId }) => {
  const storageRunId = storageRunIdFor(runId);
  const eventResult = await pool.query(
    `select id::text, chunk
     from ai_run_events
     where run_id = $1
     order by ai_run_events.id`,
    [storageRunId],
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
    [threadId, storageRunId],
  );
  assert.equal(messageCount.rows[0]?.count, 1);
  const persisted = await pool.query(
    `select r.status, r.stream_closed_at, p.kind, p.payload
     from ai_runs r
     left join messages m on m.run_id = r.id and m.role = 'assistant'
     left join message_parts p on p.message_id = m.id
     where r.id = $1
     order by p.position`,
    [storageRunId],
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
    storageRunId,
    status: "completed",
    text: expectedText,
    threadId,
  };
};

export const verifyRunSeparationRows = (rows) => {
  assert.equal(rows.length, 2, "Unexpected conversation run count");
  const cancelled = rows.find(({ status }) => status === "cancelled");
  const completed = rows.find(({ status }) => status === "completed");
  assert.ok(cancelled, "Missing cancelled run");
  assert.ok(completed, "Missing completed run");
  assert.match(cancelled.id, uuidPattern);
  assert.match(completed.id, uuidPattern);
  assert.notEqual(cancelled.id, completed.id);
  assert.equal(cancelled.assistantCount, 0);
  assert.equal(completed.assistantCount, 1);
  assert.ok(cancelled.completedAt instanceof Date);
  assert.ok(cancelled.streamClosedAt instanceof Date);
  assert.ok(completed.completedAt instanceof Date);
  assert.ok(completed.streamClosedAt instanceof Date);
  return {
    cancelledRunId: cancelled.id,
    completedRunId: completed.id,
  };
};

export const verifyPostgresRunSeparation = async ({ pool, threadId }) => {
  assert.match(threadId, uuidPattern);
  const result = await pool.query(
    `select r.id::text,
            r.status,
            r.completed_at as "completedAt",
            r.stream_closed_at as "streamClosedAt",
            count(m.id)::int as "assistantCount"
     from ai_runs r
     left join messages m on m.run_id = r.id and m.role = 'assistant'
     where r.conversation_id = $1
     group by r.id
     order by r.started_at, r.id`,
    [threadId],
  );
  const separation = verifyRunSeparationRows(result.rows);
  const completed = await verifyPostgresRun({
    pool,
    runId: separation.completedRunId,
    threadId,
  });
  return { ...separation, completed };
};

const main = async () => {
  const [phase, ...arguments_] = process.argv.slice(2);
  let evidence;
  let outputPath;
  if (phase === "before" || phase === "after") {
    const [databasePath, runId, threadId, path] = arguments_;
    assert.ok(databasePath && runId && threadId && path, "Missing arguments");
    const sqlite = verifySqliteSnapshot({
      databasePath,
      phase,
      runId,
      threadId,
    });
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
    evidence = { phase, postgres, sqlite };
    outputPath = path;
  } else if (phase === "draft") {
    const [databasePath, conversationId, text, path] = arguments_;
    assert.ok(
      databasePath && conversationId && text && path,
      "Missing arguments",
    );
    evidence = verifyDraftAttachmentSnapshot({
      conversationId,
      databasePath,
      text,
    });
    outputPath = path;
  } else if (phase === "isolation") {
    const [databasePath, conversationA, textA, conversationB, textB, path] =
      arguments_;
    assert.ok(
      databasePath && conversationA && textA && conversationB && textB && path,
      "Missing arguments",
    );
    evidence = verifyDraftIsolationSnapshot({
      conversationA,
      conversationB,
      databasePath,
      textA,
      textB,
    });
    outputPath = path;
  } else if (phase === "terminal") {
    const [databasePath, conversationId, path] = arguments_;
    assert.ok(databasePath && conversationId && path, "Missing arguments");
    assert.ok(
      process.env.DATABASE_URL,
      "DATABASE_URL is required for terminal verification",
    );
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    try {
      evidence = {
        postgres: await verifyPostgresRunSeparation({
          pool,
          threadId: conversationId,
        }),
        sqlite: verifyTerminalChatSnapshot({ conversationId, databasePath }),
      };
    } finally {
      await pool.end();
    }
    outputPath = path;
  } else if (phase === "failed-draft") {
    const [databasePath, conversationId, beforeText, afterText, path] =
      arguments_;
    assert.ok(
      databasePath && conversationId && beforeText && afterText && path,
      "Missing arguments",
    );
    evidence = verifyFailedDraftSnapshot({
      afterText,
      beforeText,
      conversationId,
      databasePath,
    });
    outputPath = path;
  } else {
    assert.fail("Unknown verification phase");
  }
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
