# README 프로젝트 문서 개편 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox `- [ ]` syntax for tracking.

**Goal:** 네 개의 README를 외부 공개와 개발자 온보딩에 모두 쓸 수 있는 프로젝트 문서로 재구성하고, 과거 docs/superpowers 문서를 제거한다.

**Architecture:** 루트 README는 제품과 통합 실행의 진입점이 되고, FE·BE·Infra README는 독립 저장소에서도 유효한 컴포넌트 문서가 된다. 상세 정책은 기존 docs/를 원문으로 유지하고 README에는 요약과 링크만 둔다.

**Tech Stack:** Markdown, Git submodule, Make, pnpm, Terraform, Helm, Argo CD

**Spec:** docs/readme-project-design.md

## Global Constraints

- README의 사실과 명령은 현재 Makefile, package.json, .env.example, docs/에 있는 내용만 사용한다.
- 새 dependency, 배지, 스크린샷, 배포 URL, credential은 추가하지 않는다.
- 하위 저장소 README는 독립 GitHub 저장소이므로 통합 저장소 링크에 https://github.com/cyjoon68/shopport-app 을 사용한다.
- 상세 정책은 root docs/의 원문을 중복하지 않고 링크한다.
- docs/superpowers/의 다섯 파일과 빈 디렉터리를 제거한다.
- 하위 저장소 README는 각 저장소에서 커밋한 뒤 root gitlink를 갱신한다.

---

### Task 1: 루트 프로젝트 README 재구성

**Files:**
- Modify: README.md

**Interfaces:**
- Consumes: Makefile, compose.yaml, .gitmodules, docs/architecture.md, docs/development.md, docs/providers.md, docs/ai-provider.md, docs/privacy-lifecycle.md, docs/runbooks.md, docs/release-gates.md
- Produces: 제품·구성·실행·상세 문서를 한 곳에서 안내하는 루트 README

- [ ] **Step 1: 명령과 링크 대상을 대조한다**

Run:

~~~bash
sed -n '1,260p' Makefile
rg --files docs shopport-fe shopport-be shopport-infra | rg 'README.md$|architecture.md$|development.md$|providers.md$|ai-provider.md$|privacy-lifecycle.md$|runbooks.md$|release-gates.md$|runtime-contracts.md$'
~~~

Expected: make dev-core, make dev, make contract, make down과 세부 문서 경로가 확인된다.

- [ ] **Step 2: README.md를 다음 구조로 교체한다**

~~~markdown
# Shopport

## 무엇을 만드는가
## 핵심 경험
## 구성
## 빠른 시작
## 저장소 구성
## 상세 문서
## 품질과 출시
## 라이선스
~~~

구성에는 Expo 앱 → API, API·worker → PostgreSQL·OpenSearch·SQS·S3, API → 승인된 catalog API·Command Code Provider API를 표현한 작은 Mermaid 다이어그램을 둔다. 빠른 시작에는 submodule 초기화, 세 .env.example 복사, make dev-core, 별도 터미널의 FE 설치·시작, make contract, make down을 실제 명령으로 넣는다. 저장소 구성은 세 하위 README로, 상세 문서는 docs/의 일곱 원문으로 연결한다.

- [ ] **Step 3: 루트 README를 검사하고 커밋한다**

~~~bash
git diff --check -- README.md
rg -n '^## |\]\(' README.md
git add README.md
git commit -m "docs(readme): reshape project overview"
~~~

Expected: whitespace 오류 없이 루트 README만 포함한 커밋이 생성된다.

### Task 2: 모바일 앱 README 재구성

**Files:**
- Modify: shopport-fe/README.md

**Interfaces:**
- Consumes: shopport-fe/package.json, shopport-fe/apps/mobile/package.json, shopport-fe/.env.example, shopport-fe/apps/mobile/schema.graphql
- Produces: 독립 FE 저장소에서 실행·검증·클라이언트 계약을 설명하는 README

- [ ] **Step 1: FE 명령과 환경 변수를 대조한다**

~~~bash
sed -n '1,240p' shopport-fe/package.json
sed -n '1,240p' shopport-fe/apps/mobile/package.json
sed -n '1,160p' shopport-fe/.env.example
~~~

Expected: Node.js 22.13+, pnpm 11.20.0, pnpm start, pnpm check, pnpm test, pnpm codegen, pnpm build과 공개 환경 변수 이름이 확인된다.

- [ ] **Step 2: FE 문서 브랜치와 README를 만든다**

~~~bash
git -C shopport-fe switch -c docs/readme-project
~~~

README는 다음 구조를 사용한다.

~~~markdown
# Shopport Mobile

## 역할
## 시작하기
## Development build
## 프로젝트 구조
## API와 로컬 데이터 계약
## 검사
## 관련 문서
~~~

시작하기에는 corepack enable, pnpm install, .env.example 복사, pnpm start를 넣는다. Development build에는 Kakao 네이티브 로그인 때문에 Expo Go가 아닌 development build가 필요하다는 사실과 iOS·Android EAS 명령을 넣는다. API와 로컬 데이터 계약에는 canonical UUID, SecureStore, SQLite 보존 범위, offline 전송 큐 부재만 요약한다. 관련 문서에는 통합 저장소 URL, DESIGN.md, security/audit-policy.md를 링크한다.

- [ ] **Step 3: FE README를 검사하고 커밋한다**

~~~bash
git -C shopport-fe diff --check -- README.md
git -C shopport-fe add README.md
git -C shopport-fe commit -m "docs(readme): clarify mobile project"
~~~

Expected: whitespace 오류 없이 FE README만 포함한 커밋이 생성된다.

### Task 3: 백엔드 README 재구성

**Files:**
- Modify: shopport-be/README.md

**Interfaces:**
- Consumes: shopport-be/package.json, shopport-be/.env.example, shopport-be/schema.graphql, docs/ai-provider.md, docs/providers.md
- Produces: 독립 BE 저장소에서 배포 단위·실행·계약·보안 경계를 설명하는 README

- [ ] **Step 1: BE 명령과 configuration source를 대조한다**

~~~bash
sed -n '1,240p' shopport-be/package.json
sed -n '1,220p' shopport-be/.env.example
~~~

Expected: pnpm db:migrate, pnpm dev, pnpm dev:worker, pnpm dev:outbox-worker, pnpm check, pnpm test, pnpm test:integration, pnpm build이 확인된다.

- [ ] **Step 2: BE 문서 브랜치와 README를 만든다**

~~~bash
git -C shopport-be switch -c docs/readme-project
~~~

README는 다음 구조를 사용한다.

~~~markdown
# Shopport Backend

## 역할
## 실행하기
## 배포 단위
## API와 데이터 계약
## Provider와 보안 경계
## 검사
## 관련 문서
~~~

배포 단위에는 HTTP/GraphQL API, 비동기 worker, image Lambda를 명시한다. API와 데이터 계약에는 canonical schema.graphql, additive 변경 후 deprecation 원칙, threadId·runId의 의미를 요약한다. Provider와 보안 경계에는 승인된 catalog API만 허용, crawling·비공식 endpoint 금지, Command Code Provider API와 ZDR fail-closed 원칙을 넣는다. 관련 문서에는 통합 저장소 URL과 root의 provider·AI 문서 URL을 넣는다.

- [ ] **Step 3: BE README를 검사하고 커밋한다**

~~~bash
git -C shopport-be diff --check -- README.md
git -C shopport-be add README.md
git -C shopport-be commit -m "docs(readme): clarify backend project"
~~~

Expected: whitespace 오류 없이 BE README만 포함한 커밋이 생성된다.

### Task 4: 인프라 README 재구성

**Files:**
- Modify: shopport-infra/README.md

**Interfaces:**
- Consumes: shopport-infra/.env.example, shopport-infra/bootstrap/, shopport-infra/stacks/, shopport-infra/helm/shopport/, shopport-infra/argocd/, shopport-infra/docs/runtime-contracts.md
- Produces: 독립 Infra 저장소에서 로컬·클라우드 경계와 배포·검증 절차를 설명하는 README

- [ ] **Step 1: Infra 환경·배포 구성과 검사 명령을 대조한다**

~~~bash
sed -n '1,160p' shopport-infra/.env.example
rg --files shopport-infra/bootstrap shopport-infra/stacks shopport-infra/helm/shopport shopport-infra/argocd shopport-infra/docs | sort
~~~

Expected: local Compose 포트 설정, bootstrap·dev/staging/prod stack, Helm chart, Argo CD application, runtime contract 문서가 확인된다.

- [ ] **Step 2: Infra 문서 브랜치와 README를 만든다**

~~~bash
git -C shopport-infra switch -c docs/readme-project
~~~

README는 다음 구조를 사용한다.

~~~markdown
# Shopport Infrastructure

## 역할
## 로컬 개발 환경
## 클라우드 환경
## 배포 흐름
## 보안과 상태 관리
## 검사
## 관련 문서
~~~

로컬 개발 환경은 .env.example 복사와 상위 통합 저장소의 make dev-core·make dev를 분리해 설명한다. 클라우드 환경은 서울 리전의 독립 dev/staging/prod account와 주요 AWS resource를 사실 그대로 요약한다. 배포 흐름은 bootstrap → environment stack → Helm/Argo CD와 ECR digest 고정을 설명한다. 보안과 상태 관리는 state·credential 미커밋, OIDC만 사용, external input의 경계를 넣는다. 관련 문서에는 통합 저장소 URL, docs/runtime-contracts.md, docs/security-exceptions.md를 링크한다.

- [ ] **Step 3: Infra README를 검사하고 커밋한다**

~~~bash
git -C shopport-infra diff --check -- README.md
git -C shopport-infra add README.md
git -C shopport-infra commit -m "docs(readme): clarify infrastructure project"
~~~

Expected: whitespace 오류 없이 Infra README만 포함한 커밋이 생성된다.

### Task 5: 이전 Superpowers 문서 제거와 root gitlink 갱신

**Files:**
- Delete: docs/superpowers/plans/2026-08-26-backend-auth-ai-hardening.md
- Delete: docs/superpowers/plans/2026-08-26-full-stack-integration-delivery.md
- Delete: docs/superpowers/plans/2026-08-26-mobile-quality-hardening.md
- Delete: docs/superpowers/plans/2026-08-26-postgres-outbox-asset-integrity.md
- Delete: docs/superpowers/specs/2026-08-26-full-stack-quality-hardening-design.md
- Modify: shopport-fe gitlink
- Modify: shopport-be gitlink
- Modify: shopport-infra gitlink

**Interfaces:**
- Consumes: child README commits from Tasks 2–4
- Produces: root repository that points at the three documentation commits and has no docs/superpowers content

- [ ] **Step 1: 삭제 범위와 외부 참조 부재를 다시 확인한다**

~~~bash
rg --files docs/superpowers | sort
rg -n --hidden --glob '!**/.git/**' --glob '!**/node_modules/**' 'docs/superpowers|superpowers/(specs|plans)' .
~~~

Expected: 첫 명령은 다섯 대상 파일을, 두 번째 명령은 해당 파일 내부의 자기 참조만 출력한다.

- [ ] **Step 2: apply_patch로 다섯 파일을 삭제한다**

아래 경로만 Delete File patch로 제거한다.

~~~text
docs/superpowers/plans/2026-08-26-backend-auth-ai-hardening.md
docs/superpowers/plans/2026-08-26-full-stack-integration-delivery.md
docs/superpowers/plans/2026-08-26-mobile-quality-hardening.md
docs/superpowers/plans/2026-08-26-postgres-outbox-asset-integrity.md
docs/superpowers/specs/2026-08-26-full-stack-quality-hardening-design.md
~~~

- [ ] **Step 3: root에서 gitlink와 삭제를 커밋한다**

~~~bash
git add shopport-fe shopport-be shopport-infra docs/superpowers
git commit -m "docs(readme): update project documentation"
~~~

Expected: root 커밋은 세 submodule SHA 변경과 다섯 문서 삭제만 포함한다.

### Task 6: README 링크·형식·계약 검증

**Files:**
- Verify: README.md, shopport-fe/README.md, shopport-be/README.md, shopport-infra/README.md

**Interfaces:**
- Consumes: Tasks 1–5의 커밋된 문서와 root local links
- Produces: 링크가 끊기지 않고 형식 오류가 없다는 검증 증적

- [ ] **Step 1: 네 README의 local Markdown link target을 검사한다**

Run:

~~~bash
node --input-type=module <<'NODE'
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const files = ['README.md', 'shopport-fe/README.md', 'shopport-be/README.md', 'shopport-infra/README.md'];
const unresolved = [];

for (const file of files) {
  const source = readFileSync(file, 'utf8');
  for (const match of source.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
    const target = match[1].split('#', 1)[0];
    if (!target || /^(https?:|mailto:)/.test(target)) continue;
    if (!existsSync(resolve(dirname(file), target))) unresolved.push(file + ': ' + target);
  }
}

if (unresolved.length) throw new Error('Broken local README links:\n' + unresolved.join('\n'));
console.log('Validated ' + files.length + ' README files');
NODE
~~~

Expected: Validated 4 README files.

- [ ] **Step 2: 삭제 참조와 whitespace를 검사한다**

~~~bash
if rg -n --hidden --glob '!**/.git/**' --glob '!**/node_modules/**' 'docs/superpowers|superpowers/(specs|plans)' README.md docs shopport-fe/README.md shopport-be/README.md shopport-infra/README.md; then exit 1; fi
git diff develop..HEAD --check
git -C shopport-fe diff HEAD~1..HEAD --check
git -C shopport-be diff HEAD~1..HEAD --check
git -C shopport-infra diff HEAD~1..HEAD --check
~~~

Expected: 첫 명령과 네 diff --check 명령은 모두 성공한다.

- [ ] **Step 3: 루트 계약 검증을 다시 실행한다**

~~~bash
make contract
~~~

Expected: GraphQL contract valid: 5 operation files, 16 persisted operations.

- [ ] **Step 4: 최종 작업 상태를 확인한다**

~~~bash
git status --short
git -C shopport-fe status --short
git -C shopport-be status --short
git -C shopport-infra status --short
~~~

Expected: 네 저장소 모두 clean working tree이며, 각 README 변경은 해당 문서 커밋과 root gitlink 커밋에 들어 있다.
