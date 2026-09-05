import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";

import { verifySqliteSnapshot } from "./verify-android-recovery.mjs";

const runId = "0198a122-0c00-7000-8000-000000000091";
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
  const directory = await mkdtemp(join(tmpdir(), "shopport-sqlite-verifier-"));
  try {
    const beforePath = join(directory, "before.db");
    writeSnapshot(beforePath, persistedState("조건에 맞는 ", true));
    assert.deepEqual(
      verifySqliteSnapshot({
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
      verifySqliteSnapshot({
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
