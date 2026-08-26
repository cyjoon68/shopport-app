# Shopport Full-Stack Quality Hardening Design

Date: 2026-08-26
Status: Approved design
Scope: `shopport-fe`, `shopport-be`, root integration repository

## Context

Shopport already has a strong baseline: strict TypeScript, feature-oriented frontend and backend modules, React Compiler, GraphQL code generation, persisted operations, PostgreSQL transactional outbox, `LISTEN/NOTIFY` wakeups with polling fallback, and meaningful unit and Testcontainers suites.

The audit also found correctness gaps that can surface as privacy leaks, data retention violations, stale session resurrection, inconsistent AI terminal state, orphaned assets, and platform-specific UI failure. The goal is to correct those gaps without rewriting the system or turning coverage into a vanity metric.

Baseline verification on 2026-08-26:

- Mobile: 28 Jest suites, 116 tests, all passing.
- Mobile full-source coverage: 75.22% statements, 65.88% branches, 68.85% functions, 78.00% lines.
- Backend: 33 unit suites and 99 tests, all passing.
- Backend integration: 2 suites and 14 tests, all passing.
- Backend coverage: 51.35% statements, 45.18% branches, 44.73% functions, 53.23% lines.
- Backend format, lint, strict typecheck, policy checks, build, and dependency high-severity audit passed.
- FE/BE GraphQL contract passed for 5 operation files and 16 persisted operations.
- Terraform structural validation passed, but cloud infrastructure is explicitly excluded from implementation scope.

## Goals

1. Fix every confirmed P0/P1 correctness, security, privacy, and data-integrity defect in the non-cloud application path.
2. Fix P2 issues when they represent deterministic incorrect behavior rather than speculative optimization.
3. Add the smallest high-signal regression test for every corrected behavior.
4. Restore clear file ownership while preserving the agreed feature-based architecture.
5. Make PostgreSQL constraints and transactions enforce invariants that application code alone cannot guarantee.
6. Preserve current strong mechanisms, especially React Compiler, GraphQL contracts, the modular monolith, transactional outbox, and PostgreSQL `LISTEN/NOTIFY` with durable polling.

## Non-goals

- No AWS, Terraform, Argo CD, IAM, Ingress, ECR, real cloud deployment, or GitHub branch-protection changes.
- No microservice extraction, Kafka, Redis queue, ORM replacement, auth state-machine library, or schema-validation package.
- No Feature-Sliced Design and no movement of screens into feature directories.
- No blanket memoization, manual React performance churn, or LegendList adoption.
- No 100% coverage target, snapshot inflation, route-wrapper tests, generated-code tests, or style-token assertions.
- No message-history API redesign. The current latest-50-message limit remains an explicit product boundary.
- No archive protocol rewrite or pool-size tuning without production measurements. Only deterministic locking and singleton-maintenance defects are addressed.

## Repository and File Boundaries

### Mobile

The mobile application remains feature-based:

- `src/screens` owns screen composition and route-level state.
- `src/features` owns feature API access, domain mapping, hooks, and UI fragments.
- `src/navigation` owns drawer and route transitions only.
- `src/shared` owns feature-neutral platform services.
- Each feature keeps hooks in `hooks.ts`, types in `types.ts`, model mapping in `models.ts`, and local styling in `styles.ts`.
- A component owns one coherent UI responsibility.

Concrete boundary changes:

- Move conversation rename, delete, and pin behavior out of `navigation/hooks.ts` into the chat feature.
- Keep route transitions and drawer presentation in navigation.
- Add a dedicated cross-platform rename dialog component instead of using iOS-only `Alert.prompt`.
- Add a minimal profile feature owner for profile API/account operations while keeping `SettingsScreen` under `src/screens/profile`.
- Split mobile SQLite responsibilities into connection/schema, chat storage, product storage, and private-storage lifecycle modules.

### Backend

The NestJS modular monolith remains the deployment and ownership model.

- Split AI runtime maintenance/recovery from ordinary AI persistence.
- Split the AI provider protocol/parser seam from the streaming lifecycle state machine.
- Split concrete Daiso and Olive Young provider adapters from catalog dispatch.
- Keep the database schema as one schema-owned file rather than one file per table.
- Avoid repository interfaces with one implementation and pass-through service layers.

### Root repository

The root repository owns the release BOM, cross-repository GraphQL checks, integration documentation, and submodule revisions. FE and BE changes are verified independently before the root updates their pinned SHAs.

## Mobile Session and Private Data Design

`SessionStatus` becomes an explicit state model:

- `booting`: local credential presence is still unknown; no private UI may render.
- `guest`: no usable local credential exists.
- `authenticated`: online token rotation succeeded and an access token is installed.
- `offline-authenticated`: a refresh token exists but the device is offline; private cache reads are allowed, while remote work and private writes remain gated by connectivity/session state.

Bootstrap always reads SecureStore, even while offline. It never treats `booting` as authorized.

Refresh behavior:

- Only one refresh promise may be active.
- A monotonically increasing session generation identifies the session that initiated each async operation.
- Login, logout, and terminal clearing increment the generation before doing asynchronous work.
- A result installs tokens only when its captured generation is still current.
- Token payload validation requires non-empty tokens and a finite positive safe-integer expiry.

Logout behavior:

- Invalidate the generation and close private writes first.
- Clear in-memory access state and stop rendering private screens immediately.
- Treat non-2xx server revocation as failure, but never let it block local cleanup.
- Attempt SecureStore, Apollo, and SQLite cleanup independently with `Promise.allSettled` semantics.
- Preserve a cleanup/revocation warning after local state transitions to guest.

Private storage uses a generation-aware write barrier:

- Chat, draft, pin, and product writes capture the open storage generation.
- Writes from a closed or stale generation resolve without committing data.
- Logout closes the gate, drains active writes, and clears all private tables in an exclusive transaction.
- The next authenticated or offline-authenticated session explicitly opens a new generation.

Persisted chat JSON validation checks required fields for each supported discriminated part and rejects malformed resume data. No new validation dependency is added.

## Mobile Behavior Corrections

- Initial text, image-only, and text-plus-image drafts send exactly once after the draft is loaded and every attached asset is ready.
- Malformed or non-HTTPS product URLs are rejected safely at the untyped boundary and in the press handler.
- Conversation rename uses a platform-neutral modal and input.
- Pagination handlers allow only one request for a given cursor at a time and surface or safely consume rejected best-effort requests.
- The drawer exposes a real next-page action when more conversations exist.
- Save/unsave succeeds only when the mutation returns the affected product and no user error.
- The generated GraphQL layer, React Compiler configuration, FlashList, `expo-image`, and existing animation patterns remain unchanged.

## Backend Authentication and Boundary Errors

- JWT verification failures, including malformed, expired, wrong-audience, and bad-signature tokens, normalize to 401 or GraphQL `UNAUTHENTICATED` without provider detail leakage.
- Refresh rotation and logout lock the same session row. Logout revokes the selected session and every replacement descendant atomically, so either refresh or logout wins consistently.
- Login lookup includes soft-deleted identities and returns an explicit deletion-pending conflict instead of attempting a duplicate identity insert.
- Invalid pagination cursors return a validation error instead of silently resetting to the first page.
- Replay offsets accept only values from zero through PostgreSQL signed `bigint` maximum.
- Expected asset business failures use GraphQL `userErrors`; authentication and unexpected internal failures remain top-level errors.

## AI Run Consistency

- An active run periodically extends both `heartbeatAt` and `deadlineAt` while provider streaming is active.
- Heartbeat stops on finish, abort, error, or cancellation.
- `completeRun` must successfully transition a `reserved` run to `completed`; a lost transition throws and cannot emit `RUN_FINISHED`.
- Cancellation writes `status`, `completedAt`, and `streamClosedAt` in the same transaction.
- Replay terminates for every terminal run, including a producerless cancellation.
- Recovery keeps `FOR UPDATE SKIP LOCKED` and only recovers genuinely expired leases.

## PostgreSQL Integrity and Maintenance

The default-only message partition is removed. Archival already bounds the hot set, while the unused partition blocks simple referential integrity.

The migration will:

1. Remove existing orphan message parts.
2. Convert `messages` to a non-partitioned table with `id` as its primary key.
3. Add `message_parts(message_id) REFERENCES messages(id) ON DELETE CASCADE`.
4. Represent live checks, uniqueness constraints, keys, and indexes in the Drizzle schema.
5. Validate the foreign key after cleanup.

Indexes are added only for observed filters, ordering, and destructive cascades:

- global archive scan on `(created_at, id)`;
- favorites pagination on `(account_id, saved_at DESC, product_id DESC)`;
- required foreign-key leading columns used by account/conversation deletion, including auth identities, auth sessions, AI runs, assets, and archive manifests.

Maintenance changes:

- Archive and retention jobs acquire separate PostgreSQL advisory try-locks so horizontally scaled workers do not duplicate maintenance.
- Archive row locking is restricted with `FOR UPDATE OF messages`.
- High-churn expiry cleanup uses bounded CTE batches.
- Full two-phase archive I/O is deferred until lock-wait or pool metrics justify it.

## Outbox and Asset Lifecycle

Purge events are privacy work and cannot be abandoned:

- Backoff remains exponential and is capped at one hour.
- Crossing the retry threshold records failure evidence and structured diagnostics but does not exclude the event from future claims.
- Unpublished purge events are never removed by retention.
- Published-event retention remains bounded.

Asset lifecycle changes:

- Upload creation rejects soft-deleted conversations.
- Asset purge uses deterministic raw and normalized keys.
- Final purge is scheduled beyond the presigned upload window and image-processing allowance.
- A processing result that updates no asset row deletes its normalized object before acknowledging the SQS message.
- Image message parts persist an asset reference, not an expiring signed URL snapshot.
- GraphQL resolves the current owned asset state and a fresh signed URL when reading message history.

The existing transactional outbox, `FOR UPDATE SKIP LOCKED`, commit-time `NOTIFY`, reconnect behavior, and polling fallback remain unchanged.

## Testing Strategy

Every implementation task follows red-green-refactor.

Mobile high-signal tests cover:

- refresh single-flight, stale completion after logout, and opposite-order refresh races;
- online, offline, no-token, and booting authorization states;
- independent cleanup failures and private-write races;
- malformed persisted chat and token responses;
- initial asset readiness and exactly-once send;
- Android rename, malformed URL, nullable mutation result, and duplicate pagination.

Backend unit tests cover:

- authentication error normalization;
- cursor and replay offset bounds;
- AI heartbeat, lost completion transition, and cancellation closure;
- outbox retry semantics;
- asset history resolution and GraphQL business errors.

PostgreSQL/Testcontainers tests cover:

- migration rerun and schema contract;
- orphan prevention and cascade deletion;
- deterministic refresh-versus-logout concurrency;
- purge recovery after more than ten transient failures;
- deletion racing image processing;
- singleton maintenance advisory locks;
- required constraints and indexes.

Contract verification retains schema equality, operation validation, persisted-document hashing, codegen diff, and root submodule BOM checks.

## Coverage Policy

Coverage collects all hand-written source and excludes generated GraphQL, route adapters, test support, and bootstrap-only glue.

- Mobile may not fall below 75% statements, 65% branches, 68% functions, and 78% lines.
- Backend may not fall below 51% statements, 45% branches, 44% functions, and 53% lines.
- Every changed security, deletion, transaction, and concurrency branch must be exercised directly.
- At completion, each repository raises its configured integer thresholds to the achieved values.
- Coverage must not be raised through snapshots or implementation-detail assertions.

## Verification and Delivery

Verification order:

1. Targeted tests for the active change.
2. Full FE and BE tests with coverage.
3. Formatting, lint, and strict typecheck.
4. GraphQL codegen and contract diff.
5. Backend build and Testcontainers integration.
6. Expo Doctor, dependency compatibility, and iOS/Android export.
7. Root BOM and contract checks.
8. Independent specification-compliance review.
9. Independent code-quality review and any required corrections.
10. Complete verification rerun from clean repository states.

Delivery order:

- Implement FE and BE on separate feature branches.
- Use focused Conventional Commits grouped by concern.
- Update the root submodule BOM only after child repositories pass their complete gates.
- Keep `shopport-infra` unchanged.
- Do not push, open PRs, merge, or change external settings until the completed branches have passed review and branch-finishing workflow.

## Risks and Controls

- The message-table migration is the highest-risk change. It must run against a populated Testcontainers database, rerun safely, and prove both data preservation and cascade behavior.
- Session cleanup affects privacy. Private rendering closes before cleanup begins, and every cleanup failure path is tested.
- AI lease behavior is timing-sensitive. Tests use injected clocks/deferred promises rather than wall-clock sleeps.
- Asset deletion is cross-process. The integration test must model the exact delete/upload/process/result ordering.
- Structural splits occur only after characterization tests protect current behavior.

## Deferred Work

- Cloud deployment promotion, persisted-operation multi-version rollout, IAM separation, network policies, worker Kubernetes probes, and real staging E2E remain intentionally deferred with the AWS showcase infrastructure.
- Message history beyond the latest 50 remains a product/API decision.
- Database pool sizing, Lambda concurrency, archive streaming, CDN thumbnail policy, and other performance changes require runtime measurements.
- Branch protection and protected GitHub environments require explicit external-state authorization.
