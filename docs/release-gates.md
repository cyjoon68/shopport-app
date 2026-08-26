# 테스트와 출시 게이트

## 필수 코어 앱 자동 게이트

CI는 다음 로컬 코드·계약 검증을 모두 통과해야 합니다.

- FE
  - `pnpm --dir shopport-fe check`
  - `pnpm --dir shopport-fe test:coverage`
  - `pnpm --dir shopport-fe codegen && git -C shopport-fe diff --exit-code`
  - `pnpm --dir shopport-fe run doctor`
  - `pnpm --dir shopport-fe build` — iOS/Android export
- BE
  - `pnpm --dir shopport-be check`
  - `pnpm --dir shopport-be test:coverage`
  - `pnpm --dir shopport-be test:integration`
  - `pnpm --dir shopport-be build`
  - `pnpm --dir shopport-be check:schema "$RUNNER_TEMP/shopport-be-baseline-schema.graphql" schema.graphql` — CI가 root base commit의 `shopport-be` gitlink에서 꺼낸 명시적 baseline과 현재 schema의 하위 호환성을 검증
- Root
  - `./scripts/check-submodules.sh`
  - `node ./scripts/check-graphql-contract.mjs`
  - `make check`의 digest 고정 Gitleaks 8.30.1 컨테이너와 CI의 동일 CLI 버전으로 전체 Git 이력 secret scan

## 수동 출시 전 모바일·제품 검증

스토어 출시 전에는 다음 외부 증적을 별도로 수집합니다. 현재 CI가 이를 실행하거나 통과를 주장하지 않습니다.

- 실제 iOS/Android 기기와 phone/tablet에서 접근성(Dynamic Type, VoiceOver/TalkBack, keyboard, Reduce Motion), 회전·split view·Drawer를 검증합니다.
- Kakao 로그인과 실제 shopping/AI provider 자격 증명으로 취소·위조·audience·nonce, rate limit, timeout, stale offer와 승인 범위를 검증합니다.
- production 규모에서 부하와 장애 복구(backup restore 포함), observability/alert/source-map 증적을 수집합니다.
- store 메타데이터, 개인정보처리방침, affiliate 고지와 App Review demo account를 준비합니다.

## 쇼케이스·외부 입력 전까지 보류된 검증

Terraform, AWS, Argo, IAM, Ingress, ECR 검증은 실제 cloud infrastructure와 계정이 준비된 뒤의 쇼케이스/운영 검증입니다. 이는 현재 코어 앱 품질의 통과 증거나 필수 자동 게이트가 아닙니다.

AWS account/domain/DNS, Kakao·EAS·Datadog·Sentry·AI provider credential, 승인된 provider 공식 명세와 production 데이터 처리 승인은 외부 입력입니다. 준비된 뒤 해당 환경에서 cloud 배포, 권한, rollback, restore와 운영 증적을 검증합니다.
