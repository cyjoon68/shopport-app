# Shopport

한국 쇼핑몰의 승인된 API를 한 대화에서 비교하는 iOS·Android 쇼핑 에이전트입니다. 이 저장소는 통합 문서, 로컬 실행, GraphQL 계약, 통합 E2E와 출시 BOM을 소유합니다.

## 저장소

| 경로             | 저장소                    | 책임                                    |
| ---------------- | ------------------------- | --------------------------------------- |
| `shopport-fe`    | `cyjoon68/shopport-fe`    | Expo 모바일 앱, 공통 UI, Storybook, EAS |
| `shopport-be`    | `cyjoon68/shopport-be`    | NestJS API·worker·image Lambda          |
| `shopport-infra` | `cyjoon68/shopport-infra` | Terraform, Helm, Argo CD, 관측          |

세 경로는 Git submodule입니다. 루트 커밋과 태그가 검증된 세 SHA의 BOM입니다. 공개 열람용 저장소이며 별도 결정 전 OSS 라이선스를 부여하지 않습니다.

## 로컬 실행

Node.js 22.13+, Corepack, Docker가 필요합니다.

```bash
git submodule update --init --recursive
corepack enable
cp .env.example .env
make dev-core
```

`make dev-core`는 PostgreSQL, Redis, LocalStack, migration, API, worker와 API 내부 fake AI/catalog adapter를 실행합니다. OpenSearch까지 포함하려면 `make dev`를 사용합니다.

```bash
make contract
node scripts/integration-e2e.mjs
make down
```

모바일 앱은 별도 터미널에서 실행합니다.

```bash
cd shopport-fe
pnpm install --frozen-lockfile
pnpm start
```

## 문서

- [아키텍처](docs/architecture.md)
- [개발·CI/CD](docs/development.md)
- [Provider 승인 정책](docs/providers.md)
- [개인정보·데이터 수명주기](docs/privacy-lifecycle.md)
- [운영 runbook](docs/runbooks.md)
- [테스트·출시 게이트](docs/release-gates.md)
