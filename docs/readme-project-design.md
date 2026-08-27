# README 프로젝트 문서 개편 설계

## 목적

Shopport를 처음 보는 사람은 서비스와 저장소 구성을 빠르게 이해하고, 개발자는 필요한 하위 저장소에서 바로 실행·검증할 수 있게 한다. 루트와 세 하위 저장소 README가 같은 사실을 서로 다른 표현으로 반복하지 않도록 책임을 나눈다.

## 문서 책임

| 문서 | 책임 |
| --- | --- |
| 루트 `README.md` | 서비스 소개, 전체 구성, 통합 로컬 실행, 저장소·상세 문서 탐색 |
| `shopport-fe/README.md` | Expo 모바일 앱의 개발·검증·클라이언트 계약 |
| `shopport-be/README.md` | API·worker·image Lambda의 개발·계약·보안 경계 |
| `shopport-infra/README.md` | 로컬 런타임, AWS 환경, 배포·검증 경계 |
| `docs/` | 아키텍처, provider 승인, AI, 개인정보, 운영, 출시 게이트의 상세 원문 |

## 루트 README

루트 README는 다음 순서로 구성한다.

1. Shopport가 한국 쇼핑몰의 승인된 API를 대화에서 비교하는 모바일 쇼핑 에이전트라는 한 줄 소개
2. 카카오 로그인, 대화형 상품 탐색, 이미지 처리, 찜·기록, 승인된 provider만 허용하는 운영 원칙을 현재 구현 범위 안에서 설명
3. Expo 앱, NestJS API·worker·image Lambda, PostgreSQL·OpenSearch·SQS·S3·승인 provider·AI provider의 간단한 Mermaid 구성도
4. submodule 초기화부터 `make dev-core`, 모바일 앱 실행, 계약 검사, 중지까지의 최소 로컬 실행 절차
5. FE·BE·Infra 저장소의 역할과 각 README 링크
6. 상세 문서, 품질 게이트, 라이선스 부재와 외부 credential·provider 승인이 필요한 범위 안내

상세 보존 정책, 배포 절차, provider 계약은 중복하지 않고 기존 `docs/` 문서로 연결한다.

## 하위 저장소 README

각 README는 독립적으로 열람해도 역할과 시작 지점을 알 수 있도록 구성한다.

- FE: development build가 필요한 이유, 환경 파일, iOS·Android 로컬 API 주소, `apps/mobile`과 공유 package 구조, 검사 명령, GraphQL UUID·로컬 데이터 경계를 설명한다.
- BE: HTTP/GraphQL API, 비동기 worker, image Lambda의 역할, Compose 의존성, 실행·검사 명령, canonical schema와 additive 변경 원칙, 승인 provider·AI provider의 fail-closed 경계를 설명한다.
- Infra: 로컬 Compose가 담당하는 범위와 AWS dev/staging/prod가 담당하는 범위, Terraform·Helm·Argo CD 적용 흐름, secret/state 금지 사항, 검사 명령과 runtime contract 문서 링크를 설명한다.

각 문서는 루트 README와 관련 상세 문서를 상대 링크로 연결한다. `.env.example`에 없는 값, 배포 URL, credential, 근거 없는 배지·스크린샷은 추가하지 않는다.

## 삭제

`docs/superpowers/` 아래의 이전 계획·명세 다섯 파일과 빈 디렉터리를 모두 제거한다. 저장소 밖에서 이 경로를 참조하지 않는 것을 확인했으므로 리디렉션이나 대체 파일은 만들지 않는다.

## 검증과 완료 기준

1. 각 README의 로컬 링크와 명령어를 실제 파일·Makefile·`package.json`·`.env.example`에 대조한다.
2. `rg`로 `docs/superpowers` 참조가 남지 않았는지 확인한다.
3. `git diff --check`를 실행한다.
4. 문서 변경과 무관한 기존 GraphQL 계약 검증인 `make contract`를 다시 실행한다.

이 개편은 애플리케이션 코드, 인프라 정의, 비밀값, 외부 배포 상태를 변경하지 않는다.
