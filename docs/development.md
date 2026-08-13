# 개발과 배포

## 브랜치와 버전

- `main`: production
- `develop`: 통합 개발
- `release/<version>`: staging 승격
- `<type>/<scope>-<slug>`: `develop` 기반 기능 브랜치
- commit: scope가 있는 Conventional Commit

각 TypeScript child repo는 자체 `pnpm-lock.yaml`과 `packageManager: pnpm@11.20.0`을 소유합니다. 루트 태그는 child SHA 세 개를 고정하는 출시 BOM입니다. 호환 SHA를 바꾸려면 child PR을 먼저 병합하고 루트 gitlink PR에서 계약/E2E를 다시 통과시킵니다.

## CI/CD

PR은 format, ESLint, typecheck, unit/integration, secret/dependency scan과 저장소별 검사를 수행합니다. 루트 CI는 submodule SHA, canonical GraphQL schema/snapshot/operation, 실제 HTTP E2E를 검증합니다.

- `develop`: immutable ECR digest를 dev Argo CD overlay에 반영. native fingerprint가 같은 JS 변경만 EAS Update.
- `release/<version>`: 같은 digest를 staging으로 승격하고 EAS preview 및 Maestro 실행.
- `main`: GitHub `production` Environment 승인 후 같은 digest와 submodule SHA를 prod로 승격.
- 모바일 store submit은 TestFlight·Play internal 검증 후 수동입니다.

AWS 인증은 GitHub OIDC만 사용합니다. static AWS key, Terraform state, customer data, provider secret은 저장소에 넣지 않습니다. DB migration은 Argo CD PreSync Job이며 expand/contract만 허용합니다.
