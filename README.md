# Shopport

한국 쇼핑몰의 승인된 API를 한 대화에서 비교하는 iOS·Android 쇼핑 에이전트입니다. 이 저장소는 통합 문서, 로컬 실행, GraphQL 계약, 통합 E2E와 출시 BOM을 소유합니다.

## 저장소

| 경로             | 저장소                    | 책임                                    |
| ---------------- | ------------------------- | --------------------------------------- |
| `shopport-fe`    | `cyjoon68/shopport-fe`    | Expo 모바일 앱, 공통 UI, EAS            |
| `shopport-be`    | `cyjoon68/shopport-be`    | NestJS API·worker·image Lambda          |
| `shopport-infra` | `cyjoon68/shopport-infra` | Terraform, Helm, Argo CD, 관측          |

세 경로는 Git submodule입니다. 루트 커밋과 태그가 검증된 세 SHA의 BOM입니다. 공개 열람용 저장소이며 별도 결정 전 OSS 라이선스를 부여하지 않습니다.

## 로컬 실행

Node.js 22.13+, Corepack, Docker가 필요합니다.

```bash
git submodule update --init --recursive
corepack enable
cp shopport-infra/.env.example shopport-infra/.env
cp shopport-be/.env.example shopport-be/.env
cp shopport-fe/.env.example shopport-fe/.env
make dev-core
```

`make dev-core`는 PostgreSQL, LocalStack, migration, API, worker, outbox dispatcher와 Command Code AI 및 catalog provider를 실행합니다. OpenSearch까지 포함하려면 `make dev`를 사용합니다.
환경 변수는 인프라, 백엔드, 프론트엔드 저장소별 `.env`로 분리합니다. 상위 Makefile은 로컬 Compose 실행 시 인프라와 백엔드 `.env`를 함께 읽습니다.

```bash
make contract
KAKAO_IDENTITY_TOKEN=... KAKAO_IDENTITY_NONCE=... node scripts/integration-e2e.mjs
make down
```

모바일 앱은 루트에서 별도 터미널로 실행합니다.

```bash
pnpm --dir shopport-fe install --frozen-lockfile
pnpm --dir shopport-fe start
```

## 문서

- [아키텍처](docs/architecture.md)
- [개발·CI/CD](docs/development.md)
- [Provider 승인 정책](docs/providers.md)
- [AI provider](docs/ai-provider.md)
- [개인정보·데이터 수명주기](docs/privacy-lifecycle.md)
- [운영 runbook](docs/runbooks.md)
- [테스트·출시 게이트](docs/release-gates.md)
