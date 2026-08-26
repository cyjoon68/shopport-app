# PostgreSQL, Outbox, and Asset Integrity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make relational integrity, destructive object cleanup, archival concurrency, and asset history deterministic without introducing a new service or package.

**Architecture:** PostgreSQL remains the source of truth. The existing NestJS modular monolith gains the missing database constraints and covering indexes, transactional advisory locks around singleton maintenance jobs, an indefinitely retryable purge outbox, deterministic asset keys, and request-time asset resolution for fresh signed URLs. Existing SQS and object-store adapters remain in place.

**Tech Stack:** Node.js 22, NestJS 11, TypeScript 5.9 strict mode, PostgreSQL 16, Drizzle ORM/Kit, Zod 4, Jest 30, Supertest, Testcontainers, existing S3/SQS adapters.

**Spec:** [`docs/superpowers/specs/2026-08-26-full-stack-quality-hardening-design.md`](../specs/2026-08-26-full-stack-quality-hardening-design.md)

## Global Constraints

- Run this plan after [`2026-08-26-backend-auth-ai-hardening.md`](./2026-08-26-backend-auth-ai-hardening.md), on the same `/Volumes/Untitled/Documents/Github/shopport-app/shopport-be` branch `feat/backend-quality-hardening`.
- Do not touch `shopport-infra`, AWS/Terraform/Argo/IAM/Ingress/ECR configuration, or create a new queue, cache, service, package, repository interface, migration framework, or generic lock abstraction.
- Preserve all valid rows during the partition-to-table migration. A duplicate message ID must fail migration instead of silently discarding a row.
- Use database constraints for relational invariants, row locks for work claiming, and transaction-scoped advisory locks only for cross-process singleton maintenance.
- Purge events are durability records. Never delete, dead-letter, or permanently fail an unpublished purge event.
- Keep the current archive object write inside its database transaction for this hardening pass. A two-phase archive protocol is a separate design and is not required here.
- Asset URLs are derived presentation data. Persist only the asset ID in new message parts and create a fresh URL when history is read.
- Every behavior change starts with a failing focused test and ends with the focused test, `pnpm check`, `pnpm build`, `pnpm check:schema`, and the full backend coverage gate.

## Responsibility Map

### Files to create

- `test/database-integrity.integration-spec.ts` — populated 0008-to-0009 migration, data preservation, FK cascade, and index verification.
- `src/modules/assets/keys.ts` — deterministic object keys and strict normalized-key parsing only.
- `src/modules/assets/keys.spec.ts` — exact key contract.
- `src/modules/assets/assets.resolver.spec.ts` — GraphQL asset business-error mapping.
- `src/worker/retention-cleanup.spec.ts` — singleton lock and bounded-retention behavior.

### Generated migration files

- `migrations/0009_message_integrity.sql` — hand-reviewed table conversion, orphan cleanup, FK validation, indexes, and failed-outbox reactivation.
- `migrations/meta/0009_snapshot.json` — Drizzle snapshot generated from the final schema.
- `migrations/meta/_journal.json` — generated migration journal entry.

### Existing files to modify

- Database: `src/database/schema.ts`.
- Archive/retention: `src/modules/archive/archive.writer.ts`, `src/modules/archive/archive.writer.spec.ts`, and `src/worker/retention-cleanup.ts`.
- Outbox: `src/worker/outbox.processor.ts`, `src/worker/outbox.processor.spec.ts`, and `test/app.integration-spec.ts`.
- Assets: `src/modules/assets/asset-result.ts`, `src/modules/assets/assets.repository.ts`, `src/modules/assets/assets.service.ts`, `src/modules/assets/assets.resolver.ts`, `src/modules/assets/assets.service.spec.ts`, `src/worker/asset-result.consumer.ts`, and `src/worker/asset-result.consumer.spec.ts`.
- Message history: `src/modules/conversations/message.loader.ts`, `src/modules/conversations/message.loader.spec.ts`, `src/modules/conversations/message.mapper.ts`, and `src/modules/conversations/message.mapper.spec.ts`.

## Execution Preflight

- [ ] Confirm the backend hardening branch and baseline are clean before continuing:

  ```bash
  cd /Volumes/Untitled/Documents/Github/shopport-app/shopport-be
  git branch --show-current
  test "$(git branch --show-current)" = "feat/backend-quality-hardening"
  git status --short --branch
  pnpm check
  pnpm test
  pnpm build
  pnpm check:schema
  ```

- [ ] Record the existing migration mismatch before changing it:

  ```bash
  rg -n 'PARTITION BY|messages_default|message_parts' migrations/0000_shopport_v1.sql
  rg -n 'export const messages|export const messageParts' src/database/schema.ts
  ```

  Expected: migration 0000 has a partitioned `messages` primary key `(id, created_at)` and no message-parts FK, while the current Drizzle declaration models neither the partition nor an `id` primary key.

## Task 1: Characterize the Populated Migration

**Files:**

- Create: `test/database-integrity.integration-spec.ts`
- Read: `scripts/migrate.ts`
- Read: `test/jest-integration.config.mjs`
- Read: `migrations/meta/_journal.json`
- Test: `test/database-integrity.integration-spec.ts`

- [ ] Start one dedicated `PostgreSqlContainer('postgres:16.8-alpine')` for this test file and stop it in `afterAll`, matching the existing integration image. This prevents the app integration suite's migration journal or rows from contaminating the migration-under-test.

- [ ] Write a failing integration test that builds a temporary pre-0009 migration directory.

  Use `mkdtemp`, `cp`, `readFile`, `writeFile`, and `rm` from `node:fs/promises`; do not add a fixture package. Copy SQL migrations `0000` through `0008`, write a journal containing only those entries, and run the same Drizzle migrator used by `scripts/migrate.ts` against the existing PostgreSQL Testcontainer.

- [ ] Seed one conversation, one valid message, one valid part, and one orphan part after migration 0008. Store their UUIDs in test-local constants.

- [ ] Extend the temporary directory with migration 0009 and the complete journal, run migration again, and assert all of these outcomes:

  ```ts
  expect(messageCount).toBe(1);
  expect(validPartCount).toBe(1);
  expect(orphanPartCount).toBe(0);
  expect(messagePrimaryKeyColumns).toEqual(["id"]);
  expect(messagePartsForeignKeyDeleteRule).toBe("CASCADE");
  ```

- [ ] Query `pg_indexes`, `pg_constraint`, and `pg_attribute` and assert the exact primary key, message-part unique/check/FK constraints, and every index named in Task 2. Assert the old `messages_default` relation and `outbox_failed_retention_idx` no longer exist.

- [ ] Delete the message and assert the valid part is deleted by the FK. Call the migrator a third time and assert it is a no-op.

- [ ] Clean the temporary directory in `afterEach` with `rm(path, { recursive: true, force: true })`, but never delete the repository migration directory.

- [ ] Run the focused test and confirm it fails because migration 0009 does not exist:

  ```bash
  pnpm test:integration --runTestsByPath test/database-integrity.integration-spec.ts
  ```

- [ ] Leave the failing test uncommitted and continue directly to Task 2. The first commit must include the passing test and migration together.

## Task 2: Replace the Partitioned Message Table Safely

**Files:**

- Modify: `src/database/schema.ts`
- Create: `migrations/0009_message_integrity.sql`
- Create: `migrations/meta/0009_snapshot.json`
- Modify: `migrations/meta/_journal.json`
- Test: `test/database-integrity.integration-spec.ts`

- [ ] Update `messages` in `src/database/schema.ts` so `id` is the sole primary key and add its two proven access-path indexes:

  ```ts
  export const messages = pgTable(
    "messages",
    {
      id: uuid("id").primaryKey(),
      conversationId: uuid("conversation_id")
        .notNull()
        .references(() => conversations.id, { onDelete: "cascade" }),
      role: text("role").notNull(),
      runId: uuid("run_id"),
      status: text("status").notNull(),
      createdAt: timestamp("created_at", { withTimezone: true })
        .notNull()
        .defaultNow(),
    },
    (table) => [
      check("messages_role_check", sql`${table.role} in ('user', 'assistant')`),
      check(
        "messages_status_check",
        sql`${table.status} in ('pending', 'completed', 'failed')`,
      ),
      index("messages_created_id_idx").on(table.createdAt, table.id),
      index("messages_conversation_created_idx").on(
        table.conversationId,
        table.createdAt.desc(),
        table.id,
      ),
    ],
  );
  ```

- [ ] Update `messageParts` to declare `message_parts_kind_check` with `text`, `image`, `product_reference`, `tool_status`, and `ask_user`; `message_parts_position_check` for non-negative positions; `message_parts_message_id_position_key`; the new cascade FK; and `message_parts_message_id_idx`. Do not duplicate the primary key.

  ```ts
  messageId: uuid('message_id')
    .notNull()
    .references(() => messages.id, { onDelete: 'cascade' }),
  ```

- [ ] Add only indexes backed by observed joins or orderings, using these exact names:

  ```text
  auth_identities_account_id_idx(account_id)
  auth_sessions_account_id_idx(account_id)
  ai_runs_account_id_idx(account_id)
  ai_runs_conversation_id_idx(conversation_id)
  assets_conversation_id_idx(conversation_id)
  saved_products_account_saved_product_idx(account_id, saved_at DESC, product_id DESC)
  archive_manifests_account_id_idx(account_id)
  ```

  Keep existing conversation, catalog, offer, run-event, rate-limit, archive-conversation, asset-account, and outbox indexes. Do not add speculative single-column indexes.

- [ ] Remove `outbox_failed_retention_idx` from the Drizzle declaration. Change `outbox_ready_idx` to cover every unpublished event, regardless of legacy `failed_at`.

- [ ] Generate the metadata from the final declaration:

  ```bash
  pnpm exec drizzle-kit generate --name message_integrity
  test -f migrations/0009_message_integrity.sql
  ```

- [ ] Replace only the generated SQL body with a reviewed data-preserving conversion. Keep the generated snapshot and journal entry.

  ```sql
  DELETE FROM "message_parts" AS part
  WHERE NOT EXISTS (
    SELECT 1 FROM "messages" AS message WHERE message."id" = part."message_id"
  );

  CREATE TABLE "messages_v2" (
    "id" uuid CONSTRAINT "messages_v2_pkey" PRIMARY KEY,
    "conversation_id" uuid NOT NULL REFERENCES "conversations"("id") ON DELETE CASCADE,
    "role" text NOT NULL CONSTRAINT "messages_v2_role_check" CHECK ("role" IN ('user', 'assistant')),
    "run_id" uuid,
    "status" text NOT NULL CONSTRAINT "messages_v2_status_check" CHECK ("status" IN ('pending', 'completed', 'failed')),
    "created_at" timestamptz NOT NULL DEFAULT now()
  );

  INSERT INTO "messages_v2" ("id", "conversation_id", "role", "run_id", "status", "created_at")
  SELECT "id", "conversation_id", "role", "run_id", "status", "created_at"
  FROM "messages";

  ALTER TABLE "messages" RENAME TO "messages_partitioned_legacy";
  ALTER TABLE "messages_v2" RENAME TO "messages";
  DROP TABLE "messages_partitioned_legacy";
  ALTER TABLE "messages" RENAME CONSTRAINT "messages_v2_pkey" TO "messages_pkey";
  ALTER TABLE "messages" RENAME CONSTRAINT "messages_v2_role_check" TO "messages_role_check";
  ALTER TABLE "messages" RENAME CONSTRAINT "messages_v2_status_check" TO "messages_status_check";

  ALTER TABLE "message_parts"
    ADD CONSTRAINT "message_parts_message_id_messages_id_fk"
    FOREIGN KEY ("message_id") REFERENCES "messages"("id")
    ON DELETE CASCADE NOT VALID;
  ALTER TABLE "message_parts"
    VALIDATE CONSTRAINT "message_parts_message_id_messages_id_fk";

  UPDATE "outbox"
  SET "failed_at" = NULL,
      "next_attempt_at" = LEAST("next_attempt_at", now())
  WHERE "published_at" IS NULL AND "failed_at" IS NOT NULL;
  ```

- [ ] Include exact `CREATE INDEX` statements for `messages_created_id_idx`, `messages_conversation_created_idx`, `message_parts_message_id_idx`, and the seven named indexes above. Recreate `outbox_ready_idx` with predicate `published_at IS NULL`; drop its old definition and `outbox_failed_retention_idx` with `DROP INDEX IF EXISTS`. PostgreSQL does not index the referencing side of an FK automatically.

- [ ] Run schema and migration checks:

  ```bash
  pnpm check:schema
  pnpm test:integration --runTestsByPath test/database-integrity.integration-spec.ts
  pnpm exec drizzle-kit check
  ```

- [ ] Inspect the SQL diff and verify it contains no cascading drop outside the temporary legacy messages table and no delete other than orphan parts:

  ```bash
  git diff -- src/database/schema.ts migrations/0009_message_integrity.sql migrations/meta
  ```

- [ ] Commit the schema and migration together:

  ```bash
  git add src/database/schema.ts migrations/0009_message_integrity.sql migrations/meta/0009_snapshot.json migrations/meta/_journal.json test/database-integrity.integration-spec.ts
  git commit -m "fix(database): enforce message and query integrity"
  ```

## Task 3: Serialize Archive and Retention Maintenance

**Files:**

- Modify: `src/modules/archive/archive.writer.ts`
- Modify: `src/modules/archive/archive.writer.spec.ts`
- Modify: `src/worker/retention-cleanup.ts`
- Create: `src/worker/retention-cleanup.spec.ts`
- Modify: `test/app.integration-spec.ts`
- Test: `src/modules/archive/archive.writer.spec.ts`
- Test: `src/worker/retention-cleanup.spec.ts`
- Test: `test/app.integration-spec.ts`

- [ ] Add a failing archive test in which the transaction-scoped advisory lock returns `false`. Assert `archive()` returns `false`, does not select messages, and does not call the object store.

- [ ] Add a failing archive query assertion that the row lock targets only `messages` while using `SKIP LOCKED`.

- [ ] At the start of `ArchiveWriter.archive`'s existing transaction, acquire a non-blocking transaction-scoped lock:

  ```sql
  SELECT pg_try_advisory_xact_lock(hashtextextended('shopport.archive', 0)) AS locked
  ```

  Return `false` when `locked` is not true. Keep the existing object write, checksum readback, manifest insert, and row deletion in this transaction.

- [ ] Narrow the work-claim lock to the table being archived:

  ```ts
  .for('update', { of: messages, skipLocked: true });
  ```

- [ ] Add failing retention tests for two concurrent callers: the lock loser performs no deletes, and the lock winner issues bounded session and published-outbox deletes only.

- [ ] Wrap `RetentionCleanup.cleanup` in one transaction and acquire its independent lock:

  ```sql
  SELECT pg_try_advisory_xact_lock(hashtextextended('shopport.retention', 0)) AS locked
  ```

- [ ] Keep the existing active refresh-lineage protection and `LIMIT 500`. Delete the failed-outbox cutoff and query entirely; only published outbox rows older than seven days are eligible.

- [ ] Add a Testcontainers integration case that holds the `shopport.archive` lock on one PostgreSQL connection and invokes `ArchiveWriter` through the app on another; assert it returns without claiming work. Repeat for `shopport.retention`, release each transaction, then assert the job can run. This proves process-wide behavior instead of only mocked SQL shape.

- [ ] Run focused tests:

  ```bash
  pnpm test --runTestsByPath src/modules/archive/archive.writer.spec.ts src/worker/retention-cleanup.spec.ts
  pnpm test:integration --runTestsByPath test/app.integration-spec.ts --testNamePattern="maintenance advisory locks"
  ```

- [ ] Commit the maintenance boundary:

  ```bash
  git add src/modules/archive/archive.writer.ts src/modules/archive/archive.writer.spec.ts src/worker/retention-cleanup.ts src/worker/retention-cleanup.spec.ts test/app.integration-spec.ts
  git commit -m "fix(database): serialize bounded maintenance jobs"
  ```

## Task 4: Retry Purge Outbox Events Until Success

**Files:**

- Modify: `src/worker/outbox.processor.ts`
- Modify: `src/worker/outbox.processor.spec.ts`
- Modify: `test/app.integration-spec.ts`
- Test: `src/worker/outbox.processor.spec.ts`
- Test: `test/app.integration-spec.ts`

- [ ] Change the focused unit test to fail an `asset.purge` event eleven times. After every failure assert:

  ```ts
  expect(event.publishedAt).toBeNull();
  expect(event.failedAt).toBeNull();
  expect(event.attemptCount).toBe(attempt);
  expect(event.lastError).toBe("object store unavailable");
  ```

- [ ] Restore the object-store fake on attempt twelve and assert both keys are deleted and the event is published.

- [ ] Assert structured diagnostics are emitted exactly once when `attemptCount` crosses from nine to ten. Reuse `report` from `src/worker/worker-process.ts` with task name `outbox:<topic>`; do not log on every later hourly retry.

- [ ] Remove the terminal-failure branch from `OutboxProcessor.process`. Keep the existing capped exponential delay:

  ```ts
  const attemptCount = event.attemptCount + 1;
  const delaySeconds = Math.min(2 ** attemptCount, 3_600);
  ```

  Always set `failedAt: null`. Remove `isNull(outbox.failedAt)` from `claim` and `nextWakeDelay`; migration 0009 reactivates legacy failed events.

- [ ] After persisting attempt ten, emit the diagnostic once:

  ```ts
  if (attemptCount === 10) report(`outbox:${event.topic}`, error);
  ```

  Keep `attemptCount` and the bounded `lastError` in PostgreSQL as durable evidence even when stderr is unavailable.

- [ ] Add an integration scenario using the real Testcontainers PostgreSQL database and the existing in-memory `objectStore` fake from `test/app.integration-spec.ts`. Insert an unpublished purge event for deterministic raw/normalized keys, make the fake reject eleven delete attempts while setting `next_attempt_at = now()` between attempts, restore it, and assert attempt twelve records both key deletions and sets `published_at`.

- [ ] Assert `RetentionCleanup` does not delete the unpublished row at any attempt count.

- [ ] Run focused tests:

  ```bash
  pnpm test --runTestsByPath src/worker/outbox.processor.spec.ts
  pnpm test:integration --runTestsByPath test/app.integration-spec.ts
  ```

- [ ] Commit the durable retry policy:

  ```bash
  git add src/worker/outbox.processor.ts src/worker/outbox.processor.spec.ts test/app.integration-spec.ts
  git commit -m "fix(outbox): preserve purge events until success"
  ```

## Task 5: Make Asset Keys and Delete Races Deterministic

**Files:**

- Create: `src/modules/assets/keys.ts`
- Create: `src/modules/assets/keys.spec.ts`
- Modify: `src/modules/assets/assets.repository.ts`
- Modify: `src/modules/assets/assets.service.ts`
- Modify: `src/modules/assets/assets.resolver.ts`
- Modify: `src/modules/assets/assets.service.spec.ts`
- Create: `src/modules/assets/assets.resolver.spec.ts`
- Test: `src/modules/assets/keys.spec.ts`
- Test: `src/modules/assets/assets.service.spec.ts`
- Test: `src/modules/assets/assets.resolver.spec.ts`

- [ ] Write a failing key test for one fixed account and asset ID.

- [ ] Add the smallest shared key function used by upload, delete, and result cleanup:

  ```ts
  export const assetKeysFor = (accountId: string, assetId: string) => ({
    original: `uploads/${accountId}/${assetId}/original`,
    normalized: `uploads/${accountId}/${assetId}/normalized.jpg`,
  });
  ```

- [ ] Add a failing service test proving upload creation rejects a conversation with `deleted_at` set. Change `AssetsRepository.ownsConversation` to require `isNull(conversations.deletedAt)`.

- [ ] Use `assetKeysFor` in `AssetsService.createUpload`; persist only `keys.original`. Preserve the ten-minute presigned upload expiry.

- [ ] Change `AssetsRepository.delete` so the deleted row returns `createdAt`, the outbox payload always contains both deterministic keys, and eligibility is bounded by the original upload/normalization window:

  ```ts
  await transaction.insert(outbox).values({
    id: uuidv7(),
    topic: "asset.purge",
    payload: {
      accountId,
      assetId: id,
      originalKey: keys.original,
      normalizedKey: keys.normalized,
    },
    nextAttemptAt: sql`greatest(now(), ${record.createdAt} + interval '15 minutes')`,
  });
  ```

  Fifteen minutes after asset creation covers the ten-minute upload URL plus five minutes for an in-flight normalizer; an asset deleted after that deadline is purgeable immediately. Add both early-delete and late-delete assertions. Do not create a scheduler or configuration flag.

- [ ] Add resolver tests for expected user errors. `createAssetUpload` must catch only `NotFoundException` and return `upload: null` with `code: 'NOT_FOUND'`; `deleteAsset` must return `success: false` and the same code when the repository returns false. Unexpected errors must still escape to the shared error formatter.

- [ ] Run focused tests:

  ```bash
  pnpm test --runTestsByPath src/modules/assets/keys.spec.ts src/modules/assets/assets.service.spec.ts src/modules/assets/assets.resolver.spec.ts
  ```

- [ ] Commit deterministic asset deletion:

  ```bash
  git add src/modules/assets/keys.ts src/modules/assets/keys.spec.ts src/modules/assets/assets.repository.ts src/modules/assets/assets.service.ts src/modules/assets/assets.resolver.ts src/modules/assets/assets.service.spec.ts src/modules/assets/assets.resolver.spec.ts
  git commit -m "fix(assets): make upload deletion deterministic"
  ```

## Task 6: Delete Orphaned Normalized Objects Before Acknowledging Results

**Files:**

- Modify: `src/worker/asset-result.consumer.ts`
- Modify: `src/worker/asset-result.consumer.spec.ts`
- Modify: `src/modules/assets/asset-result.ts`
- Modify: `src/modules/assets/keys.ts`
- Modify: `src/modules/assets/keys.spec.ts`
- Modify: `test/app.integration-spec.ts`
- Test: `src/worker/asset-result.consumer.spec.ts`
- Test: `test/app.integration-spec.ts`

- [ ] Add failing result-consumer tests for the exact race and duplicate delivery. When the asset row is absent, assert the normalized object is deleted before SQS acknowledgment. When the row already exists in a terminal state, assert the object is not deleted and the duplicate message is acknowledged.

- [ ] Strengthen `assetResultSchema` as the SQS trust boundary: `ready` requires a non-null normalized key and positive dimensions; `rejected` requires all three to be null. Add a key parser in `keys.ts` that accepts exactly `uploads/<account UUID>/<matching asset UUID>/normalized.jpg`. Reject a key whose asset segment does not match `assetId`; do not delete an arbitrary key supplied by a queue message.

- [ ] Inject the existing `ObjectStore`; do not add a second S3 client. Return the updated asset ID from the guarded update:

  ```ts
  const updated = await this.database
    .update(assets)
    .set({
      status: result.status,
      normalizedKey: result.normalizedKey,
      width: result.width,
      height: result.height,
      updatedAt: new Date(),
    })
    .where(
      and(eq(assets.id, result.assetId), eq(assets.status, "pending_upload")),
    )
    .returning({ id: assets.id });
  ```

- [ ] Before updating, read the asset's `accountId` and verify a ready result key equals `assetKeysFor(accountId, assetId).normalized`. After the guarded update, distinguish an existing terminal row from an absent row with one focused existence query. Delete only a structurally valid non-null normalized key for an absent row. Await deletion before `DeleteMessageCommand`; if validation or deletion fails, leave the queue message unacknowledged so SQS retries.

- [ ] Preserve the current behavior for malformed messages: do not acknowledge them in this pass because changing poison-message policy requires a queue/DLQ decision outside the approved non-cloud scope.

- [ ] Add the exact handoff order with the real Testcontainers PostgreSQL database and existing fake external boundaries: create an upload, delete the asset row, have the SQS client spy return one successful normalization result, invoke the consumer with the existing object-store fake, and assert the normalized-key deletion is recorded before `DeleteMessageCommand`. Keep the delayed purge event unpublished; this test verifies the database/process boundary without adding LocalStack or cloud credentials.

- [ ] Run the focused test:

  ```bash
  pnpm test --runTestsByPath src/worker/asset-result.consumer.spec.ts
  pnpm test:integration --runTestsByPath test/app.integration-spec.ts --testNamePattern="normalization result after asset deletion"
  ```

- [ ] Commit the consumer race fix:

  ```bash
  git add src/modules/assets/asset-result.ts src/modules/assets/keys.ts src/modules/assets/keys.spec.ts src/worker/asset-result.consumer.ts src/worker/asset-result.consumer.spec.ts test/app.integration-spec.ts
  git commit -m "fix(assets): clean orphaned normalization results"
  ```

## Task 7: Resolve Current Asset State When Reading Message History

**Files:**

- Modify: `src/modules/assets/assets.repository.ts`
- Modify: `src/modules/assets/assets.service.ts`
- Modify: `src/modules/conversations/message.loader.ts`
- Modify: `src/modules/conversations/message.loader.spec.ts`
- Modify: `src/modules/conversations/message.mapper.ts`
- Modify: `src/modules/conversations/message.mapper.spec.ts`
- Modify: `src/modules/ai/ai.repository.ts`
- Modify: `src/modules/ai/ai.repository.spec.ts`
- Test: `src/modules/conversations/message.loader.spec.ts`
- Test: `src/modules/conversations/message.mapper.spec.ts`

- [ ] Replace the image snapshot parser with an ID-only parser that accepts old payloads containing extra fields:

  ```ts
  const imagePayload = z.object({ id: z.uuid() });
  ```

- [ ] Add mapper tests proving an image part uses the supplied current asset record and is omitted when the asset is absent. Keep text, ask-user, tool-status, and product-reference behavior unchanged.

- [ ] Add `AssetsRepository.findForConversations(assetIds, conversationIds)`. Return immediately when either input is empty. Its SQL must filter both `assets.id` and `assets.conversation_id`; this prevents an archived payload from resolving an asset outside the already-authorized conversation batch.

- [ ] Add `AssetsService.findForConversations` that maps repository rows with the existing `toGraphql`, creating a fresh signed URL for each request. Do not expose the signer or add a cache.

- [ ] Inject `AssetsService` into `MessageLoader`. Parse all image asset IDs from the current and archived parts, fetch them once for the loader's owned `conversationIds`, and pass a `ReadonlyMap<string, AssetGraphql>` to `mapMessages`.

- [ ] Change new image-part persistence at its existing writer to store only this payload:

  ```ts
  {
    id: assetId;
  }
  ```

  Existing archived payloads remain readable because they already contain `id` and Zod objects strip extra fields by default.

- [ ] Add a loader test that reads the same message twice with different signing times and asserts the second URL is newly generated rather than copied from the stored payload.

- [ ] Add a loader test with an asset ID belonging to another conversation and assert no image part is returned.

- [ ] Run focused tests:

  ```bash
  pnpm test --runTestsByPath src/modules/conversations/message.mapper.spec.ts src/modules/conversations/message.loader.spec.ts src/modules/ai/ai.repository.spec.ts
  ```

- [ ] Commit current-state history resolution:

  ```bash
  git add src/modules/assets/assets.repository.ts src/modules/assets/assets.service.ts src/modules/conversations/message.loader.ts src/modules/conversations/message.loader.spec.ts src/modules/conversations/message.mapper.ts src/modules/conversations/message.mapper.spec.ts src/modules/ai/ai.repository.ts src/modules/ai/ai.repository.spec.ts
  git commit -m "fix(messages): resolve current asset state in history"
  ```

## Task 8: Verify the Complete PostgreSQL and Asset Boundary

**Files:**

- Verify: all files changed by this plan
- Test: all backend unit and integration suites

- [ ] Run focused race and integrity suites together:

  ```bash
  pnpm test --runTestsByPath src/modules/archive/archive.writer.spec.ts src/worker/retention-cleanup.spec.ts src/worker/outbox.processor.spec.ts src/modules/assets/keys.spec.ts src/modules/assets/assets.service.spec.ts src/worker/asset-result.consumer.spec.ts src/modules/conversations/message.mapper.spec.ts src/modules/conversations/message.loader.spec.ts
  pnpm test:integration --runTestsByPath test/database-integrity.integration-spec.ts test/app.integration-spec.ts
  ```

- [ ] Run all backend gates from a clean process:

  ```bash
  pnpm format
  pnpm check
  pnpm test:coverage
  pnpm test:integration
  pnpm build
  pnpm check:schema
  ```

- [ ] Inspect the final migration and dependency diff:

  ```bash
  git diff develop -- migrations src/database/schema.ts package.json pnpm-lock.yaml
  ```

  Expected: one migration and no new dependency. All unpublished purge records remain claimable; only published records are retention candidates.

- [ ] Confirm no cloud/showcase files changed:

  ```bash
  git diff --name-only develop | rg '(^|/)(terraform|argocd|iam|ingress|ecr|shopport-infra)(/|$)' && exit 1 || true
  ```

- [ ] Commit only if formatting produced a real source change:

  ```bash
  git status --short
  git add src test migrations package.json pnpm-lock.yaml
  git diff --cached --quiet || git commit -m "test(backend): lock database durability regressions"
  ```

## Completion Evidence

Record these results in the final implementation handoff:

- Migration 0008-to-0009 preserves valid messages/parts, removes only orphans, validates the FK, cascades deletes, and is a no-op on the next migrator run.
- Archive and retention lock losers perform no work; winners claim bounded rows.
- An unpublished purge event succeeds after more than ten failures and is never removed by retention.
- A soft-deleted conversation cannot create an upload; delete payload keys are deterministic and delayed.
- A late normalization result cleans its orphan object before queue acknowledgment.
- Message history resolves only assets owned by the requested conversations and produces a fresh current URL.
- `pnpm check`, `pnpm test:coverage`, `pnpm test:integration`, `pnpm build`, and `pnpm check:schema` all exit zero.
- No package or cloud/showcase file was added or changed.
- Existing commit-time `NOTIFY`, reconnect wakeup, and durable polling fallback behavior remains unchanged.
