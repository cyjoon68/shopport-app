# Full-Stack Quality Integration and Delivery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the verified mobile and backend hardening into enforceable local/CI gates, deliver each repository through reviewed squash-merge PRs, and pin the root bill of materials to the merged child commits.

**Architecture:** `shopport-fe` and `shopport-be` remain independently versioned repositories and are merged first. The root repository owns only cross-repository contract checks, CI orchestration, release-gate documentation, and the exact submodule SHAs. Cloud showcase assets remain present but outside mandatory core-app quality gates.

**Tech Stack:** Git submodules, GitHub Actions, GNU Make, pnpm 11, Node.js 22, Expo/React Native checks, NestJS/Jest/Testcontainers checks, GitHub CLI.

**Spec:** [`docs/superpowers/specs/2026-08-26-full-stack-quality-hardening-design.md`](../specs/2026-08-26-full-stack-quality-hardening-design.md)

## Global Constraints

- Complete [`2026-08-26-mobile-quality-hardening.md`](./2026-08-26-mobile-quality-hardening.md), [`2026-08-26-backend-auth-ai-hardening.md`](./2026-08-26-backend-auth-ai-hardening.md), and [`2026-08-26-postgres-outbox-asset-integrity.md`](./2026-08-26-postgres-outbox-asset-integrity.md) before updating root submodule pointers.
- Do not touch `shopport-infra`, Terraform, Argo, IAM, Ingress, ECR, AWS account configuration, real-provider secrets, branch-protection settings, or cloud deployment workflows.
- Keep the existing secret scan. Keep backend Testcontainers integration tests as the executable cross-process gate; do not fabricate a mobile E2E run that needs unavailable credentials or devices.
- Coverage thresholds are ratchets established in the child repositories. CI must call their scripts, not duplicate percentages in root YAML.
- Never stage a child worktree as a dirty submodule. Root pointers must reference clean commits already merged into each child's `develop`.
- Use squash merge for every PR into `develop`. Delete only the feature branch proven merged by that PR; never delete `develop`, `main`, an unrelated branch, or an unmerged branch.
- Do not claim completion from old output. Re-run every final gate after the merge SHAs are pinned.

## Responsibility Map

### Existing files to modify

- `.github/workflows/ci.yml` — mandatory static, unit, coverage, build, schema, contract, integration, and secret gates.
- `Makefile` — one local core quality target and one release target.
- `docs/release-gates.md` — distinguish enforced core-app gates from cloud/showcase and external launch evidence.
- `shopport-fe` — root gitlink only, after the FE PR is merged.
- `shopport-be` — root gitlink only, after the BE PR is merged.

### Files explicitly excluded

- Every path under `shopport-infra`.
- `.github` workflows whose only purpose is cloud deployment or infrastructure validation.
- Provider credentials, mobile signing material, store metadata, and branch-protection configuration.

## Execution Preflight

- [ ] Confirm GitHub CLI authentication and all three repository remotes without mutating them:

  ```bash
  cd /Volumes/Untitled/Documents/Github/shopport-app
  gh auth status
  git remote -v
  git -C shopport-fe remote -v
  git -C shopport-be remote -v
  ```

- [ ] Confirm the root's known pre-existing FE gitlink mismatch is the only non-doc root state. Do not stage it yet:

  ```bash
  git status --short --branch
  git diff --submodule=short -- shopport-fe shopport-be
  ```

- [ ] Preserve the approved design/plan commits by renaming the current local branch, then recreate local `develop` from its untouched remote ref:

  ```bash
  test "$(git branch --show-current)" = "develop"
  git branch -m chore/full-stack-quality-hardening
  git branch --track develop origin/develop
  git merge-base --is-ancestor 3fe49ad chore/full-stack-quality-hardening
  git log --oneline --decorate -5
  ```

  Renaming preserves every local documentation commit on the checked-out delivery branch; creating `develop` from `origin/develop` avoids a later squash-merge divergence. Do not force-move or delete any branch in this step.

## Task 1: Review and Deliver the Mobile Repository

**Files:**

- Review: every path changed from `shopport-fe/develop`
- Verify: `shopport-fe/package.json`, `shopport-fe/apps/mobile/jest.config.js`, mobile source/tests, and `shopport-fe/pnpm-lock.yaml`
- Deliver: branch `feat/mobile-quality-hardening` to `develop`

- [ ] Re-run the mobile plan's complete gate in a clean worktree:

  ```bash
  cd /Volumes/Untitled/Documents/Github/shopport-app/shopport-fe
  git status --short --branch
  pnpm check
  pnpm test:coverage
  pnpm codegen
  git diff --exit-code
  pnpm doctor
  pnpm build
  ```

- [ ] Invoke `superpowers:requesting-code-review` with the approved design, mobile plan, `develop` base SHA, feature HEAD SHA, and these explicit review questions:

  ```text
  Verify session/storage race safety, trust-boundary validation, feature ownership,
  accessibility, React Compiler compatibility, pagination correctness, package removal,
  test quality, and absence of LegendList/FSD/manual memoization.
  ```

- [ ] Process every finding with `superpowers:receiving-code-review`: reproduce it, decide from code evidence, add or adjust the failing test first, make the minimum root-cause fix, and re-run the affected gate. Do not apply a suggestion merely because it sounds cleaner.

- [ ] Request one follow-up review on the fixed HEAD. Continue until there are no open P0/P1 findings and every accepted P2 finding is resolved or documented with concrete evidence that it is invalid/out of scope.

- [ ] Push the reviewed feature branch and create the PR:

  ```bash
  git push -u origin feat/mobile-quality-hardening
  gh pr create --base develop --head feat/mobile-quality-hardening --title "fix(mobile): harden session storage and feature boundaries" --body-file /tmp/shopport-fe-pr-body.md
  ```

  The body file must contain the approved scope, behavioral changes, exact verification commands/results, coverage before/after, removed direct packages, and the independent review result. It must not contain secrets or generated chat prose.

- [ ] Wait for the PR checks, inspect failures with `gh pr checks --watch`, and use `superpowers:systematic-debugging` for any unexpected failure before changing code.

- [ ] Squash merge only after all required checks are green. Capture the reviewed head first, then verify the merged PR still identifies that exact head before deleting any surviving local branch:

  ```bash
  mobile_pr_url=$(gh pr view --json url --jq .url)
  mobile_reviewed_head=$(git rev-parse HEAD)
  gh pr merge "$mobile_pr_url" --squash --delete-branch
  git switch develop
  git pull --ff-only origin develop
  test "$(gh pr view "$mobile_pr_url" --json state --jq .state)" = "MERGED"
  test "$mobile_reviewed_head" = "$(gh pr view "$mobile_pr_url" --json headRefOid --jq .headRefOid)"
  if git show-ref --verify --quiet refs/heads/feat/mobile-quality-hardening; then
    git branch -D feat/mobile-quality-hardening
  fi
  git status --short --branch
  ```

- [ ] Record the merged FE SHA for the root BOM:

  ```bash
  git rev-parse HEAD
  ```

## Task 2: Review and Deliver the Backend Repository

**Files:**

- Review: every path changed from `shopport-be/develop`
- Verify: backend source/tests, migration 0009, migration metadata, coverage configuration, and lockfile
- Deliver: branch `feat/backend-quality-hardening` to `develop`

- [ ] Re-run the backend plans' complete gate in a clean process:

  ```bash
  cd /Volumes/Untitled/Documents/Github/shopport-app/shopport-be
  git status --short --branch
  pnpm check
  pnpm test:coverage
  pnpm test:integration
  pnpm build
  pnpm check:schema
  ```

- [ ] Invoke `superpowers:requesting-code-review` with the approved design, both backend plans, `develop` base SHA, feature HEAD SHA, and these explicit review questions:

  ```text
  Verify auth/JWT error semantics, refresh lineage locking, AI lease ownership,
  cursor/offset bounds, migration data preservation, FK/index correctness,
  singleton maintenance locks, outbox durability, object cleanup races,
  tenant-safe asset resolution, provider boundaries, diagnostics, and test quality.
  ```

- [ ] Process findings with `superpowers:receiving-code-review` using a failing regression test and root-cause fix. Run the populated migration test again after any schema or SQL change.

- [ ] Request a follow-up review on the fixed HEAD and require the same P0/P1/P2 closure standard as mobile.

- [ ] Push the reviewed feature branch and create the PR:

  ```bash
  git push -u origin feat/backend-quality-hardening
  gh pr create --base develop --head feat/backend-quality-hardening --title "fix(backend): harden auth AI and data durability" --body-file /tmp/shopport-be-pr-body.md
  ```

  The body file must include migration behavior, concurrency invariants, exact gate results, coverage before/after, dependency result, and independent review result.

- [ ] Watch checks, diagnose any unexpected failure systematically, and squash merge only when green. Verify the reviewed PR head before removing a surviving local branch:

  ```bash
  gh pr checks --watch
  backend_pr_url=$(gh pr view --json url --jq .url)
  backend_reviewed_head=$(git rev-parse HEAD)
  gh pr merge "$backend_pr_url" --squash --delete-branch
  git switch develop
  git pull --ff-only origin develop
  test "$(gh pr view "$backend_pr_url" --json state --jq .state)" = "MERGED"
  test "$backend_reviewed_head" = "$(gh pr view "$backend_pr_url" --json headRefOid --jq .headRefOid)"
  if git show-ref --verify --quiet refs/heads/feat/backend-quality-hardening; then
    git branch -D feat/backend-quality-hardening
  fi
  git status --short --branch
  ```

- [ ] Record the merged BE SHA for the root BOM:

  ```bash
  git rev-parse HEAD
  ```

## Task 3: Enforce Core Quality Gates in Root CI

**Files:**

- Modify: `.github/workflows/ci.yml`
- Test: `.github/workflows/ci.yml`

- [ ] Prove the current compatibility job does not enforce child quality gates:

  ```bash
  cd /Volumes/Untitled/Documents/Github/shopport-app
  rg -n 'test:coverage|pnpm --dir shopport-fe check|pnpm --dir shopport-be check|check:schema' .github/workflows/ci.yml
  ```

  Expected before the edit: the command exits non-zero or reports missing commands.

- [ ] Keep checkout, pinned Node/pnpm setup, frozen installs, submodule check, GraphQL contract check, and codegen diff. Add these steps to `compatibility` after installation:

  ```yaml
  - run: ./scripts/check-submodules.sh
  - run: node ./scripts/check-graphql-contract.mjs
  - run: pnpm --dir shopport-fe check
  - run: pnpm --dir shopport-fe test:coverage
  - run: pnpm --dir shopport-fe codegen && git -C shopport-fe diff --exit-code
  - run: pnpm --dir shopport-fe doctor
  - run: pnpm --dir shopport-fe build
  - run: pnpm --dir shopport-be check
  - run: pnpm --dir shopport-be test:coverage
  - run: pnpm --dir shopport-be build
  - run: pnpm --dir shopport-be check:schema
  ```

- [ ] Keep `integration-e2e` as the existing backend `pnpm --dir shopport-be test:integration` Testcontainers job. Rename the job display name only if needed for clarity; do not add cloud credentials or a fake device E2E command.

- [ ] Keep the existing least-privilege workflow permissions and gitleaks job unchanged.

- [ ] Validate the edited file with the available Ruby YAML parser after temporarily replacing GitHub expression scalars in memory, then inspect the workflow diff. Do not add an action-lint dependency solely for this change:

  ```bash
  ruby -e 'require "yaml"; text = File.read(".github/workflows/ci.yml").gsub(/\$\{\{[^}]+\}\}/, "expression"); YAML.safe_load(text, aliases: true); puts "valid yaml"'
  git diff --check -- .github/workflows/ci.yml
  git diff -- .github/workflows/ci.yml
  ```

- [ ] Commit the CI gate:

  ```bash
  git add .github/workflows/ci.yml
  git commit -m "ci(quality): enforce full-stack core gates"
  ```

## Task 4: Make Local Gates Match CI

**Files:**

- Modify: `Makefile`
- Test: `Makefile`

- [ ] Prove `make check` currently runs only the root submodule and contract checks:

  ```bash
  make -n check
  ```

- [ ] Expand the existing targets without adding a shell script or task runner:

  ```make
  .PHONY: check contract dev dev-core down e2e release-check

  check:
  ./scripts/check-submodules.sh
  node ./scripts/check-graphql-contract.mjs
  pnpm --dir shopport-fe check
  pnpm --dir shopport-fe test:coverage
  pnpm --dir shopport-fe codegen
  git -C shopport-fe diff --exit-code
  pnpm --dir shopport-be check
  pnpm --dir shopport-be test:coverage
  pnpm --dir shopport-be build
  pnpm --dir shopport-be check:schema

  release-check: check
  pnpm --dir shopport-fe doctor
  pnpm --dir shopport-fe build
  pnpm --dir shopport-be test:integration
  ```

  Leave `contract`, `dev`, `dev-core`, `down`, and `e2e` behavior unchanged. Tabs in recipe lines are required.

- [ ] Confirm the expanded command graph before running it:

  ```bash
  make -n check
  make -n release-check
  git diff --check -- Makefile
  ```

- [ ] Run the local core gate:

  ```bash
  make check
  ```

- [ ] Commit the Make target:

  ```bash
  git add Makefile
  git commit -m "build(quality): align local and CI gates"
  ```

## Task 5: Correct the Release-Gate Contract

**Files:**

- Modify: `docs/release-gates.md`
- Test: `docs/release-gates.md`

- [ ] Replace the current claim that decorative infrastructure checks are mandatory with three explicit sections:

  ```text
  1. Mandatory core-app automated gates
  2. Manual mobile/product checks required before store release
  3. Cloud/showcase and external-input checks deferred until real infrastructure exists
  ```

- [ ] Under mandatory automated gates, name the exact commands enforced by CI: FE `check`, `test:coverage`, codegen diff, Doctor, export; BE `check`, `test:coverage`, integration, build, schema compatibility; root submodule/GraphQL checks; gitleaks.

- [ ] Keep actual device accessibility, Kakao/provider credentials, production load, restore, observability, and store metadata as external release evidence. Mark Terraform/AWS/Argo/IAM/Ingress/ECR validation as showcase/deferred, not as proof of core application quality.

- [ ] Confirm the document no longer presents cloud checks as a passing current gate:

  ```bash
  rg -n '필수 코어 앱|수동 출시|쇼케이스|Terraform|AWS|Argo|IAM|Ingress|ECR' docs/release-gates.md
  git diff --check -- docs/release-gates.md
  ```

- [ ] Commit the documentation correction:

  ```bash
  git add docs/release-gates.md
  git commit -m "docs(quality): separate core and showcase gates"
  ```

## Task 6: Pin the Merged Child Repository SHAs

**Files:**

- Modify: `shopport-fe` gitlink
- Modify: `shopport-be` gitlink
- Verify: `shopport-infra` gitlink remains unchanged

- [ ] Fetch and fast-forward each child `develop`; assert clean state and record the commits:

  ```bash
  git -C shopport-fe switch develop
  git -C shopport-fe pull --ff-only origin develop
  git -C shopport-fe status --porcelain
  git -C shopport-fe rev-parse HEAD
  git -C shopport-be switch develop
  git -C shopport-be pull --ff-only origin develop
  git -C shopport-be status --porcelain
  git -C shopport-be rev-parse HEAD
  ```

  Both status commands must print nothing.

- [ ] Verify both SHAs belong to their remote `develop` and neither child is detached:

  ```bash
  git -C shopport-fe merge-base --is-ancestor HEAD origin/develop
  test "$(git -C shopport-fe branch --show-current)" = "develop"
  git -C shopport-be merge-base --is-ancestor HEAD origin/develop
  test "$(git -C shopport-be branch --show-current)" = "develop"
  ```

- [ ] Stage only the two child gitlinks and inspect the pointer diff:

  ```bash
  cd /Volumes/Untitled/Documents/Github/shopport-app
  git add shopport-fe shopport-be
  git diff --cached --submodule=short -- shopport-fe shopport-be
  git diff --cached --name-only
  ```

  Expected staged paths are exactly `shopport-fe` and `shopport-be`. `shopport-infra` must remain at `7b342b47c1941300ddfd101b4ba83eb72df87843` unless the repository itself proves a newer user-authored pointer was already staged.

- [ ] Commit the BOM update:

  ```bash
  git commit -m "chore(submodules): pin quality hardening releases"
  ```

## Task 7: Run Independent Root Review and Final Verification

**Files:**

- Review: root diff from `origin/develop`
- Verify: all root and child paths in scope

- [ ] Invoke `superpowers:requesting-code-review` on the root diff. Ask the reviewer to verify command parity between CI/Make/docs, correct child SHAs, unchanged infra pointer, absence of secret/cloud mutations, and truthful release claims.

- [ ] Apply valid findings with `superpowers:receiving-code-review`, using the smallest failing command that demonstrates each defect. Request a follow-up review after fixes.

- [ ] Invoke `superpowers:verification-before-completion` and run fresh commands in this exact order:

  ```bash
  cd /Volumes/Untitled/Documents/Github/shopport-app
  ./scripts/check-submodules.sh
  node ./scripts/check-graphql-contract.mjs
  pnpm --dir shopport-fe check
  pnpm --dir shopport-fe test:coverage
  pnpm --dir shopport-fe codegen
  git -C shopport-fe diff --exit-code
  pnpm --dir shopport-fe doctor
  pnpm --dir shopport-fe build
  pnpm --dir shopport-be check
  pnpm --dir shopport-be test:coverage
  pnpm --dir shopport-be test:integration
  pnpm --dir shopport-be build
  pnpm --dir shopport-be check:schema
  make check
  git diff --check origin/develop
  git status --short --branch
  ```

- [ ] Confirm root scope before delivery:

  ```bash
  git diff --name-only origin/develop
  git diff --submodule=short origin/develop -- shopport-fe shopport-be shopport-infra
  git log --oneline origin/develop..HEAD
  ```

  Expected product pointers: FE and BE only. Expected root files: approved design/plans, CI, Makefile, release-gates document. No infra content change.

## Task 8: Deliver Root and Remove Only Merged Feature Branches

**Files:**

- Deliver: `chore/full-stack-quality-hardening` to root `develop`
- Clean: only merged branches created by these plans

- [ ] Invoke `superpowers:finishing-a-development-branch` and choose the already-authorized push/PR/squash-merge path.

- [ ] Push and create the root PR:

  ```bash
  git push -u origin chore/full-stack-quality-hardening
  gh pr create --base develop --head chore/full-stack-quality-hardening --title "chore(quality): enforce full-stack hardening gates" --body-file /tmp/shopport-root-pr-body.md
  gh pr checks --watch
  ```

  The PR body must link both merged child PRs, list their merged SHAs, enumerate root gates, state that cloud/showcase infrastructure is excluded, and include the independent review and fresh verification results.

- [ ] Capture the reviewed root head, squash merge, prove the PR merged that exact head, and only then remove a surviving local feature ref:

  ```bash
  root_pr_url=$(gh pr view --json url --jq .url)
  root_reviewed_head=$(git rev-parse HEAD)
  gh pr merge "$root_pr_url" --squash --delete-branch
  git fetch --prune origin
  test "$(gh pr view "$root_pr_url" --json state --jq .state)" = "MERGED"
  test "$root_reviewed_head" = "$(gh pr view "$root_pr_url" --json headRefOid --jq .headRefOid)"
  git status --porcelain
  git switch develop
  git pull --ff-only origin develop
  if git show-ref --verify --quiet refs/heads/chore/full-stack-quality-hardening; then
    git branch -D chore/full-stack-quality-hardening
  fi
  ```

  `git status --porcelain` must print nothing before switching. Never use `git reset --hard`.

- [ ] Audit remaining local and remote branches without deleting by name pattern:

  ```bash
  git branch -vv
  git branch -r --merged origin/develop
  git -C shopport-fe branch -vv
  git -C shopport-fe branch -r --merged origin/develop
  git -C shopport-be branch -vv
  git -C shopport-be branch -r --merged origin/develop
  ```

- [ ] Delete only a plan-created remote branch that still exists after the exact-head merge checks above:

  ```bash
  if git ls-remote --exit-code --heads origin chore/full-stack-quality-hardening >/dev/null; then
    git push origin --delete chore/full-stack-quality-hardening
  fi
  if git -C shopport-fe ls-remote --exit-code --heads origin feat/mobile-quality-hardening >/dev/null; then
    git -C shopport-fe push origin --delete feat/mobile-quality-hardening
  fi
  if git -C shopport-be ls-remote --exit-code --heads origin feat/backend-quality-hardening >/dev/null; then
    git -C shopport-be push origin --delete feat/backend-quality-hardening
  fi
  ```

  Do not delete any other branch.

## Completion Evidence

Record these exact artifacts in the final handoff:

- FE PR URL, squash commit SHA, coverage summary, full check/export result, and deleted feature branch status.
- BE PR URL, squash commit SHA, populated-migration result, coverage/integration/build/schema result, and deleted feature branch status.
- Root PR URL, squash commit SHA, CI job results, independent review disposition, and exact FE/BE gitlink SHAs.
- `shopport-infra` pointer and content unchanged.
- No remaining plan-created feature branch unless deletion was safely skipped with the specific unmerged/divergence evidence.
- No claim that AWS/Terraform/Argo/IAM/Ingress/ECR or unavailable real-device/provider checks were executed.
