# 테스트와 출시 게이트

## 자동 검증

- FE: format, ESLint, TypeScript, Jest, GraphQL codegen diff, Expo Doctor, Storybook test, iOS/Android export, Maestro workflow
- BE: format, ESLint, TypeScript, Jest, Supertest/Testcontainers, migration re-run, schema compatibility, provider contract
- Infra: Terraform fmt/validate, TFLint, Checkov, Helm lint/template, kubeconform
- Root: submodule SHA, GraphQL schema/operation, 실제 HTTP login→chat→replay→product→favorite→history→logout E2E

부하 스크립트는 `test/load/chat.js`입니다. `PROFILE=steady`는 약 60 chat start/s, `PROFILE=peak`는 600/s, `PROFILE=concurrency`는 최대 10k VU를 모델링합니다. 실제 LLM/provider와 staging 규모가 준비된 뒤 실행하고 Datadog 결과를 출시 artifact에 첨부합니다.

## 수동 matrix

- iOS 16.4/latest, Android 7/latest 실제 기기와 iPhone/iPad/Android phone/tablet
- phone overlay Drawer, tablet permanent Drawer, 회전, split view, nested Stack
- Dynamic Type 최대, VoiceOver/TalkBack, keyboard, Reduce Motion
- Apple/Kakao 취소·위조·audience·nonce, refresh replay, logout, 계정 삭제
- 168시간 trial 경계, KST reset, text/image quota, reconnect 중복 차감
- RevenueCat 월간/연간 purchase·restore·cancel·중복/역순 webhook
- malformed/oversized/HEIC, EXIF 제거, 원본 24시간 lifecycle
- provider timeout/rate limit/stale offer/non-approved visibility와 neutral ranking
- Aurora/Redis failover, pod drain, SQS redrive, Argo rollback, backup restore

## 외부 입력 전에는 출시 불가

- dev/staging/prod AWS account ID, domain, DNS delegation
- Apple, Kakao, RevenueCat, EAS, Datadog, Sentry, LLM credential
- 승인된 실제 shopping provider 최소 1개와 공식 명세
- 실제 multimodal LLM vendor/model 선택
- store 상품·가격, 개인정보처리방침, affiliate 고지, App Review demo account
- 실제 기기/IAP sandbox E2E, 10배 peak 부하, restore·alert·source map 증적
