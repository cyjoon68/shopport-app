import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";

import * as verifier from "./verify-android-recovery.mjs";

const runId = "run-1757110000000-native";
const threadId = "0198a122-0c00-7000-8000-000000000092";
const productIds = [95, 96, 97, 98, 99].map(
  (suffix) => `0198a122-0c00-7000-8000-${String(suffix).padStart(12, "0")}`,
);

const persistedState = (text, resume) => ({
  messages: [
    {
      id: "user-message",
      parts: [{ content: "synthetic question", type: "text" }],
      role: "user",
    },
    {
      id: "assistant-message",
      parts: [
        {
          arguments: "{}",
          id: "integration-search",
          name: "searchProducts",
          state: "complete",
          type: "tool-call",
        },
        {
          content: JSON.stringify({
            kind: "product_cards",
            products: productIds.map((id) => ({ id })),
          }),
          state: "complete",
          toolCallId: "integration-search",
          type: "tool-result",
        },
        { content: text, type: "text" },
      ],
      role: "assistant",
    },
  ],
  ...(resume ? { resume: { resumeState: { runId, threadId } } } : {}),
});

const writeSnapshot = (path, state) => {
  const database = new DatabaseSync(path);
  database.exec(
    "CREATE TABLE chat_cache (id TEXT PRIMARY KEY NOT NULL, payload TEXT NOT NULL, updated_at INTEGER NOT NULL)",
  );
  database
    .prepare(
      "INSERT INTO chat_cache (id, payload, updated_at) VALUES (?, ?, ?)",
    )
    .run(threadId, JSON.stringify(state), 1);
  database.close();
};

test("verifies the native SQLite resume boundary before and after a cold join", async () => {
  assert.equal(
    verifier.storageRunIdFor(runId),
    "e41c3592-2ba0-5578-a337-21b9637ccd3c",
  );
  const directory = await mkdtemp(join(tmpdir(), "shopport-sqlite-verifier-"));
  try {
    const beforePath = join(directory, "before.db");
    writeSnapshot(beforePath, persistedState("조건에 맞는 ", true));
    assert.deepEqual(
      verifier.verifySqliteSnapshot({
        databasePath: beforePath,
        phase: "before",
        runId,
        threadId,
      }),
      {
        assistantCount: 1,
        messageCount: 2,
        phase: "before",
        productIds,
        resumePresent: true,
        runId,
        text: "조건에 맞는 ",
        threadId,
      },
    );

    const afterPath = join(directory, "after.db");
    writeSnapshot(
      afterPath,
      persistedState("조건에 맞는 상품 다섯 개를 찾았어요.", false),
    );
    assert.deepEqual(
      verifier.verifySqliteSnapshot({
        databasePath: afterPath,
        phase: "after",
        runId,
        threadId,
      }),
      {
        assistantCount: 1,
        messageCount: 2,
        phase: "after",
        productIds,
        resumePresent: false,
        runId,
        text: "조건에 맞는 상품 다섯 개를 찾았어요.",
        threadId,
      },
    );
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});

const createStorageSnapshot = (path) => {
  const database = new DatabaseSync(path);
  database.exec(`
    CREATE TABLE draft (
      conversation_id TEXT PRIMARY KEY NOT NULL,
      text TEXT NOT NULL,
      asset_id TEXT,
      asset_uri TEXT,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE chat_cache (
      id TEXT PRIMARY KEY NOT NULL,
      payload TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);
  return database;
};

test("verifies an exact native draft and same-install attachment reference", async () => {
  assert.equal(typeof verifier.verifyDraftAttachmentSnapshot, "function");
  const directory = await mkdtemp(join(tmpdir(), "shopport-draft-verifier-"));
  const databasePath = join(directory, "draft.db");
  const assetId = "0198a122-0c00-7000-8000-000000000093";
  const assetUri =
    "content://media/picker/0/com.android.providers.media.photopicker/media/1";
  try {
    const database = createStorageSnapshot(databasePath);
    database
      .prepare(
        "INSERT INTO draft (conversation_id, text, asset_id, asset_uri, updated_at) VALUES (?, ?, ?, ?, ?)",
      )
      .run(threadId, "s4-draft-1", assetId, assetUri, 1);
    database.close();

    assert.deepEqual(
      verifier.verifyDraftAttachmentSnapshot({
        assetId,
        assetUri,
        conversationId: threadId,
        databasePath,
        text: "s4-draft-1",
      }),
      {
        assetId,
        assetUri,
        assetUriScope: "same-install",
        conversationId: threadId,
        text: "s4-draft-1",
      },
    );
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});

test("verifies A and B native drafts remain isolated", async () => {
  assert.equal(typeof verifier.verifyDraftIsolationSnapshot, "function");
  const directory = await mkdtemp(
    join(tmpdir(), "shopport-isolation-verifier-"),
  );
  const databasePath = join(directory, "drafts.db");
  const conversationA = threadId;
  const conversationB = "0198a122-0c00-7000-8000-000000000094";
  const assetId = "0198a122-0c00-7000-8000-000000000093";
  const assetUri =
    "content://media/picker/0/com.android.providers.media.photopicker/media/1";
  try {
    const database = createStorageSnapshot(databasePath);
    const insert = database.prepare(
      "INSERT INTO draft (conversation_id, text, asset_id, asset_uri, updated_at) VALUES (?, ?, ?, ?, ?)",
    );
    insert.run(conversationA, "s4-draft-1", assetId, assetUri, 1);
    insert.run(conversationB, "s5-draft-1", null, null, 2);
    database.close();

    assert.deepEqual(
      verifier.verifyDraftIsolationSnapshot({
        conversationA,
        conversationB,
        databasePath,
        textA: "s4-draft-1",
        textB: "s5-draft-1",
      }),
      {
        conversationA,
        conversationB,
        draftA: { assetId, assetUri, text: "s4-draft-1" },
        draftB: { assetId: null, assetUri: null, text: "s5-draft-1" },
      },
    );
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});

test("verifies a completed B chat has no cancelled resume", async () => {
  assert.equal(typeof verifier.verifyTerminalChatSnapshot, "function");
  const directory = await mkdtemp(
    join(tmpdir(), "shopport-terminal-verifier-"),
  );
  const databasePath = join(directory, "terminal.db");
  const conversationB = "0198a122-0c00-7000-8000-000000000094";
  try {
    const database = createStorageSnapshot(databasePath);
    database
      .prepare(
        "INSERT INTO chat_cache (id, payload, updated_at) VALUES (?, ?, ?)",
      )
      .run(
        conversationB,
        JSON.stringify(
          persistedState("조건에 맞는 상품 다섯 개를 찾았어요.", false),
        ),
        1,
      );
    database.close();

    assert.deepEqual(
      verifier.verifyTerminalChatSnapshot({
        conversationId: conversationB,
        databasePath,
      }),
      {
        assistantCount: 1,
        conversationId: conversationB,
        messageCount: 2,
        productIds,
        resumePresent: false,
        text: "조건에 맞는 상품 다섯 개를 찾았어요.",
      },
    );
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});

test("verifies cancelled and completed B runs stay distinct", () => {
  assert.equal(typeof verifier.verifyRunSeparationRows, "function");
  const cancelledRunId = "0198a122-0c00-7000-8000-000000000095";
  const completedRunId = "0198a122-0c00-7000-8000-000000000096";
  const completedAt = new Date("2026-09-06T00:00:00.000Z");
  assert.deepEqual(
    verifier.verifyRunSeparationRows([
      {
        assistantCount: 0,
        completedAt,
        id: cancelledRunId,
        status: "cancelled",
        streamClosedAt: completedAt,
      },
      {
        assistantCount: 1,
        completedAt,
        id: completedRunId,
        status: "completed",
        streamClosedAt: completedAt,
      },
    ]),
    { cancelledRunId, completedRunId },
  );
});

test("RAISE(FAIL) records the exact attempt and preserves the prior draft", async () => {
  assert.equal(typeof verifier.verifyFailedDraftSnapshot, "function");
  const directory = await mkdtemp(
    join(tmpdir(), "shopport-failed-draft-verifier-"),
  );
  const databasePath = join(directory, "failure.db");
  const beforeText = "s7-before-1";
  const afterText = "s7-after-1";
  try {
    const database = createStorageSnapshot(databasePath);
    database
      .prepare(
        "INSERT INTO draft (conversation_id, text, asset_id, asset_uri, updated_at) VALUES (?, ?, ?, ?, ?)",
      )
      .run(threadId, beforeText, null, null, 1);
    database.exec(`
      CREATE TABLE e2e_draft_write_audit (
        conversation_id TEXT NOT NULL,
        attempted_text TEXT NOT NULL
      );
      CREATE TRIGGER e2e_force_draft_failure
      BEFORE INSERT ON draft
      WHEN NEW.conversation_id = '${threadId}' AND NEW.text = '${afterText}'
      BEGIN
        INSERT INTO e2e_draft_write_audit (conversation_id, attempted_text)
        VALUES (NEW.conversation_id, NEW.text);
        SELECT RAISE(FAIL, 'e2e forced draft write failure');
      END;
    `);
    assert.throws(
      () =>
        database
          .prepare(
            "INSERT OR REPLACE INTO draft (conversation_id, text, asset_id, asset_uri, updated_at) VALUES (?, ?, ?, ?, ?)",
          )
          .run(threadId, afterText, null, null, 2),
      /e2e forced draft write failure/u,
    );
    database.close();

    assert.deepEqual(
      verifier.verifyFailedDraftSnapshot({
        afterText,
        beforeText,
        conversationId: threadId,
        databasePath,
      }),
      {
        attemptedText: afterText,
        conversationId: threadId,
        persistedText: beforeText,
      },
    );
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});
