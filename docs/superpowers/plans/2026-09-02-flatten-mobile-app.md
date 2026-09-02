# Shopport Mobile Single-Package Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `shopport-fe` a single Expo package rooted at the repository root, with no `apps/`, `packages/`, or internal workspace dependencies.

**Architecture:** Move the existing Expo app to `shopport-fe/`, then inline the mobile-only UI, token, and TypeScript configuration packages into `src/shared/components`, `src/theme`, and the root configuration. Update automation and the parent integration repository only after the standalone frontend passes its existing checks.

**Tech Stack:** Expo SDK 57, React Native 0.86, TypeScript 6, pnpm 11, Jest, GraphQL Code Generator, EAS Workflows, Maestro

**Spec:** `docs/superpowers/specs/2026-09-02-flatten-mobile-app-design.md`

## Global Constraints

- Preserve application behavior, GraphQL schema, generated operation contents, deployment policy, and dependency versions.
- Keep the root package name `shopport-fe` and keep `pnpm-workspace.yaml` only for pnpm policy settings.
- Add no dependency and no new abstraction.
- Keep historical GitHub links pinned to old commit SHAs unchanged.
- Preserve ignored local `ios/` and `android/` directories by moving them to the new app root; keep the root `.env` untouched and move reproducible old-path artifacts to a recoverable temporary backup.
- Commit frontend changes inside the `shopport-fe` repository before updating its pointer in the parent repository.
- Follow the existing arrow-function and no-code-comment rules.

---

### Task 1: Move the Expo application to the frontend repository root

**Files:**
- Move: `shopport-fe/apps/mobile/src/` → `shopport-fe/src/`
- Move: `shopport-fe/apps/mobile/e2e/` → `shopport-fe/e2e/`
- Move: `shopport-fe/apps/mobile/.eas/` → `shopport-fe/.eas/`
- Move: `shopport-fe/apps/mobile/{app.config.ts,babel.config.js,codegen.ts,eas.json,eslint.config.mjs,index.js,jest.config.js,metro.config.js,prettier.config.mjs,schema.graphql}` → `shopport-fe/`
- Move: `shopport-fe/apps/mobile/scripts/{sanitize-codegen.mjs,with-env.mjs}` → `shopport-fe/scripts/`
- Modify: `shopport-fe/package.json`
- Modify: `shopport-fe/tsconfig.json`
- Modify: `shopport-fe/pnpm-workspace.yaml`
- Modify: `shopport-fe/.gitignore`
- Modify: `shopport-fe/.prettierignore`
- Modify: `shopport-fe/scripts/with-env.mjs`
- Modify: `shopport-fe/.eas/workflows/pull-request.yml`
- Modify: `shopport-fe/.github/workflows/ci.yml`
- Modify: `shopport-fe/security/audit-policy.json`
- Modify: `shopport-fe/scripts/audit-policy.test.mjs`
- Modify: `shopport-fe/scripts/fixtures/{audit-critical.json,audit-known.json,audit-metadata-mismatch.json,audit-unknown-high.json}`
- Delete: `shopport-fe/apps/mobile/package.json`
- Delete: `shopport-fe/apps/mobile/tsconfig.json`
- Delete: `shopport-fe/apps/mobile/.gitignore`
- Delete: `shopport-fe/apps/mobile/.prettierignore`
- Modify: `shopport-fe/pnpm-lock.yaml`

**Interfaces:**
- Consumes: existing `@shopport/tokens`, `@shopport/ui`, and `@shopport/typescript-config` workspace packages unchanged for this task.
- Produces: an Expo package whose working directory and package root are both `shopport-fe/`; later tasks can import the internal workspace packages before removing them.

- [ ] **Step 1: Verify the current frontend baseline**

Run:

```bash
pnpm --dir shopport-fe check
pnpm --dir shopport-fe test
```

Expected: both commands exit 0 before any path changes.

- [ ] **Step 2: Create the frontend refactor branch**

Run:

```bash
git -C shopport-fe switch -c refactor/flatten-mobile-app
```

Expected: `git -C shopport-fe branch --show-current` prints `refactor/flatten-mobile-app`.

- [ ] **Step 3: Preserve ignored native projects and move tracked app files**

First check that the new native targets do not already exist:

```bash
test ! -e shopport-fe/ios
test ! -e shopport-fe/android
```

If `shopport-fe/apps/mobile/ios` or `shopport-fe/apps/mobile/android` exists, move it to the frontend root. This preserves the Android debug keystore and local native project state. Preserve remembered Expo device selection separately and leave `shopport-fe/.env` in place:

```bash
for native_dir_name in ios android; do
  native_source="shopport-fe/apps/mobile/$native_dir_name"
  native_target="shopport-fe/$native_dir_name"
  if test -d "$native_source"; then
    test ! -e "$native_target"
    mv "$native_source" "$native_target"
  fi
done
if test -f shopport-fe/apps/mobile/.expo/devices.json; then
  mkdir -p shopport-fe/.expo
  mv shopport-fe/apps/mobile/.expo/devices.json shopport-fe/.expo/devices.json
fi
```

Then move tracked files:

```bash
git -C shopport-fe mv apps/mobile/src src
git -C shopport-fe mv apps/mobile/e2e e2e
git -C shopport-fe mv apps/mobile/.eas .eas
git -C shopport-fe mv apps/mobile/app.config.ts app.config.ts
git -C shopport-fe mv apps/mobile/babel.config.js babel.config.js
git -C shopport-fe mv apps/mobile/codegen.ts codegen.ts
git -C shopport-fe mv apps/mobile/eas.json eas.json
git -C shopport-fe mv apps/mobile/eslint.config.mjs eslint.config.mjs
git -C shopport-fe mv apps/mobile/index.js index.js
git -C shopport-fe mv apps/mobile/jest.config.js jest.config.js
git -C shopport-fe mv apps/mobile/metro.config.js metro.config.js
git -C shopport-fe mv apps/mobile/prettier.config.mjs prettier.config.mjs
git -C shopport-fe mv apps/mobile/schema.graphql schema.graphql
git -C shopport-fe mv apps/mobile/scripts/sanitize-codegen.mjs scripts/sanitize-codegen.mjs
git -C shopport-fe mv apps/mobile/scripts/with-env.mjs scripts/with-env.mjs
```

Expected: `shopport-fe/src/app/_layout.tsx`, `shopport-fe/e2e/agent-control.yaml`, and `shopport-fe/app.config.ts` exist.

- [ ] **Step 4: Merge the mobile package into the root package**

Keep the root metadata (`name: shopport-fe`, version, private, package manager, engines), copy `main: index.js`, and copy the existing mobile dependencies and devDependencies. The final merge has 37 runtime dependencies and 20 devDependencies after Task 2 removes the three internal workspace entries. Use this exact script block:

```json
{
  "scripts": {
    "build": "pnpm run export",
    "check": "pnpm format:check && pnpm lint && pnpm typecheck",
    "codegen": "graphql-codegen --config codegen.ts",
    "doctor": "node scripts/with-env.mjs expo-doctor",
    "export": "node scripts/with-env.mjs expo export --platform ios --output-dir dist/ios && node scripts/with-env.mjs expo export --platform android --output-dir dist/android",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "ios": "node scripts/with-env.mjs expo run:ios",
    "lint": "eslint . --max-warnings=0",
    "start": "node scripts/with-env.mjs expo start --dev-client",
    "test": "jest --runInBand && node --test scripts/audit-policy.test.mjs",
    "test:coverage": "jest --runInBand --coverage && node --test scripts/audit-policy.test.mjs",
    "test:integration": "jest --runInBand --testPathPatterns=integration",
    "test:unit": "jest --runInBand --testPathPatterns=unit",
    "typecheck": "tsc --noEmit"
  }
}
```

Keep `@shopport/tokens`, `@shopport/ui`, and `@shopport/typescript-config` temporarily. Remove `apps/mobile/package.json` only after its dependency lists are present at the root.

```bash
git -C shopport-fe rm apps/mobile/package.json
```

- [ ] **Step 5: Point root TypeScript and pnpm configuration at the moved app**

Replace the root project-reference `tsconfig.json` with:

```json
{
  "extends": "@shopport/typescript-config/react-native.json",
  "compilerOptions": {
    "paths": {
      "@/*": ["./src/*"]
    },
    "types": ["jest", "node", "react-native"]
  },
  "include": [
    "src",
    "app.config.ts",
    "codegen.ts",
    ".expo/types/**/*.ts",
    "expo-env.d.ts"
  ]
}
```

Change the workspace package list to only the packages still present during this task:

```yaml
packages:
  - packages/*
```

Keep every existing `allowBuilds`, `minimumReleaseAgeExclude`, and `packageExtensions` entry unchanged.

```bash
git -C shopport-fe rm apps/mobile/tsconfig.json
```

- [ ] **Step 6: Merge root ignore rules and update environment loading**

Replace the old native ignore paths in `shopport-fe/.gitignore`:

```gitignore
ios/
android/
```

Merge the mobile Prettier exclusions into `shopport-fe/.prettierignore` while retaining `DESIGN.md`:

```gitignore
DESIGN.md
.expo
dist
ios
android
coverage
```

Delete the two obsolete ignore files under `apps/mobile`. In `scripts/with-env.mjs`, change only the `.env` URL from `../../../.env` to `../.env` because the script now lives one directory below the package root.

```bash
git -C shopport-fe rm apps/mobile/.gitignore apps/mobile/.prettierignore
```

- [ ] **Step 7: Update frontend automation for the new root**

In `.eas/workflows/pull-request.yml`, remove the validation step's `working_directory: ../..` override so the command runs at the new app/repository root. In `.github/workflows/ci.yml`, replace:

```yaml
- run: pnpm --filter @shopport/mobile exec expo install --check
```

with:

```yaml
- run: pnpm exec expo install --check
```

No other EAS job, build profile, or CI gate changes.

- [ ] **Step 8: Update audit importer paths, regenerate the lockfile, and verify the rooted app**

Before running the audit tests, update their pnpm importer paths. In `security/audit-policy.json`, replace both path patterns with:

```json
"pathPattern": "^\\.>.*>metro>image-size$"
```

In `scripts/audit-policy.test.mjs`, replace `apps__mobile>image-size` with `.>image-size`. In the four listed fixture JSON files, replace every `apps__mobile>dependency>metro>image-size` with `.>dependency>metro>image-size`. Do not change advisory IDs, versions, expiry, or policy behavior.

Run:

```bash
pnpm --dir shopport-fe install
pod install --project-directory=shopport-fe/ios
pnpm --dir shopport-fe typecheck
pnpm --dir shopport-fe lint
pnpm --dir shopport-fe test
pnpm --dir shopport-fe codegen
pnpm --dir shopport-fe run doctor
```

Expected: all commands exit 0; `pnpm-lock.yaml` has a root importer and no `apps/mobile` importer. `pod install` regenerates iOS Pods metadata that otherwise retains absolute references to the old app path. Generated GraphQL file content is unchanged except for rename detection. If no local `ios/` directory exists, skip only the `pod install` command. The full formatting gate runs after Task 3 updates the README because moving the Prettier config intentionally expands its scope to the repository root.

- [ ] **Step 9: Commit the rooted Expo app**

Run:

```bash
git -C shopport-fe add .
git -C shopport-fe diff --cached --check
git -C shopport-fe commit -m "refactor(app): move expo app to repository root"
```

Expected: one frontend commit containing the path move, package merge, automation adjustments, and lockfile update.

---

### Task 2: Inline the mobile-only workspace packages

**Files:**
- Move: `shopport-fe/packages/ui/src/{empty-state.tsx,screen.tsx,section-title.tsx}` → `shopport-fe/src/shared/components/`
- Move: `shopport-fe/src/shared/ui/glass-button.tsx` → `shopport-fe/src/shared/components/glass-button.tsx`
- Create: `shopport-fe/src/shared/components/index.ts`
- Modify: `shopport-fe/src/theme/unistyles.ts`
- Modify: all source and test imports of `@shopport/ui` and `@/shared/ui/glass-button`
- Modify: `shopport-fe/package.json`
- Modify: `shopport-fe/tsconfig.json`
- Modify: `shopport-fe/pnpm-workspace.yaml`
- Delete: `shopport-fe/packages/`
- Modify: `shopport-fe/pnpm-lock.yaml`

**Interfaces:**
- Consumes: the rooted Expo package and the existing exports `EmptyState`, `Screen`, `SectionTitle`, `GlassActionButton`, `GlassButton`, and `glassButtonIconSize`.
- Produces: `@/shared/components` for common UI and `src/theme/unistyles.ts` as the only theme/token registration module.

- [ ] **Step 1: Record the internal-package references that must disappear**

Run:

```bash
rg -n '@shopport/(tokens|ui|typescript-config)|@/shared/ui/glass-button' shopport-fe --glob '!pnpm-lock.yaml'
```

Expected: matches are limited to package/config declarations, `src/theme/unistyles.ts`, common UI consumers, and their Jest mocks.

- [ ] **Step 2: Move common UI into the application source**

Run:

```bash
mkdir -p shopport-fe/src/shared/components
git -C shopport-fe mv packages/ui/src/empty-state.tsx src/shared/components/empty-state.tsx
git -C shopport-fe mv packages/ui/src/screen.tsx src/shared/components/screen.tsx
git -C shopport-fe mv packages/ui/src/section-title.tsx src/shared/components/section-title.tsx
git -C shopport-fe mv src/shared/ui/glass-button.tsx src/shared/components/glass-button.tsx
```

Create `src/shared/components/index.ts` with exactly these exports:

```ts
export { EmptyState } from './empty-state';
export {
  GlassActionButton,
  GlassButton,
  glassButtonIconSize,
} from './glass-button';
export { Screen } from './screen';
export { SectionTitle } from './section-title';
```

- [ ] **Step 3: Replace common UI imports and mocks**

Change each `@shopport/ui` import or Jest mock and each `@/shared/ui/glass-button` import or mock to `@/shared/components`. When a production file imported both old modules, merge the specifiers into one import. In `src/screens/auth/auth-screen.unit.spec.tsx` and `src/screens/profile/settings-screen.unit.spec.tsx`, merge the two old Jest factories into one `jest.mock('@/shared/components', ...)` factory so the later mock does not replace `Screen` or `SectionTitle`.

Verify:

```bash
rg -n '@shopport/ui|@/shared/ui' shopport-fe/src
```

Expected: no output.

- [ ] **Step 4: Merge tokens and Unistyles type registration**

Move the unchanged `colors`, `spacing`, `interaction`, `radii`, `typography`, `layout`, `themes`, and `breakpoints` declarations from `packages/tokens/src/index.ts` into `src/theme/unistyles.ts` above `StyleSheet.configure`. Move the type augmentation from `packages/ui/src/index.ts` into the same file:

```ts
type ShopportThemes = typeof themes;
type ShopportBreakpoints = typeof breakpoints;

declare module 'react-native-unistyles' {
  export interface UnistylesThemes extends ShopportThemes {}
  export interface UnistylesBreakpoints extends ShopportBreakpoints {}
}

StyleSheet.configure({
  breakpoints,
  themes,
  settings: { adaptiveThemes: true },
});
```

Remove the `@shopport/tokens` import. Do not change token values or Unistyles settings.

- [ ] **Step 5: Inline the TypeScript configuration**

Replace `tsconfig.json` with the merged compiler settings:

```json
{
  "$schema": "https://json.schemastore.org/tsconfig",
  "compilerOptions": {
    "allowJs": false,
    "allowSyntheticDefaultImports": true,
    "customConditions": ["react-native"],
    "esModuleInterop": true,
    "exactOptionalPropertyTypes": true,
    "forceConsistentCasingInFileNames": true,
    "isolatedModules": true,
    "jsx": "react-jsx",
    "lib": ["ES2024", "DOM"],
    "module": "preserve",
    "moduleDetection": "force",
    "moduleResolution": "bundler",
    "noEmit": true,
    "noFallthroughCasesInSwitch": true,
    "noImplicitOverride": true,
    "noUncheckedIndexedAccess": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "paths": {
      "@/*": ["./src/*"]
    },
    "resolveJsonModule": true,
    "skipLibCheck": true,
    "strict": true,
    "target": "ES2024",
    "types": ["jest", "node", "react-native"]
  },
  "include": [
    "src",
    "app.config.ts",
    "codegen.ts",
    ".expo/types/**/*.ts",
    "expo-env.d.ts"
  ]
}
```

- [ ] **Step 6: Remove workspace package metadata**

Delete these dependency entries from root `package.json`:

```text
@shopport/tokens
@shopport/ui
@shopport/typescript-config
```

Before deleting tracked package contents, move their reproducible ignored residue to a task-specific backup:

```bash
package_backup_dir="$(mktemp -d)"
mkdir -p "$package_backup_dir/ui" "$package_backup_dir/tokens"
for package_name in ui tokens; do
  for artifact_name in node_modules tsconfig.tsbuildinfo; do
    artifact_path="shopport-fe/packages/$package_name/$artifact_name"
    if test -e "$artifact_path" || test -L "$artifact_path"; then
      mv "$artifact_path" "$package_backup_dir/$package_name/"
    fi
  done
done
git -C shopport-fe rm -r packages
```

Report `$package_backup_dir` at handoff. Remove only the `packages:` block from `pnpm-workspace.yaml`; keep all pnpm policy keys unchanged.

- [ ] **Step 7: Regenerate dependencies and run focused checks**

Run:

```bash
pnpm --dir shopport-fe install
pnpm --dir shopport-fe typecheck
pnpm --dir shopport-fe test:unit
test ! -d shopport-fe/packages
test ! -d shopport-fe/apps
! rg -n '@shopport/(tokens|ui|typescript-config)|workspace:\*' shopport-fe/package.json shopport-fe/tsconfig.json shopport-fe/src shopport-fe/pnpm-lock.yaml
```

Expected: all commands exit 0 and the final search produces no matches.

- [ ] **Step 8: Commit package removal**

Run:

```bash
git -C shopport-fe add .
git -C shopport-fe diff --cached --check
git -C shopport-fe commit -m "refactor(app): inline mobile-only packages"
```

Expected: one frontend commit deleting all internal workspace packages while preserving their runtime exports.

---

### Task 3: Update frontend documentation and retire old generated paths

**Files:**
- Modify: `shopport-fe/README.md`
- Modify: `shopport-fe/e2e/README.md` only if its working-directory wording still refers to the old app root
- Move locally: reproducible ignored artifacts remaining under `shopport-fe/apps/mobile/` to a temporary backup outside the repository

**Interfaces:**
- Consumes: the final single-package paths from Tasks 1 and 2.
- Produces: standalone frontend instructions that use only root commands and current source paths.

- [ ] **Step 1: Rewrite current structure references in the frontend README**

Use these current paths in the structure table:

```markdown
| 경로 | 역할 |
| --- | --- |
| `src/app` | Expo Router route |
| `src/features` | auth, chat, catalog, favorites, profile 도메인 |
| `src/shared` | storage, observability, config, 공통 UI |
| `src/theme` | Unistyles theme과 design token |
| `schema.graphql` | backend canonical schema의 pinned snapshot |
```

Remove `cd apps/mobile`, workspace-package wording, the nonexistent `history` feature entry, and all `apps/mobile` paths. State that Maestro flows live in `e2e/`.

- [ ] **Step 2: Verify documentation and active frontend references**

Format the updated frontend README, then run the newly root-scoped check:

```bash
pnpm --dir shopport-fe exec prettier --write README.md
pnpm --dir shopport-fe check
```

Run:

```bash
rg -n 'apps/mobile|packages/(tokens|ui|typescript-config)|@shopport/(mobile|tokens|ui|typescript-config)' \
  shopport-fe/README.md shopport-fe/DESIGN.md shopport-fe/e2e shopport-fe/.github shopport-fe/.eas shopport-fe/src shopport-fe/package.json shopport-fe/tsconfig.json
```

Expected: no output.

- [ ] **Step 3: Inspect and move only reproducible old-path artifacts out of the repository**

Inspect first:

```bash
find shopport-fe/apps/mobile -maxdepth 2 -mindepth 1 -print 2>/dev/null
```

After native directories and `.expo/devices.json` have been preserved at the root, create a recoverable backup and move only old `.expo`, `dist`, `coverage`, `node_modules`, `*.log`, `*.tsbuildinfo`, and `expo-env.d.ts` artifacts into it:

```bash
artifact_backup_dir="$(mktemp -d)"
for artifact_name in .expo dist coverage node_modules error.log tsconfig.tsbuildinfo expo-env.d.ts; do
  artifact_path="shopport-fe/apps/mobile/$artifact_name"
  if test -e "$artifact_path" || test -L "$artifact_path"; then
    mv "$artifact_path" "$artifact_backup_dir/"
  fi
done
find shopport-fe/apps/mobile -depth -type d -empty -exec rmdir {} \; 2>/dev/null || true
rmdir shopport-fe/apps
```

Report `$artifact_backup_dir` at handoff so it can be recovered until the temporary directory is retired.

Expected: `test ! -e shopport-fe/apps` exits 0. Do not remove any unexpected file; stop and inspect it.

- [ ] **Step 4: Commit documentation changes**

Run:

```bash
git -C shopport-fe add README.md e2e/README.md
git -C shopport-fe diff --cached --check
git -C shopport-fe commit -m "docs(app): document single-package layout"
```

If `e2e/README.md` required no content change, omit it from `git add`.

---

### Task 4: Update parent-repository integration paths

**Files:**
- Modify: `scripts/check-graphql-contract.mjs`
- Modify: `scripts/run-maestro-android.sh`
- Modify: any current, non-historical root documentation reference found by the task scan
- Modify: gitlink `shopport-fe`

**Interfaces:**
- Consumes: frontend `schema.graphql`, `src/graphql`, and `e2e` at the `shopport-fe` root.
- Produces: parent scripts that continue exposing `make contract`, root CI GraphQL validation, and Android Maestro execution.

- [ ] **Step 1: Update GraphQL contract paths**

Apply these exact replacements in `scripts/check-graphql-contract.mjs`:

```text
shopport-fe/apps/mobile/schema.graphql
→ shopport-fe/schema.graphql

shopport-fe/apps/mobile/src/graphql/
→ shopport-fe/src/graphql/

shopport-fe/apps/mobile/src/graphql/generated/persisted-documents.json
→ shopport-fe/src/graphql/generated/persisted-documents.json
```

Update the error message to instruct copying the backend schema to `shopport-fe/schema.graphql`.

- [ ] **Step 2: Update the Maestro runner**

Replace the app build command with:

```bash
pnpm --dir shopport-fe exec expo run:android --variant release --no-bundler
```

Use these flow paths:

```text
shopport-fe/e2e/quick-action-composer.yaml
shopport-fe/e2e/drawer-gesture.yaml
shopport-fe/e2e/agent-control.yaml
```

Keep artifact capture and exit-status handling unchanged.

- [ ] **Step 3: Scan parent current references without rewriting historical evidence**

Run:

```bash
rg -n 'shopport-fe/apps/mobile|@shopport/mobile' README.md Makefile scripts docs .github \
  --glob '!docs/application/**'
```

Expected: no output after updating any active reference. Leave `docs/application` links pinned to old frontend commit SHAs unchanged.

- [ ] **Step 4: Verify the parent contract and inspect the submodule update**

Run:

```bash
make contract
git diff --submodule=log -- shopport-fe scripts README.md docs .github
git diff --check
```

Expected: the contract passes and the submodule log contains only the approved frontend refactor commits.

- [ ] **Step 5: Commit the parent integration update**

Run:

```bash
git add shopport-fe scripts/check-graphql-contract.mjs scripts/run-maestro-android.sh
git diff --cached --check
git commit -m "refactor(workspace): adopt single-package frontend"
```

If the active-reference scan found a non-historical root document that genuinely required an update, add that exact file path to the first command.

---

### Task 5: Run the complete verification gate

**Files:**
- Modify only if a verification command exposes a migration regression.

**Interfaces:**
- Consumes: the final frontend commit and parent submodule pointer.
- Produces: evidence that the layout changed without changing application behavior or contracts.

- [ ] **Step 1: Verify a frozen single-package install**

Run:

```bash
pnpm --dir shopport-fe install --frozen-lockfile
```

Expected: exit 0 with one root importer and no workspace package resolution.

- [ ] **Step 2: Run frontend quality and generation gates**

Run:

```bash
pnpm --dir shopport-fe check
pnpm --dir shopport-fe test
pnpm --dir shopport-fe codegen
pnpm --dir shopport-fe exec expo install --check
pnpm --dir shopport-fe run doctor
pnpm --dir shopport-fe build
```

Expected: every command exits 0. Review generated files and confirm codegen introduced no content change beyond the committed path move.

- [ ] **Step 3: Run the parent integration gate**

Run:

```bash
make check
```

Expected: submodule SHA, GraphQL contract, secret scan, frontend checks/build, backend checks/tests/build, and schema compatibility all pass.

- [ ] **Step 4: Run final structure and worktree checks**

Run:

```bash
test ! -e shopport-fe/apps
test ! -e shopport-fe/packages
! rg -n '@shopport/(mobile|tokens|ui|typescript-config)|workspace:\*' \
  shopport-fe/package.json shopport-fe/tsconfig.json shopport-fe/src shopport-fe/pnpm-lock.yaml
! rg -n '/shopport-fe/apps/mobile/' \
  shopport-fe/ios/Shopport.xcodeproj shopport-fe/ios/Pods/'Target Support Files' 2>/dev/null
git -C shopport-fe status --short --branch
git status --short --branch
```

Expected: no obsolete structure, internal workspace reference, or stale iOS absolute path remains; both repositories are clean on `refactor/flatten-mobile-app`. Android Maestro is left to CI's disposable emulator because the local runner clears installed app data.

- [ ] **Step 5: Commit only verification fixes, if any**

If verification required a code correction, rerun the failing command and commit the minimal fix in the repository that owns it using the appropriate Conventional Commit scope. If no correction was required, create no empty commit.
