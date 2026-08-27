# Backend Authentication and AI Consistency Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Normalize backend trust-boundary failures, make refresh/logout and AI run transitions deterministic under concurrency, and split only the proven multi-role backend files.

**Architecture:** Keep the NestJS modular monolith. Authentication remains row-lock based in PostgreSQL. AI persistence, lease maintenance, provider protocol, and streaming lifecycle receive concrete ownership boundaries; no repository-interface layer or new infrastructure is introduced.

**Tech Stack:** Node.js 22, NestJS 11, TypeScript 5.9 strict mode, PostgreSQL 16, Drizzle ORM, Zod 4, TanStack AI, Jest 30, Supertest, Testcontainers.

**Spec:** [`docs/superpowers/specs/2026-08-26-full-stack-quality-hardening-design.md`](../specs/2026-08-26-full-stack-quality-hardening-design.md)

## Global Constraints

- Work only in `/Volumes/Untitled/Documents/Github/shopport-app/shopport-be` on branch `feat/backend-quality-hardening`, created from `develop`.
- Preserve the modular monolith, PostgreSQL durability, Nest dependency injection, persisted operations, and current GraphQL error formatter.
- Do not introduce microservices, Redis/Kafka, a workflow engine, repository interfaces with one implementation, generic provider factories, or a new package.
- Expected auth/boundary failures must be stable 4xx/GraphQL errors; unexpected failures must remain generic `INTERNAL` without leaking provider details.
- Use injected clocks/deferred promises or fake timers. Do not use wall-clock sleeps in timing tests.
- Every behavior change starts red and ends with its focused tests, `pnpm check`, `pnpm build`, and the full coverage gate.
- Make focused Conventional Commits and do not update root submodule pointers from this repository.

## Responsibility Map

### Files to create

- `src/modules/auth/auth.guard.spec.ts` — malformed/expired/wrong-token normalization.
- `src/common/cursor.spec.ts` — opaque cursor validation.
- `src/modules/ai/types.ts` — AI domain and persisted-completion types only.
- `src/modules/ai/ai-run-maintenance.repository.ts` — stale lease recovery and bounded runtime cleanup only.
- `src/modules/ai/ai-run-maintenance.repository.spec.ts` — maintenance locking/recovery behavior.
- `src/modules/ai/ai-provider-protocol.ts` — provider schemas, prompts, tool definitions, and protocol-only helpers.
- `src/modules/ai/ai-stream-lifecycle.ts` — terminal state, lease/cancellation timers, and public stream filtering.
- `src/modules/ai/ai-stream-lifecycle.spec.ts` — terminal and timer behavior.
- `src/modules/catalog/catalog-http.ts` — bounded provider HTTP/JSON transport.
- `src/modules/catalog/daiso.provider.ts` — Daiso schema/mapping/search/inventory behavior.
- `src/modules/catalog/olive-young.provider.ts` — Olive Young schema/mapping/search behavior.
- `src/worker/stale-run-recovery.spec.ts` — worker maintenance composition.
- `src/worker/worker-process.spec.ts` — structured failure diagnostics.

### Existing files to modify

- Auth: `auth.guard.ts`, `auth.repository.ts`, `auth.repository.spec.ts`, `auth.service.ts`, `auth.types.ts`, and `test/app.integration-spec.ts`.
- Cursor/catalog/favorites/conversations: `common/cursor.ts`, `conversation.service.ts`, `favorites.resolver.ts`, `catalog.provider.ts`, and their existing specs.
- AI: `ai-stream.adapter.ts`, `ai.repository.ts`, `ai.repository.spec.ts`, `ai.service.ts`, `ai.service.spec.ts`, `openai-compatible-ai.adapter.ts`, its spec, `postgres-stream-durability.ts`, its spec, and `ai.module.ts`.
- Worker: `stale-run-recovery.ts`, `worker.module.ts`, `worker-process.ts`, `worker.ts`, and `outbox-worker.ts`.
- Catalog structure: `catalog.provider.ts`, `catalog.provider.spec.ts`, and `catalog.module.ts`.
- Quality gate: `jest.config.mjs` and `package.json`.

## Execution Preflight

- [ ] Create the backend branch and prove the current baseline:

  ```bash
  cd /Volumes/Untitled/Documents/Github/shopport-app/shopport-be
  git switch develop
  git status --short --branch
  git switch -c feat/backend-quality-hardening
  pnpm check
  pnpm test
  pnpm build
  ```

- [ ] Record the current integration baseline separately; Testcontainers must be available:

  ```bash
  pnpm test:integration
  ```

## Task 1: Normalize JWT verification failures

**Files**

- Create: `src/modules/auth/auth.guard.spec.ts`
- Modify: `src/modules/auth/auth.guard.ts`
- Modify: `test/app.integration-spec.ts`

**Interface**

```ts
public canActivate(context: ExecutionContext): Promise<boolean>;
```

- [ ] Build a direct guard fixture and add failing cases for malformed, expired, wrong-audience, and bad-signature tokens. Assert every verification rejection becomes `UnauthorizedException('Invalid access token')` and the repository is not queried.

- [ ] Add one HTTP and one GraphQL integration assertion: REST returns 401 and GraphQL returns `extensions.code === 'UNAUTHENTICATED'` without the JWT library message.

- [ ] Run and confirm the current non-HTTP `JsonWebTokenError` escapes:

  ```bash
  pnpm test --runTestsByPath src/modules/auth/auth.guard.spec.ts
  ```

- [ ] Catch only the verification/claims boundary and preserve the existing generic message:

  ```ts
  let verified: Record<string, unknown>;
  try {
    verified = await this.jwt.verifyAsync<Record<string, unknown>>(token);
  } catch {
    throw new UnauthorizedException("Invalid access token");
  }
  const claims = accessClaimsSchema.safeParse(verified);
  ```

- [ ] Run the unit suite and the focused integration test:

  ```bash
  pnpm test --runTestsByPath src/modules/auth/auth.guard.spec.ts
  pnpm test:integration --runTestsByPath test/app.integration-spec.ts --testNamePattern="malformed access token"
  ```

- [ ] Commit:

  ```bash
  git add src/modules/auth/auth.guard.ts src/modules/auth/auth.guard.spec.ts test/app.integration-spec.ts
  git commit -m "fix(auth): normalize invalid access tokens"
  ```

## Task 2: Reject login for a soft-deleted identity

**Files**

- Modify: `src/modules/auth/auth.repository.ts`
- Modify: `src/modules/auth/auth.repository.spec.ts`
- Modify: `test/app.integration-spec.ts`

**Interface**

```ts
public findOrCreateAccount(identity: VerifiedIdentity): Promise<AccountSession>;
```

- [ ] Add an integration test that logs in, marks that account deleted, logs in with the same provider subject, and expects 409 without creating a second account or identity.

- [ ] Add a repository unit test whose locked identity row contains `deletedAt`; assert `ConflictException('Account deletion is pending')` and no inserts.

- [ ] Run the focused tests and confirm the current unique constraint path fails as 500:

  ```bash
  pnpm test --runTestsByPath src/modules/auth/auth.repository.spec.ts
  pnpm test:integration --runTestsByPath test/app.integration-spec.ts --testNamePattern="deletion-pending identity"
  ```

- [ ] Under the existing provider-subject advisory transaction lock, query the identity regardless of `accounts.deletedAt`; return an active account, throw an explicit conflict for a deleted account, and insert only when no identity exists.

- [ ] Run both tests and commit:

  ```bash
  git add src/modules/auth/auth.repository.ts src/modules/auth/auth.repository.spec.ts test/app.integration-spec.ts
  git commit -m "fix(auth): reject deletion-pending login"
  ```

## Task 3: Make refresh and logout contend on the same lineage lock

**Files**

- Modify: `src/modules/auth/auth.repository.ts`
- Modify: `src/modules/auth/auth.repository.spec.ts`
- Modify: `src/modules/auth/auth.service.ts`
- Modify: `test/app.integration-spec.ts`

**Interfaces**

```ts
public revokeSession(id: string, expectedHash: string): Promise<boolean>;
```

- [ ] Add a deterministic Testcontainers test that starts refresh and logout against the same parent token behind a database barrier. After both settle, assert every access token and every refresh token produced by either order is rejected.

- [ ] Add repository tests for both lock orders: parent already replaced and parent still active. Assert the selected session and every `replaced_by_session_id` descendant are revoked atomically.

- [ ] Run the tests and confirm refresh-winning order currently leaves its child valid:

  ```bash
  pnpm test --runTestsByPath src/modules/auth/auth.repository.spec.ts
  pnpm test:integration --runTestsByPath test/app.integration-spec.ts --testNamePattern="refresh and logout"
  ```

- [ ] Implement `revokeSession` as one transaction: select the exact session/token hash with `FOR UPDATE`, then recursively update the root and descendants. Do not revoke unrelated sessions for the account:

  ```sql
  WITH RECURSIVE lineage AS (
    SELECT id, replaced_by_session_id
    FROM auth_sessions
    WHERE id = $session_id
    UNION ALL
    SELECT child.id, child.replaced_by_session_id
    FROM auth_sessions child
    JOIN lineage parent ON child.id = parent.replaced_by_session_id
  )
  UPDATE auth_sessions
  SET revoked_at = COALESCE(revoked_at, now()), updated_at = now()
  WHERE id IN (SELECT id FROM lineage);
  ```

- [ ] Keep logout idempotent for malformed/wrong tokens. Run unit/integration and commit:

  ```bash
  pnpm test --runTestsByPath src/modules/auth/auth.repository.spec.ts
  pnpm test:integration --runTestsByPath test/app.integration-spec.ts --testNamePattern="refresh and logout|revokes the access session"
  git add src/modules/auth test/app.integration-spec.ts
  git commit -m "fix(auth): revoke refresh replacement lineage"
  ```

## Task 4: Reject invalid cursors and out-of-range replay offsets

**Files**

- Create: `src/common/cursor.spec.ts`
- Modify: `src/common/cursor.ts`
- Modify: `src/modules/conversations/conversation.service.ts`
- Modify: `src/modules/favorites/favorites.resolver.ts`
- Modify: `src/modules/catalog/catalog.provider.ts`
- Modify: `src/modules/catalog/catalog.provider.spec.ts`
- Modify/test: `src/modules/ai/postgres-stream-durability.ts`
- Modify/test: `src/modules/ai/postgres-stream-durability.spec.ts`
- Modify: `test/app.integration-spec.ts`

**Interfaces**

```ts
export const decodeCursor = (cursor: string | null): CursorPayload | null;
export const decodePageCursor = (cursor: string | null): number;
```

- [ ] Add cursor tests for invalid base64url, invalid JSON, wrong payload shape, page zero/fraction, and valid cursors. Assert invalid non-null input throws `BadRequestException('Invalid cursor')`.

- [ ] Add replay tests for `9223372036854775807` (accepted) and `9223372036854775808` (rejected before a PostgreSQL query).

- [ ] Preserve `-1` only as TanStack AI's internal “before the first event” sentinel, mapped to `0n`. Accept external decimal offsets from `0` through PostgreSQL's signed-bigint maximum; reject every other negative, fractional, padded-sign, or overflowing value before querying.

- [ ] Run and confirm current silent first-page/reset behavior:

  ```bash
  pnpm test --runTestsByPath \
    src/common/cursor.spec.ts \
    src/modules/catalog/catalog.provider.spec.ts \
    src/modules/ai/postgres-stream-durability.spec.ts
  ```

- [ ] Centralize only the two real cursor formats in `common/cursor.ts`; do not create a cursor framework. Use native Buffer plus existing Zod and throw on malformed non-null values.

- [ ] Bound replay with PostgreSQL's signed bigint maximum:

  ```ts
  const maximumSignedBigint = 9_223_372_036_854_775_807n;
  const parsed = /^\d{1,19}$/u.test(offset) ? BigInt(offset) : null;
  return parsed !== null && parsed <= maximumSignedBigint ? parsed : null;
  ```

- [ ] Add GraphQL invalid-cursor integration assertions and run focused tests:

  ```bash
  pnpm test --runTestsByPath src/common/cursor.spec.ts src/modules/ai/postgres-stream-durability.spec.ts
  pnpm test:integration --runTestsByPath test/app.integration-spec.ts --testNamePattern="invalid cursor"
  ```

- [ ] Commit:

  ```bash
  git add src/common src/modules/conversations src/modules/favorites src/modules/catalog src/modules/ai test/app.integration-spec.ts
  git commit -m "fix(api): reject invalid pagination offsets"
  ```

## Task 5: Renew AI leases and make terminal transitions authoritative

**Files**

- Create: `src/modules/ai/types.ts`
- Modify: `src/modules/ai/ai-stream.adapter.ts`
- Modify/test: `src/modules/ai/ai.repository.ts`
- Modify/test: `src/modules/ai/ai.repository.spec.ts`
- Modify/test: `src/modules/ai/ai.service.ts`
- Modify/test: `src/modules/ai/ai.service.spec.ts`
- Modify/test: `src/modules/ai/openai-compatible-ai.adapter.ts`
- Modify/test: `src/modules/ai/openai-compatible-ai.adapter.spec.ts`
- Modify: `src/modules/ai/ai.module.ts`
- Modify: `test/app.integration-spec.ts`

**Interfaces**

```ts
export type AiStreamLifecycle = Readonly<{
  onComplete: (result: AiStreamResult) => Promise<void>;
  onFailure: () => Promise<void>;
  isCancelled: () => Promise<boolean>;
  renewLease: () => Promise<void>;
}>;

public renewRunLease(runId: string, now?: Date): Promise<void>;
public completeRun(input: CompleteRunInput): Promise<void>;
```

- [ ] Add failing repository tests: lease renewal updates both timestamps; zero updated rows rejects; zero-row `completeRun` rejects and inserts no message; cancellation writes `status`, `completedAt`, and `streamClosedAt` together.

- [ ] Add fake-timer lifecycle tests: lease renews periodically, no renewal calls overlap, and timers stop on finish/abort/error/cancel. Add a terminal test proving rejected `onComplete` yields `RUN_ERROR`, never `RUN_FINISHED`.

- [ ] Add an integration replay assertion for a producerless cancelled run and confirm it terminates without polling forever.

- [ ] Run the focused suites and confirm the current fixed deadline/silent completion behavior fails:

  ```bash
  pnpm test --runTestsByPath \
    src/modules/ai/ai.repository.spec.ts \
    src/modules/ai/ai.service.spec.ts \
    src/modules/ai/openai-compatible-ai.adapter.spec.ts \
    src/modules/ai/postgres-stream-durability.spec.ts
  ```

- [ ] Implement authoritative lease updates with one duration constant and `.returning({ id })`:

  ```ts
  const runLeaseMilliseconds = 60_000;
  const updated = await this.database
    .update(aiRuns)
    .set({
      heartbeatAt: now,
      deadlineAt: new Date(now.getTime() + runLeaseMilliseconds),
    })
    .where(and(eq(aiRuns.id, runId), eq(aiRuns.status, "reserved")))
    .returning({ id: aiRuns.id });
  if (updated.length !== 1) throw new ConflictException("AI run lease lost");
  ```

- [ ] Add `renewLease` to the existing streaming lifecycle polling loop at a 15-second cadence with a single in-flight promise. A renewal failure aborts the provider request; stop clears every timer.

- [ ] Make `completeRun` throw when the `reserved -> completed` update returns no row. In `cancelRun`, set `streamClosedAt` in the same update. Preserve recovery's `FOR UPDATE SKIP LOCKED`.

- [ ] Move catalog snapshot orchestration from `AiRepository` to `AiService`: inject `CatalogService`, map recommendations to persisted snapshots with `toProductGraphql`, and keep the repository database-only. Update all constructor fixtures.

- [ ] Run unit and focused integration tests, then commit:

  ```bash
  pnpm test --runTestsByPath \
    src/modules/ai/ai.repository.spec.ts \
    src/modules/ai/ai.service.spec.ts \
    src/modules/ai/openai-compatible-ai.adapter.spec.ts \
    src/modules/ai/postgres-stream-durability.spec.ts
  pnpm test:integration --runTestsByPath test/app.integration-spec.ts --testNamePattern="producerless cancellation|recovers stale"
  git add src/modules/ai test/app.integration-spec.ts
  git commit -m "fix(ai): enforce renewable run leases"
  ```

## Task 6: Separate AI maintenance from request persistence

**Files**

- Create: `src/modules/ai/ai-run-maintenance.repository.ts`
- Create: `src/modules/ai/ai-run-maintenance.repository.spec.ts`
- Modify: `src/modules/ai/ai.repository.ts`
- Modify: `src/worker/stale-run-recovery.ts`
- Create: `src/worker/stale-run-recovery.spec.ts`
- Modify: `src/worker/worker.module.ts`
- Modify: `test/app.integration-spec.ts`

**Interfaces**

```ts
export class AiRunMaintenanceRepository {
  public recoverStaleReservedRuns(now?: Date): Promise<number>;
  public cleanupRuntimeState(now?: Date): Promise<void>;
}
```

- [ ] Add characterization tests around stale selection, `FOR UPDATE SKIP LOCKED`, genuinely fresh leases, expired event cleanup, and rate-limit cleanup.

- [ ] Add a failing Testcontainers singleton test: hold the `shopport.ai-maintenance` advisory transaction lock on one connection and assert a second maintenance pass through the app does no recovery/cleanup. Release the first transaction and assert the pass then succeeds.

- [ ] Move only recovery/cleanup methods out of `AiRepository`. Use `pg_try_advisory_xact_lock(hashtextextended('shopport.ai-maintenance', 0))` and bounded 500-row CTE deletes for high-churn expiry tables.

- [ ] Inject `AiRunMaintenanceRepository` into `StaleRunRecovery`; remove `CatalogModule` and ordinary `AiRepository` from `WorkerModule` because the worker no longer needs request-time catalog dependencies.

- [ ] Run focused tests and the worker module composition test:

  ```bash
  pnpm test --runTestsByPath \
    src/modules/ai/ai-run-maintenance.repository.spec.ts \
    src/worker/stale-run-recovery.spec.ts \
    src/modules/ai/ai.module.spec.ts
  pnpm test:integration --runTestsByPath test/app.integration-spec.ts --testNamePattern="AI maintenance advisory lock"
  pnpm typecheck
  ```

- [ ] Commit:

  ```bash
  git add src/modules/ai src/worker test/app.integration-spec.ts
  git commit -m "refactor(ai): isolate runtime maintenance"
  ```

## Task 7: Split AI protocol from streaming lifecycle

**Files**

- Create: `src/modules/ai/ai-provider-protocol.ts`
- Create: `src/modules/ai/ai-stream-lifecycle.ts`
- Create: `src/modules/ai/ai-stream-lifecycle.spec.ts`
- Modify: `src/modules/ai/types.ts`
- Modify: `src/modules/ai/ai-stream.adapter.ts`
- Modify: `src/modules/ai/openai-compatible-ai.adapter.ts`
- Modify: `src/modules/ai/openai-compatible-ai.adapter.spec.ts`

**Ownership**

```text
types.ts                    pure domain/type declarations
ai-stream.adapter.ts        DI token and adapter contract
ai-provider-protocol.ts     schemas, prompts, tool definitions, protocol validation
ai-stream-lifecycle.ts      terminal state, timers, cancellation, visible stream
openai-compatible-ai.adapter.ts provider transport and concrete tool binding
```

- [ ] Before moving code, add characterization tests for title normalization, tool-choice progression, incomplete-response rejection, duplicate RUN_STARTED filtering, rewritten assistant message IDs, cancel, error, and iterator return.

- [ ] Run the adapter tests and keep their result as the behavioral checksum:

  ```bash
  pnpm test --runTestsByPath src/modules/ai/openai-compatible-ai.adapter.spec.ts
  ```

- [ ] Move pure types from `ai-stream.adapter.ts` to `types.ts`. Keep the adapter file limited to `AI_STREAM_ADAPTER` and `AiStreamAdapter`.

- [ ] Move protocol constants/schemas/tool definitions and pure validation helpers to `ai-provider-protocol.ts`. Move terminal/lifecycle/public-stream functions to `ai-stream-lifecycle.ts`. Export only the functions the concrete adapter invokes.

- [ ] Do not add a generic provider abstraction or factory. The concrete adapter continues to bind TanStack tools and create the OpenAI-compatible transport.

- [ ] Run the lifecycle/adapter/module suites, check file sizes and import cycles, then commit:

  ```bash
  pnpm test --runTestsByPath \
    src/modules/ai/ai-stream-lifecycle.spec.ts \
    src/modules/ai/openai-compatible-ai.adapter.spec.ts \
    src/modules/ai/ai.module.spec.ts
  pnpm typecheck
  wc -l src/modules/ai/openai-compatible-ai.adapter.ts src/modules/ai/ai-provider-protocol.ts src/modules/ai/ai-stream-lifecycle.ts
  git add src/modules/ai
  git commit -m "refactor(ai): separate protocol and stream lifecycle"
  ```

## Task 8: Split concrete catalog provider adapters

**Files**

- Create: `src/modules/catalog/catalog-http.ts`
- Create: `src/modules/catalog/daiso.provider.ts`
- Create: `src/modules/catalog/olive-young.provider.ts`
- Modify: `src/modules/catalog/catalog.provider.ts`
- Modify: `src/modules/catalog/catalog.provider.spec.ts`
- Modify: `src/modules/catalog/catalog.module.ts`

**Interfaces**

```ts
export const fetchCatalogJson = (
  fetchImpl: typeof fetch,
  url: URL,
): Promise<unknown>;

export const searchDaiso = (
  fetchImpl: typeof fetch,
  query: string,
  page: number,
  size: number,
): Promise<ReadonlyArray<CatalogProduct>>;

export const searchOliveYoung = (
  fetchImpl: typeof fetch,
  query: string,
  page: number,
  size: number,
  location?: string,
): Promise<ReadonlyArray<CatalogProduct>>;

export const withDaisoInventory = (
  fetchImpl: typeof fetch,
  product: CatalogProduct,
  location: string,
): Promise<CatalogProduct>;
```

- [ ] Split the current provider test into named Daiso, Olive Young, bounded HTTP, and dispatch/ranking sections without changing assertions. Run it green before production moves.

- [ ] Move the 10-second timeout and 1 MiB streamed-body bound to `catalog-http.ts`; move each retailer's schemas, URLs, mapping, and inventory calls to its concrete adapter file.

- [ ] Keep `CatalogProvider` responsible only for provider selection, budget filtering, neutral ranking, cursor/page composition, and the existing test fetch override. Use functions and existing types; do not add two DI registrations or a registry.

- [ ] Run catalog and AI service tests because AI consumes catalog results:

  ```bash
  pnpm test --runTestsByPath \
    src/modules/catalog/catalog.provider.spec.ts \
    src/modules/catalog/catalog.service.spec.ts \
    src/modules/ai/ai.service.spec.ts
  pnpm typecheck
  ```

- [ ] Commit:

  ```bash
  git add src/modules/catalog
  git commit -m "refactor(catalog): split retailer adapters"
  ```

## Task 9: Preserve worker task identity and stack traces

**Files**

- Modify/test: `src/worker/worker-process.ts`
- Create: `src/worker/worker-process.spec.ts`
- Modify: `src/worker.ts`
- Modify: `src/outbox-worker.ts`

**Interface**

```ts
export const report = (task: string, reason: unknown): void;
```

- [ ] Add a stderr spy test proving an `Error` record includes task, message, and stack, while an unknown rejection includes the task and a stable fallback.

- [ ] Implement one-line JSON diagnostics without adding a logging wrapper:

  ```ts
  const error = reason instanceof Error ? reason : null;
  const record = error?.stack
    ? { task, message: error.message, stack: error.stack }
    : { task, message: error?.message ?? "Worker failure" };
  process.stderr.write(`${JSON.stringify(record)}\n`);
  ```

- [ ] In `worker.ts`, pair each settled promise with its concrete name (`asset-results`, `archive`, `stale-runs`, `retention`) instead of reporting every failure as `Worker task failed`.

- [ ] Run the test and commit:

  ```bash
  pnpm test --runTestsByPath src/worker/worker-process.spec.ts
  git add src/worker.ts src/outbox-worker.ts src/worker/worker-process.ts src/worker/worker-process.spec.ts
  git commit -m "fix(worker): retain structured failure context"
  ```

## Task 10: Add and ratchet the backend coverage gate

**Files**

- Modify: `jest.config.mjs`
- Modify: `package.json`

**Initial gate**

```js
coverageThreshold: {
  global: { statements: 51, branches: 45, functions: 44, lines: 53 },
}
```

- [ ] Add a `test:coverage` script. Collect hand-written `src/**/*.ts` and exclude only `main.ts`, `worker.ts`, `outbox-worker.ts`, `image-processor.ts`, declaration files, and specs.

  ```json
  {
    "scripts": {
      "test:coverage": "pnpm test --coverage"
    }
  }
  ```

- [ ] Run the approved floor:

  ```bash
  pnpm test:coverage
  ```

- [ ] Round the achieved global percentages down to integers and ratchet all four thresholds to those values without lowering the approved floor.

- [ ] Run the complete backend gate, including Testcontainers:

  ```bash
  pnpm format
  pnpm check
  pnpm test:coverage
  pnpm build
  (
    set -eu
    baseline_schema="$(mktemp)"
    trap 'rm -f "$baseline_schema"' EXIT
    git show origin/develop:schema.graphql > "$baseline_schema"
    pnpm check:schema "$baseline_schema" schema.graphql
  )
  pnpm test:integration
  git status --short
  ```

- [ ] Run architecture guards:

  ```bash
  test "$(rg -l "CatalogService" src/worker src/modules/ai/ai-run-maintenance.repository.ts | wc -l | tr -d ' ')" = "0"
  rg -n "forwardRef|Kafka|Redis" src && exit 1 || true
  ```

- [ ] Commit the gate and formatter-only changes:

  ```bash
  git add jest.config.mjs package.json src test
  git commit -m "test(backend): enforce full-source coverage"
  ```

## Backend Plan Completion Evidence

- [ ] Save exact summaries for `pnpm check`, `pnpm test:coverage`, `pnpm build`, `pnpm check:schema`, and `pnpm test:integration`.
- [ ] Confirm the worker module no longer imports catalog solely for AI maintenance and that `openai-compatible-ai.adapter.ts` no longer owns lifecycle/protocol code.
- [ ] Confirm no backend runtime dependency was added or removed; `package.json` changes are limited to the coverage script.
- [ ] Confirm `git status --short` is clean and `git log --oneline develop..HEAD` contains only focused commits.
- [ ] Do not push or open a PR yet. Return the branch and evidence to the root execution workflow for specification and code-quality review.
