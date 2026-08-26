# Mobile Session and UX Quality Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the React Native client safe under session, storage, pagination, and draft races while restoring the agreed feature boundaries and adding focused regression coverage.

**Architecture:** Preserve the feature-based mobile architecture: screens stay in `src/screens`, feature behavior stays in `src/features`, navigation owns only presentation/transitions, and shared SQLite code is split by concrete responsibility. Session generation and a private-storage generation barrier are the only new concurrency mechanisms.

**Tech Stack:** React Native 0.86, Expo 57, React 19 with React Compiler, TypeScript 6 strict mode, Apollo Client 4, Expo SQLite/SecureStore, Jest 29, Testing Library React Native.

**Spec:** [`docs/superpowers/specs/2026-08-26-full-stack-quality-hardening-design.md`](../specs/2026-08-26-full-stack-quality-hardening-design.md)

## Global Constraints

- Work only in `/Volumes/Untitled/Documents/Github/shopport-app/shopport-fe` on a feature branch created from `develop`.
- Do not move screens under features, introduce Feature-Sliced Design, add manual memoization, replace FlashList, or add LegendList.
- Do not add a state-machine, validation, retry, or storage package. Reuse React refs, native `URL`, and the installed Expo APIs.
- Keep hooks in each feature's `hooks.ts`, types in `types.ts`, model mapping in `models.ts`, and new component styling in `styles.ts`.
- Every behavior change starts with a failing test. Run the narrowest test first, then `pnpm check` and the full coverage gate.
- Preserve React Compiler configuration in `apps/mobile/app.config.ts`; do not add `memo`, `useMemo`, or `useCallback`.
- Make focused Conventional Commits. Never include root/submodule pointer changes in this repository's commits.

## Responsibility Map

### Files to create

- `apps/mobile/src/shared/storage/schema.ts` — SQLite schema initialization only.
- `apps/mobile/src/shared/storage/connection.ts` — database connection ownership only.
- `apps/mobile/src/shared/storage/private-storage.ts` — private write generation, draining, and exclusive clearing.
- `apps/mobile/src/shared/storage/chat-storage.ts` — chat snapshots, drafts, and conversation pins.
- `apps/mobile/src/shared/storage/product-storage.ts` — cached product persistence.
- `apps/mobile/src/shared/storage/index.ts` — public storage exports only.
- `apps/mobile/src/shared/storage/private-storage.unit.spec.ts` — write-barrier and cleanup races.
- `apps/mobile/src/shared/storage/chat-storage.unit.spec.ts` — chat parsing/coalescing behavior.
- `apps/mobile/src/shared/storage/product-storage.unit.spec.ts` — product cache behavior.
- `apps/mobile/src/features/auth/__tests__/auth-token.unit.spec.ts` — SecureStore contract.
- `apps/mobile/src/features/auth/api/__tests__/schemas.unit.spec.ts` — token response boundary.
- `apps/mobile/src/providers/network-provider.unit.spec.tsx` — network state matrix.
- `apps/mobile/src/screens/auth/auth-screen.unit.spec.tsx` — boot/redirect/login UI states.
- `apps/mobile/src/features/chat/components/rename-dialog/rename-conversation-dialog.tsx` — cross-platform rename UI.
- `apps/mobile/src/features/chat/components/rename-dialog/styles.ts` — rename dialog styles.
- `apps/mobile/src/features/chat/components/rename-dialog/rename-conversation-dialog.unit.spec.tsx` — Android-compatible dialog behavior.
- `apps/mobile/src/features/chat/__tests__/conversation-actions.unit.spec.tsx` — rename/delete/pin commands.
- `apps/mobile/src/features/profile/api/hooks.ts` — viewer query/update/delete operations.
- `apps/mobile/src/features/profile/index.ts` — profile public API.

### Files to replace or delete

- Delete `apps/mobile/src/shared/storage/database.ts` after its responsibilities are moved.
- Delete `apps/mobile/src/shared/storage/database.unit.spec.ts` after its assertions are assigned to the three focused suites.
- Delete `apps/mobile/src/navigation/hooks.ts` after conversation commands move to chat.

### Existing files to modify

- Auth: `features/auth/types.ts`, `features/auth/session-provider.tsx`, `features/auth/auth-token.ts`, `features/auth/index.ts`, `features/auth/api/schemas.ts`, `features/auth/api/fetchers.ts`, and their existing tests.
- Chat: `features/chat/hooks.ts`, `features/chat/types.ts`, `features/chat/index.ts`, `features/chat/api/hooks.ts`, composer tests/support, attachment tests, and API hook tests.
- Catalog/favorites: `features/catalog/api/hooks.ts`, `features/catalog/domain/tool-results.ts`, `features/catalog/components/product-card.tsx`, related tests, and `features/favorites/api/hooks.ts` plus tests.
- Navigation/screens: `navigation/types.ts`, `navigation/components/shopport-drawer-content.tsx` plus tests; private screens under `screens/auth`, `screens/chat`, `screens/catalog`, `screens/favorites`, and `screens/profile` plus tests.
- Test/dependency configuration: `apps/mobile/jest.config.js`, `apps/mobile/package.json`, root `package.json`, and `pnpm-lock.yaml` inside `shopport-fe`.
- Update every import currently targeting `@/shared/storage/database` to the public `@/shared/storage` entry point.

## Execution Preflight

- [ ] Create the branch and prove the baseline before editing:

  ```bash
  cd /Volumes/Untitled/Documents/Github/shopport-app/shopport-fe
  git switch develop
  git status --short --branch
  git switch -c feat/mobile-quality-hardening
  pnpm check
  pnpm test
  ```

- [ ] Confirm React Compiler remains enabled and no manual memoization exists:

  ```bash
  rg -n "reactCompiler" apps/mobile/app.config.ts
  rg -n "memo\(|useMemo\(|useCallback\(" apps/mobile/src || true
  ```

## Task 1: Harden token and SecureStore boundaries

**Files**

- Modify: `apps/mobile/src/features/auth/api/schemas.ts`
- Modify: `apps/mobile/src/features/auth/api/fetchers.ts`
- Test: `apps/mobile/src/features/auth/api/__tests__/schemas.unit.spec.ts`
- Test: `apps/mobile/src/features/auth/api/__tests__/fetchers.integration.spec.ts`
- Test: `apps/mobile/src/features/auth/__tests__/auth-token.unit.spec.ts`

**Interfaces**

```ts
export const parseTokenPair = (value: unknown): TokenPair;
export const revokeSession = (refreshToken: string): Promise<void>;
```

- [ ] Add failing token-parser cases for empty/whitespace tokens, `Infinity`, fractional expiry, and values above `Number.MAX_SAFE_INTEGER`:

  ```ts
  it.each([
    { accessToken: "", refreshToken: "refresh", expiresIn: 900 },
    { accessToken: "access", refreshToken: " ", expiresIn: 900 },
    { accessToken: "access", refreshToken: "refresh", expiresIn: Infinity },
    { accessToken: "access", refreshToken: "refresh", expiresIn: 1.5 },
  ])("rejects an unusable token pair", (value) => {
    expect(() => parseTokenPair(value)).toThrow(
      "인증 서버 응답이 올바르지 않습니다.",
    );
  });
  ```

- [ ] Run the parser test and confirm it fails:

  ```bash
  pnpm --filter @shopport/mobile test --runTestsByPath src/features/auth/api/__tests__/schemas.unit.spec.ts
  ```

- [ ] Implement the minimum runtime predicate:

  ```ts
  const isNonEmptyString = (value: unknown): value is string =>
    typeof value === "string" && value.trim().length > 0;

  const isExpirySeconds = (value: unknown): value is number =>
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    Number.isFinite(value) &&
    value > 0;
  ```

- [ ] Add a failing HTTP adapter test proving `/logout` status 500 rejects, then make `revokeSession` check `response.ok`:

  ```ts
  export const revokeSession = async (refreshToken: string): Promise<void> => {
    const response = await post("/v1/auth/logout", { refreshToken });
    if (!response.ok) throw new Error("서버 로그아웃을 완료하지 못했습니다.");
  };
  ```

- [ ] Add the SecureStore contract test for the exact key and `AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY`, then run all three targeted suites:

  ```bash
  pnpm --filter @shopport/mobile test --runTestsByPath \
    src/features/auth/api/__tests__/schemas.unit.spec.ts \
    src/features/auth/api/__tests__/fetchers.integration.spec.ts \
    src/features/auth/__tests__/auth-token.unit.spec.ts
  ```

- [ ] Commit:

  ```bash
  git add apps/mobile/src/features/auth
  git commit -m "fix(auth): harden token response boundaries"
  ```

## Task 2: Split SQLite code by actual responsibility

**Files**

- Create: `apps/mobile/src/shared/storage/schema.ts`
- Create: `apps/mobile/src/shared/storage/connection.ts`
- Create: `apps/mobile/src/shared/storage/private-storage.ts`
- Create: `apps/mobile/src/shared/storage/chat-storage.ts`
- Create: `apps/mobile/src/shared/storage/product-storage.ts`
- Create: `apps/mobile/src/shared/storage/index.ts`
- Create tests: `chat-storage.unit.spec.ts`, `product-storage.unit.spec.ts`, `private-storage.unit.spec.ts`
- Delete: `apps/mobile/src/shared/storage/database.ts`
- Delete: `apps/mobile/src/shared/storage/database.unit.spec.ts`
- Modify: all files listed by `rg -l '@/shared/storage/database' apps/mobile/src`

**Interfaces**

```ts
export const database = (): Promise<SQLiteDatabase>;
export const openPrivateStorage = (): Promise<void>;
export const closePrivateStorage = (): Promise<void>;
export const clearPrivateStorage = (): Promise<void>;
export const capturePrivateWriteGeneration = (): number | null;
export const runPrivateWrite = (
  capturedGeneration: number | null,
  write: () => Promise<void>,
): Promise<void>;
export const sqliteChatPersistence: ChatClientPersistence;
```

- [ ] Copy the existing cache/coalescing/parser assertions into the three destination suites before moving code. Run them against the current `database.ts` and confirm green.

- [ ] Move the schema initializer without changing SQL:

  ```ts
  // schema.ts
  export const initializeStorageSchema = (db: SQLiteDatabase): Promise<void> =>
    db.execAsync(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS conversation_pin (
        conversation_id TEXT PRIMARY KEY NOT NULL,
        pinned_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS product_cache (
        id TEXT PRIMARY KEY NOT NULL,
        payload TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS draft (
        conversation_id TEXT PRIMARY KEY NOT NULL,
        text TEXT NOT NULL,
        asset_id TEXT,
        asset_uri TEXT,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS chat_cache (
        id TEXT PRIMARY KEY NOT NULL,
        payload TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `);
  ```

- [ ] Move only connection ownership to `connection.ts`, chat/draft/pin behavior to `chat-storage.ts`, product behavior to `product-storage.ts`, and lifecycle behavior to `private-storage.ts`. Keep `index.ts` as exports, not a second implementation.

- [ ] Add failing persisted-chat cases before strengthening the moved parser. Cover a missing message ID, unsupported role, text without string `content`, image without a valid URL/base64 `source`, tool call without `id`/`name`/`arguments`/valid `state`, tool result without `toolCallId`/`content`/valid `state`, thinking without string `content`, malformed `createdAt`, and malformed `resume.resumeState` IDs. Keep one valid case for every supported part discriminator.

- [ ] Replace the current “part has a string type” predicate with one exhaustive discriminated switch for the part kinds the app currently produces or renders: `text`, `image`, `tool-call`, `tool-result`, and `thinking`. Validate every required field and enum state from TanStack AI's installed types; reject unknown part types and malformed optional resume data. Reuse `isRecord`, `serializedDatePattern`, and native predicates—do not add Zod or a validation package to mobile storage.

- [ ] Update all storage imports to `@/shared/storage`, delete the original files, and prove behavior did not change:

  ```bash
  pnpm --filter @shopport/mobile test --runTestsByPath \
    src/shared/storage/chat-storage.unit.spec.ts \
    src/shared/storage/product-storage.unit.spec.ts \
    src/shared/storage/private-storage.unit.spec.ts
  pnpm --filter @shopport/mobile typecheck
  ```

- [ ] Commit the behavior-preserving split:

  ```bash
  git add apps/mobile/src/shared/storage apps/mobile/src
  git commit -m "refactor(storage): split private persistence roles"
  ```

## Task 3: Add the private-storage write barrier

**Files**

- Modify: `apps/mobile/src/shared/storage/private-storage.ts`
- Modify: `apps/mobile/src/shared/storage/chat-storage.ts`
- Modify: `apps/mobile/src/shared/storage/product-storage.ts`
- Modify: `apps/mobile/src/shared/storage/types.ts`
- Test: `apps/mobile/src/shared/storage/private-storage.unit.spec.ts`
- Test: `apps/mobile/src/shared/storage/chat-storage.unit.spec.ts`

**Interfaces**

```ts
export const openPrivateStorage = (): Promise<void>;
export const closePrivateStorage = (): Promise<void>;
export const clearPrivateStorage = (): Promise<void>;
export const capturePrivateWriteGeneration = (): number | null;
export const runPrivateWrite = (
  capturedGeneration: number | null,
  write: () => Promise<void>,
): Promise<void>;
```

- [ ] Add deferred-write tests for `saveDraft`, `cacheProducts`, `setConversationPinned`, and `sqliteChatPersistence.setItem`: close storage while the SQL promise is pending, clear it, reopen it, and assert no stale write commits after the clear.

- [ ] Run the new suite and confirm the current implementation recreates data or lacks `withExclusiveTransactionAsync`:

  ```bash
  pnpm --filter @shopport/mobile test --runTestsByPath src/shared/storage/private-storage.unit.spec.ts
  ```

- [ ] Implement one module-level generation and active-write set; do not add a class:

  ```ts
  let generation = 0;
  let writable = false;
  const activeWrites = new Set<Promise<void>>();

  export const capturePrivateWriteGeneration = (): number | null =>
    writable ? generation : null;

  export const runPrivateWrite = async (
    capturedGeneration: number | null,
    write: () => Promise<void>,
  ): Promise<void> => {
    if (
      capturedGeneration === null ||
      !writable ||
      generation !== capturedGeneration
    )
      return;
    const pending = Promise.resolve().then(async () => {
      if (writable && generation === capturedGeneration) await write();
    });
    activeWrites.add(pending);
    try {
      await pending;
    } finally {
      activeWrites.delete(pending);
    }
  };
  ```

- [ ] Make close immediate (`writable = false; generation += 1`), drain a snapshot of active writes, and clear all four tables inside `db.withExclusiveTransactionAsync`. Serialize open behind any in-progress clear so a new session cannot open before deletion commits.

- [ ] Capture the generation at each public write invocation and pass it to `runPrivateWrite`. Add `generation: number | null` to `PendingChatWrite`, capture it in `sqliteChatPersistence.setItem`, replace an existing pending record when its generation differs, and ignore pending snapshots whose generation is not current on reads. This prevents a timer created by the logged-out session from capturing the next session's generation when it eventually fires.

- [ ] Run storage suites three times with fake timers to expose leaked pending work:

  ```bash
  for run in 1 2 3; do
    pnpm --filter @shopport/mobile test --runTestsByPath \
      src/shared/storage/private-storage.unit.spec.ts \
      src/shared/storage/chat-storage.unit.spec.ts || exit 1
  done
  ```

- [ ] Commit:

  ```bash
  git add apps/mobile/src/shared/storage
  git commit -m "fix(storage): block stale private writes on logout"
  ```

## Task 4: Make session transitions race-safe and explicit

**Files**

- Modify: `apps/mobile/src/features/auth/types.ts`
- Modify: `apps/mobile/src/features/auth/session-provider.tsx`
- Modify: `apps/mobile/src/features/auth/index.ts`
- Modify: `apps/mobile/src/features/auth/__tests__/session-provider.unit.spec.tsx`

**Interfaces**

```ts
export type SessionStatus =
  | "booting"
  | "guest"
  | "authenticated"
  | "offline-authenticated";

export type SessionContextValue = Readonly<{
  error: string | null;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  status: SessionStatus;
}>;
```

- [ ] Replace the current two tests with a complete state/race table using deferred promises: no token online, token offline, successful online boot, one refresh call for concurrent triggers, refresh resolving after logout, old refresh rejecting after a newer login, and each local cleanup dependency rejecting independently.

- [ ] Confirm at least the stale-completion and cleanup-isolation tests fail:

  ```bash
  pnpm --filter @shopport/mobile test --runTestsByPath src/features/auth/__tests__/session-provider.unit.spec.tsx
  ```

- [ ] Add a monotonic generation ref, a refresh flight keyed by generation, and a tiny serialized SecureStore mutation promise. Check generation immediately before and after credential writes; logout invalidates before any await.

- [ ] Implement bootstrap policy exactly:

  ```ts
  const bootstrap = async (): Promise<void> => {
    const captured = generationRef.current;
    const refreshToken = await readRefreshToken();
    if (captured !== generationRef.current) return;
    if (!refreshToken) {
      await clearLocalSession(captured);
      return;
    }
    if (!online) {
      await openPrivateStorage();
      if (captured === generationRef.current)
        setStatus("offline-authenticated");
      return;
    }
    await refresh(captured, refreshToken);
  };
  ```

- [ ] Make logout hide private state and close writes synchronously, then use independent settled cleanup. Preserve a server-revocation or local-cleanup warning after `guest` is installed:

  ```ts
  const results = await Promise.allSettled([
    secureStoreCleanup,
    apolloClient.clearStore(),
    clearPrivateStorage(),
  ]);
  ```

- [ ] Remove unused `sessionVersion` and stop publicly exporting `setAccessToken`. Open private storage only after a current successful login/refresh or an explicit offline bootstrap.

- [ ] Run auth suites and typecheck:

  ```bash
  pnpm --filter @shopport/mobile test --runTestsByPath \
    src/features/auth/__tests__/session-provider.unit.spec.tsx \
    src/features/auth/__tests__/auth-token.unit.spec.ts \
    src/features/auth/api/__tests__/fetchers.integration.spec.ts
  pnpm --filter @shopport/mobile typecheck
  ```

- [ ] Commit:

  ```bash
  git add apps/mobile/src/features/auth apps/mobile/src/shared/storage
  git commit -m "fix(auth): serialize session transitions"
  ```

## Task 5: Gate private screens and test network/auth UI states

**Files**

- Modify/test: `apps/mobile/src/screens/auth/auth-screen.tsx`
- Modify/test: `apps/mobile/src/screens/chat/chat-screen.tsx`
- Modify/test: `apps/mobile/src/screens/chat/conversation-screen.tsx`
- Modify: `apps/mobile/src/screens/chat/uploaded-images-screen.tsx`
- Modify: `apps/mobile/src/screens/catalog/found-products-screen.tsx`
- Modify: `apps/mobile/src/screens/favorites/favorites-screen.tsx`
- Modify: `apps/mobile/src/screens/profile/settings-screen.tsx`
- Create: `apps/mobile/src/providers/network-provider.unit.spec.tsx`
- Create: `apps/mobile/src/screens/auth/auth-screen.unit.spec.tsx`

**Behavior contract**

```ts
// booting: render no private content
// guest: redirect to /auth
// authenticated: private reads and remote work
// offline-authenticated: private cache reads, no remote work
```

- [ ] Add screen tests proving `booting` never renders cached/private content and `offline-authenticated` renders cache-only surfaces without enabling GraphQL hooks.

- [ ] Add network-provider tests for disconnected, unreachable, restored, and listener-unsubscribe states. Add auth-screen tests for spinner, both authenticated statuses redirecting, visible login errors, and duplicate tap suppression.

- [ ] Run and confirm failures against the current `status === 'guest'` checks:

  ```bash
  pnpm --filter @shopport/mobile test --runTestsByPath \
    src/providers/network-provider.unit.spec.tsx \
    src/screens/auth/auth-screen.unit.spec.tsx \
    src/screens/chat/chat-screen.unit.spec.tsx \
    src/screens/chat/conversation-screen.unit.spec.tsx
  ```

- [ ] Apply explicit status branches in each screen. Remote query enablement remains `status === 'authenticated' && online`; offline-authenticated paths may only read SQLite/Apollo cache already on device.

- [ ] Make the login UI `run` use `try/finally` so a rejected login cannot leave the button permanently busy.

- [ ] Run the targeted suites and commit:

  ```bash
  pnpm --filter @shopport/mobile test --runTestsByPath \
    src/providers/network-provider.unit.spec.tsx \
    src/screens/auth/auth-screen.unit.spec.tsx \
    src/screens/chat/chat-screen.unit.spec.tsx \
    src/screens/chat/conversation-screen.unit.spec.tsx
  git add apps/mobile/src/providers apps/mobile/src/screens
  git commit -m "fix(session): gate private screens during bootstrap"
  ```

## Task 6: Send restored drafts exactly once after asset readiness

**Files**

- Modify: `apps/mobile/src/features/chat/hooks.ts`
- Modify: `apps/mobile/src/features/chat/types.ts`
- Modify: `apps/mobile/src/features/chat/components/composer/chat-composer.tsx`
- Modify: `apps/mobile/src/features/chat/components/composer/testing/test-support.tsx`
- Modify: `apps/mobile/src/features/chat/components/composer/testing/draft-cases.tsx`

**Interfaces**

```ts
// Internal action result: true only after onSend and draft deletion succeed.
send: () => Promise<boolean>;
```

- [ ] Add three failing cases: image-only draft, text-plus-image draft, and a rerender while the initial send is pending. In each case resolve `pollAssetUntilSettled`/`readAssetStatus` to READY and assert `onSend` is called exactly once.

- [ ] Run the composer suite and confirm image-only never sends today:

  ```bash
  pnpm --filter @shopport/mobile test --runTestsByPath src/features/chat/components/composer/__tests__/chat-composer.unit.spec.tsx
  ```

- [ ] Return `false` from every send guard/failure and `true` only after the draft is deleted. Add `initialDraftSendingRef` and `initialDraftSentRef`: guard when either is true, set only `Sending` before awaiting, set `Sent` only on `true`, and clear `Sending` in `finally`. A precondition/error result may retry on a later readiness change; a successful result cannot send again.

- [ ] Gate the initial effect on `(trimmed text || asset)`, online, not loading/uploading, and READY asset state. Keep `initialDraftSentRef` false after a failed/precondition send so a later readiness change can retry.

- [ ] Run the composer and chat-screen suites, then commit:

  ```bash
  pnpm --filter @shopport/mobile test --runTestsByPath \
    src/features/chat/components/composer/__tests__/chat-composer.unit.spec.tsx \
    src/screens/chat/chat-screen.unit.spec.tsx
  git add apps/mobile/src/features/chat apps/mobile/src/screens/chat
  git commit -m "fix(chat): send restored drafts after asset readiness"
  ```

## Task 7: Harden URLs, mutations, attachments, and pagination

**Files**

- Modify/test: `apps/mobile/src/features/catalog/domain/tool-results.ts`
- Modify/test: `apps/mobile/src/features/catalog/components/product-card.tsx`
- Modify/test: `apps/mobile/src/features/catalog/api/hooks.ts`
- Modify/test: `apps/mobile/src/features/favorites/api/hooks.ts`
- Modify/test: `apps/mobile/src/features/chat/api/hooks.ts`
- Modify/test: `apps/mobile/src/features/chat/__tests__/attachments.unit.spec.ts`
- Modify: `apps/mobile/src/screens/chat/uploaded-images-screen.tsx`

**Interfaces**

```ts
export const useFoundProductRecommendations = (enabled: boolean): {
  loadMore: () => Promise<void>;
  recommendations: Array<RecommendedProduct>;
};
```

- [ ] Add failing cases for malformed/non-HTTPS outbound URLs, a save/unsave payload with `product: null` and no user error, duplicate `loadMore` calls for one cursor, rejected `fetchMore`, and attachment denial/cancel/oversize/pixel/MIME/timeout cleanup.

- [ ] Run the focused suites and record the expected failures:

  ```bash
  pnpm --filter @shopport/mobile test --runTestsByPath \
    src/features/catalog/domain/__tests__/tool-results.unit.spec.ts \
    src/features/catalog/components/__tests__/product-card.unit.spec.tsx \
    src/features/favorites/api/__tests__/hooks.unit.spec.ts \
    src/features/chat/__tests__/attachments.unit.spec.ts
  ```

- [ ] Validate outbound URLs at the untyped tool-result boundary with native `URL`, and keep construction/protocol validation inside the press handler's `try`:

  ```ts
  const httpsUrl = (value: string): string | null => {
    try {
      const url = new URL(value);
      return url.protocol === "https:" ? url.toString() : null;
    } catch {
      return null;
    }
  };
  ```

- [ ] Treat mutation success as `payload.product !== null && userErrors.length === 0`; otherwise return the server message or a stable fallback and do not flip local saved state.

- [ ] Add a cursor ref in each pagination hook. Await `fetchMore`, suppress only a second request for the same active cursor, clear the ref in `finally`, and consume expected best-effort rejection without an unhandled promise.

- [ ] Run all affected suites and commit:

  ```bash
  pnpm --filter @shopport/mobile test --runTestsByPath \
    src/features/catalog/domain/__tests__/tool-results.unit.spec.ts \
    src/features/catalog/components/__tests__/product-card.unit.spec.tsx \
    src/features/favorites/api/__tests__/hooks.unit.spec.ts \
    src/features/chat/api/__tests__/fetchers.unit.spec.ts \
    src/features/chat/__tests__/attachments.unit.spec.ts
  git add apps/mobile/src/features apps/mobile/src/screens/chat
  git commit -m "fix(mobile): harden product and pagination boundaries"
  ```

## Task 8: Move conversation commands into chat and add a real rename dialog

**Files**

- Modify: `apps/mobile/src/features/chat/hooks.ts`
- Modify: `apps/mobile/src/features/chat/types.ts`
- Modify: `apps/mobile/src/features/chat/index.ts`
- Create: `apps/mobile/src/features/chat/components/rename-dialog/rename-conversation-dialog.tsx`
- Create: `apps/mobile/src/features/chat/components/rename-dialog/styles.ts`
- Create tests: rename dialog and conversation actions suites
- Modify: `apps/mobile/src/navigation/components/shopport-drawer-content.tsx`
- Modify: `apps/mobile/src/navigation/components/shopport-drawer-content.unit.spec.tsx`
- Modify: `apps/mobile/src/navigation/types.ts`
- Delete: `apps/mobile/src/navigation/hooks.ts`

**Interfaces**

```ts
export const useConversationActions = (props: ConversationActionProps): {
  remove: () => void;
  rename: (title: string) => Promise<boolean>;
  togglePin: () => void;
};

export type RenameConversationDialogProps = Readonly<{
  initialTitle: string;
  onDismiss: () => void;
  onSubmit: (title: string) => Promise<boolean>;
  visible: boolean;
}>;
```

- [ ] Characterize offline, user-error, network-error, successful delete cleanup, cleanup failure, refetch failure, and pin persistence in a chat-owned hook test before moving code.

- [ ] Add a dialog test with `Platform.OS = 'android'` proving text input, cancel, trim, disabled empty submit, loading state, and successful dismissal. Confirm it fails because `Alert.prompt` is the only rename UI.

- [ ] In the same suite, assert the modal announces itself as modal, the input has a visible/accessibility label, action controls use button roles, submit exposes its disabled/busy state, and focus enters the input when opened. Use React Native accessibility props; do not add a UI or focus-management package.

- [ ] Move mutation/storage commands into `features/chat/hooks.ts`; leave `router`, drawer close, link preview/menu, and navigation callbacks in navigation.

- [ ] Render the new dialog from `ConversationLink`, opening it from the menu action. The component owns only modal/input UI; the chat hook owns the mutation and refresh result.

- [ ] Add an explicit drawer next-page button when `pageInfo.hasNextPage`; use the same cursor single-flight rule and surface failure with `Alert.alert`.

- [ ] Run chat/navigation tests and confirm `navigation/hooks.ts` has no callers before deleting it:

  ```bash
  pnpm --filter @shopport/mobile test --runTestsByPath \
    src/features/chat/__tests__/conversation-actions.unit.spec.tsx \
    src/features/chat/components/rename-dialog/rename-conversation-dialog.unit.spec.tsx \
    src/navigation/components/shopport-drawer-content.unit.spec.tsx
  rg -n "navigation/hooks|useConversationActionHandlers" apps/mobile/src || true
  ```

- [ ] Commit:

  ```bash
  git add apps/mobile/src/features/chat apps/mobile/src/navigation
  git commit -m "refactor(chat): own conversation commands"
  ```

## Task 9: Give profile operations a feature owner

**Files**

- Create: `apps/mobile/src/features/profile/api/hooks.ts`
- Create: `apps/mobile/src/features/profile/index.ts`
- Modify: `apps/mobile/src/screens/profile/settings-screen.tsx`
- Modify: `apps/mobile/src/screens/profile/settings-screen.unit.spec.tsx`

**Interfaces**

```ts
export const useProfile = (): {
  deleteAccount: () => Promise<string | null>;
  displayName: string | null;
  updateDisplayName: (displayName: string) => Promise<string | null>;
  updating: boolean;
};
```

- [ ] Rewrite the settings test to mock the profile hook by GraphQL responsibility rather than alternating `useMutation` call order. Keep current UI behavior assertions green.

- [ ] Move viewer query/update/delete operations and user-error mapping to `features/profile/api/hooks.ts`; keep nickname state, confirmation UI, routing, Kakao email presentation, and styles in the screen.

- [ ] Run the screen test and typecheck:

  ```bash
  pnpm --filter @shopport/mobile test --runTestsByPath src/screens/profile/settings-screen.unit.spec.tsx
  pnpm --filter @shopport/mobile typecheck
  ```

- [ ] Commit:

  ```bash
  git add apps/mobile/src/features/profile apps/mobile/src/screens/profile
  git commit -m "refactor(profile): own account operations"
  ```

## Task 10: Remove proven-unused direct dependencies

**Files**

- Modify: `apps/mobile/package.json`
- Modify: `pnpm-lock.yaml`
- Preserve: `pnpm-workspace.yaml` minimum-release-age exceptions still needed by transitive Expo packages

- [ ] Reconfirm zero source/config imports and dependency provenance:

  ```bash
  rg -n --glob '!package.json' --glob '!pnpm-lock.yaml' \
    "@react-native-segmented-control/segmented-control|expo-device|expo-network|expo-system-ui|expo-web-browser|@expo/ui" . || true
  pnpm --filter @shopport/mobile why @expo/ui expo-font
  ```

- [ ] Remove only the six proven-unused direct declarations. Keep `expo-font` because Expo Router/Expo Symbols consume it:

  ```bash
  pnpm --filter @shopport/mobile remove \
    @expo/ui \
    @react-native-segmented-control/segmented-control \
    expo-device \
    expo-network \
    expo-system-ui \
    expo-web-browser
  ```

- [ ] Verify a frozen reinstall, Expo dependency compatibility, doctor, and both exports:

  ```bash
  pnpm install --frozen-lockfile
  pnpm --filter @shopport/mobile exec expo install --check
  pnpm doctor
  pnpm build
  ```

- [ ] Commit:

  ```bash
  git add apps/mobile/package.json pnpm-lock.yaml
  git commit -m "chore(mobile): remove unused direct dependencies"
  ```

## Task 11: Add and ratchet the mobile coverage gate

**Files**

- Modify: `apps/mobile/jest.config.js`
- Modify: `apps/mobile/package.json`
- Modify: `package.json`

**Interfaces**

```js
coverageThreshold: {
  global: { statements: 75, branches: 65, functions: 68, lines: 78 },
}
```

- [ ] Add `collectCoverageFrom` for hand-written `src/**/*.{ts,tsx}` and exclude generated GraphQL, `src/app` route adapters, specs, test setup/support, and declaration files. Add `test:coverage` scripts at app and repository root.

  ```json
  {
    "scripts": {
      "test:coverage": "jest --runInBand --coverage"
    }
  }
  ```

  The repository-root script must run the mobile coverage script and the existing `node --test scripts/audit-policy.test.mjs`, so the new gate does not drop the current policy test.

- [ ] Run the baseline floor before ratcheting:

  ```bash
  pnpm test:coverage
  ```

- [ ] Read the final global summary, round each achieved percentage down to an integer, and replace only the four configured thresholds with those achieved integers. Do not weaken any approved floor.

- [ ] Run the complete mobile gate from a clean index:

  ```bash
  pnpm format
  pnpm check
  pnpm test:coverage
  pnpm codegen
  git diff --exit-code -- apps/mobile/src/graphql/generated
  pnpm doctor
  pnpm build
  git status --short
  ```

- [ ] Verify no prohibited architecture/performance drift:

  ```bash
  test ! -e apps/mobile/src/navigation/hooks.ts
  test ! -e apps/mobile/src/shared/storage/database.ts
  rg -n "memo\(|useMemo\(|useCallback\(|LegendList" apps/mobile/src && exit 1 || true
  find apps/mobile/src/features -type d -name screens -print -quit | grep . && exit 1 || true
  ```

- [ ] Commit the gate and any formatter-only changes:

  ```bash
  git add apps/mobile/jest.config.js apps/mobile/package.json package.json apps/mobile/src
  git commit -m "test(mobile): enforce full-source coverage"
  ```

## Mobile Plan Completion Evidence

- [ ] Save the exact `pnpm check`, `pnpm test:coverage`, `pnpm doctor`, and `pnpm build` summaries for the final review.
- [ ] Confirm `git status --short` is clean and `git log --oneline develop..HEAD` contains only the focused commits above.
- [ ] Do not push or open a PR yet. Return the branch and evidence to the root execution workflow for specification and code-quality review.
