# 레브잇 지원용 Shopport 프로젝트 근거 문서

- 대상 공고: [레브잇 Software Engineer (Frontend) (병역특례 보충역)](https://www.wanted.co.kr/wd/339807)
- 조사·정리 기준일: 2026-08-31
- 프로젝트 저장소: [shopport-app](https://github.com/cyjoon68/shopport-app)
- 기준 상태: frontend `develop` `4529dc5`([PR #34](https://github.com/cyjoon68/shopport-fe/pull/34), [후속 수정 PR #35](https://github.com/cyjoon68/shopport-fe/pull/35), [E2E 환경 수정 PR #36](https://github.com/cyjoon68/shopport-fe/pull/36), [CI run 33321240150](https://github.com/cyjoon68/shopport-fe/actions/runs/33321240150))와 backend `develop` `7fd120f`([PR #23](https://github.com/cyjoon68/shopport-be/pull/23), [CI run 33317397700](https://github.com/cyjoon68/shopport-be/actions/runs/33317397700))에 failure recovery가 병합됐다. root [PR #27](https://github.com/cyjoon68/shopport-app/pull/27)은 두 submodule을 통합해 Maestro 재검증 중이다.
- 문서 성격: 이력서·포트폴리오·자기소개서·면접 답변을 만들 때 사용할 사실과 표현의 원본

## 1. 이 문서를 쓰는 방법

이 문서는 완성된 지원서가 아니다. 하나의 프로젝트를 여러 지원 서류에서 일관되게 설명하기 위한 근거 저장소다. 문장을 그대로 모두 옮기기보다 지원 매체에 맞는 사례 두세 개를 골라 압축한다.

가장 중요한 원칙은 구현과 임팩트를 구분하는 것이다. 현재 프로젝트에는 실제 사용자, 운영 트래픽, 전환율, 매출 기여 같은 실서비스 임팩트가 없다. 대신 관찰한 문제, 설계 판단, 구현 범위, 자동 검증 결과는 코드와 CI로 증명할 수 있다. 지원 서류에서도 이 경계를 유지한다.

### 증거 등급

| 등급      | 의미                                        | 현재 사용할 수 있는 근거                                                             |
| --------- | ------------------------------------------- | ------------------------------------------------------------------------------------ |
| 관찰      | 공개된 앱을 직접 사용하며 확인한 현상       | 원본 쇼포트 화면 캡처 `IMG_3251.PNG`, `IMG_3252.PNG`, 직접 수행한 제스처와 대화 흐름 |
| 구현      | 본 프로젝트 코드에 존재하는 동작            | frontend·backend 소스와 병합 PR                                                      |
| 자동 검증 | 반복 실행되는 테스트가 보장하는 동작        | Jest, backend integration, Maestro, GitHub Actions                                   |
| 수동 검증 | 특정 기기·시뮬레이터에서 사람이 확인한 결과 | iOS 시뮬레이터 Maestro 3개 흐름, native menu·spacing 확인 기록                       |
| 가설      | UX 변경으로 기대하는 사용자 효과            | 통제감 향상, 맥락 회복 비용 감소, 첫 질문 작성 부담 감소                             |
| 미검증    | 현재 사실처럼 말하면 안 되는 항목           | 사용자 만족도, 전환율, 잔존율, 매출, 운영 안정성, 대규모 트래픽 성능                 |

## 2. 프로젝트 정체성과 공개 표현

### 권장 정의

> 공개적으로 관찰할 수 있는 레브잇 쇼포트의 모바일 UX를 분석하고, AI 쇼핑 에이전트에 필요한 대화 연속성·실행 제어·모바일 플랫폼 경험을 다시 설계한 독립 구현 프로젝트

이 프로젝트의 핵심은 화면을 똑같이 복제한 데 있지 않다. 원본 앱에서 겪은 상호작용 문제를 가설로 세우고, React Native 앱과 AI stream backend, 테스트·출시 게이트까지 연결해 대안을 구현했다.

### 반드시 붙일 고지

- 레브잇의 공식 제품이나 공식 코드가 아니다.
- 공개된 앱의 화면과 동작을 관찰한 독립 UX case study다.
- 원본 소스 코드, 내부 문서, 사용자 데이터, 회사 지표를 사용하지 않았다.
- 상표와 제품명은 분석 대상을 식별하는 용도로만 언급한다.

### 피해야 할 정의

- “레브잇 쇼포트를 만든 프로젝트”
- “쇼포트의 문제를 해결해 전환율을 개선한 프로젝트”
- “실서비스 수준을 검증한 프로젝트”
- “ChatGPT처럼 보이게 만든 클론”
- “iOS 네이티브 앱”

마지막 두 표현도 정확하지 않다. 목표는 특정 채팅 앱의 외형을 모방하는 것이 아니었다. AI 에이전트가 작업하는 동안 사용자가 맥락을 보고, 중단하고, 질문을 고쳐 다시 요청할 수 있는 상호작용을 만드는 일이었다. 앱은 Expo·React Native로 구현했으며 iOS의 익숙한 affordance를 적극 사용했다.

## 3. 회사와 공고를 읽고 정한 프로젝트 포지션

### 공고에서 확인한 역할

Wanted 공고는 Growth Feature와 Commerce Platform의 웹·앱 컴포넌트를 설계·개발·테스트·운영하고, 문제 정의와 아키텍처부터 출시까지 전체 사이클을 맡는 프론트엔드 엔지니어를 찾는다. React·React Native, TypeScript, GraphQL, GitHub Actions를 명시하며 사용자 경험과 조직 생산성 개선, 빠른 개발·배포, 주도적인 문제 발견을 함께 요구한다.

### 회사 기술 글에서 반복되는 기준

- [Problem Solver 채용공고 톺아보기](https://blog.alwayz.co/ps): 고객의 언어와 구매 맥락을 이해하는 카테고리별 AI 쇼핑 에이전트를 만들며, Product Engineer가 구현 범위를 넘어 고객 문제와 사업 효과까지 정의한다고 설명한다.
- [코드를 넘어 비즈니스를 봅니다](https://blog.alwayz.co/sy): 장애를 바로 덮기보다 관측 정보를 먼저 보강하고, 세분화된 상태와 재시도 UX를 만든 뒤 작은 범위부터 확장한 사례를 다룬다.
- [프로덕트와 조직의 성장에 직접 기여한다는 것](https://blog.alwayz.co/yhl): 사용자 기능과 엔지니어링 개선을 함께 맡고, 데이터로 우선순위를 정하며 직군 간 협업으로 문제를 정의하는 방식을 강조한다.
- [AI-oriented 엔지니어링 조직으로 나아갑니다](https://blog.alwayz.co/levin): 엔지니어가 문제를 끝까지 소유하고 빠르게 검증하되, 코드 리뷰·배포·모니터링 같은 품질 기준을 명시적으로 관리하는 방향을 제시한다.

### 이 프로젝트가 공고에 맞는 이유

Shopport 프로젝트의 설득력은 “비슷한 쇼핑 앱을 만들었다”가 아니라 다음 흐름에 있다.

1. 원본 앱을 사용하며 에이전트 상호작용의 단절을 발견했다.
2. 문제를 사용자의 통제권, 대화 맥락, 모바일 navigation이라는 단위로 나눴다.
3. UI만 바꾸지 않고 실행 취소 계약과 stream lifecycle까지 연결했다.
4. 회귀 위험이 큰 세 흐름을 Maestro로 자동화하고 CI에 넣었다.
5. 자동 검증과 실서비스 임팩트의 차이를 출시 문서에 명시했다.

이 구조는 공고의 “문제 발견 → 설계 → 구현 → 테스트 → 출시 품질”과 직접 맞닿는다. 반면 실제 고객 지표와 운영 경험은 아직 부족하다. 지원 서류에서는 강점과 한계를 함께 보여주는 편이 신뢰도가 높다.

## 4. 프로젝트 요약

Shopport는 대화로 상품을 찾고 비교하는 iOS·Android 쇼핑 에이전트다. 모바일 앱은 Expo SDK 57·React Native·TypeScript로 만들었고, Apollo GraphQL이 조회와 mutation을, TanStack AI NDJSON stream이 AI 응답을 담당한다. NestJS backend는 대화·상품·이미지·취소 lifecycle을 처리한다.

### 구현 범위

| 영역      | 구현                                                                                             |
| --------- | ------------------------------------------------------------------------------------------------ |
| 모바일    | Expo Router, React Native, TypeScript, Unistyles, Apollo Client, TanStack AI, SQLite persistence |
| 에이전트  | streaming conversation, 중단, reconnect, 질문 보완, 상품 추천, 이미지 입력                       |
| commerce  | provider 선택, 상품 검색·추천, 가격·배송 정보, 찜, 외부 구매 링크                                |
| backend   | NestJS, GraphQL, PostgreSQL, AI run lifecycle, idempotent cancel, stream replay                  |
| 품질      | Jest unit·integration, GraphQL compatibility, Expo Doctor·export, Maestro, secret scan           |
| 운영 설계 | AWS·Argo CD·Datadog·Sentry 구성이 있으나 실제 production 운영은 미검증                           |

## 5. UX 문제 해결 기록

### 5.1 AI 작업을 기다리는 화면에서 통제 가능한 대화로

#### 관찰한 문제

원본 쇼포트의 Home에서 질문을 보내면 AI가 상품을 찾는 별도 화면으로 이동했다. 검색 중에는 입력창이 사라지고 실행을 중단할 수 없었다. 검색이 끝난 뒤 입력창이 다시 나타나지만 방금 보낸 질문을 고치거나 작업을 되돌릴 경로가 없었다.

문제는 ChatGPT처럼 보이지 않는다는 데 있지 않다. 에이전트가 시간이 걸리는 작업을 수행하면서도 사용자가 다음 네 가지를 할 수 없다는 점이 핵심이었다.

- 현재 요청과 대화 맥락을 계속 확인한다.
- 원하지 않는 작업을 중단한다.
- 잘못 입력한 질문을 다시 편집한다.
- 실패하거나 취소한 뒤 다음 행동을 선택한다.

#### 설계 판단

AI 실행을 화면 전환으로 감추지 않고 conversation 안의 상태로 취급했다. 실행 중에도 메시지 목록과 composer 위치를 유지하고, 보내기 버튼을 중지 버튼으로 바꾸었다. 사용자가 이전 메시지를 길게 눌러 편집하면 진행 중인 run을 먼저 중단한 뒤 해당 문장을 composer에 채운다.

#### 구현

- [`new-chat-footer.tsx`](https://github.com/cyjoon68/shopport-fe/blob/4529dc5/apps/mobile/src/features/chat/components/composer/new-chat-footer.tsx)는 `loading` 중 보내기 아이콘을 `sf:stop.fill`로 바꾸고 접근성 이름을 `응답 중지`로 노출한다.
- [`conversation-screen.tsx`](https://github.com/cyjoon68/shopport-fe/blob/4529dc5/apps/mobile/src/screens/chat/conversation-screen.tsx)는 실행 중 편집 요청이 오면 `cancelRunThenStop` 완료 후 composer draft를 교체한다. 여러 편집 취소 요청의 완료 순서가 바뀌어도 마지막 요청만 남긴다.
- 취소가 terminal state로 확정되면 `검색을 중지했어요`와 `질문 수정`·`다시 검색`을 대화 안에 남긴다. 질문 수정은 원문을 composer에 복원하고 focus하며, 다시 검색은 같은 사용자 메시지와 검색 조건을 사용하되 새 run을 만든다.
- [`message-list-item.tsx`](https://github.com/cyjoon68/shopport-fe/blob/4529dc5/apps/mobile/src/features/chat/components/conversation/message-list-item.tsx)는 사용자 메시지에 native menu 기반 복사·편집 동작을 제공한다.
- [`fetchers.ts`](https://github.com/cyjoon68/shopport-fe/blob/4529dc5/apps/mobile/src/features/chat/api/fetchers.ts)는 server cancel을 요청하고, 요청 결과와 관계없이 local transport를 정리한다.
- [`ai.controller.ts`](https://github.com/cyjoon68/shopport-be/blob/7fd120f/src/modules/ai/ai.controller.ts), [`ai.repository.ts`](https://github.com/cyjoon68/shopport-be/blob/7fd120f/src/modules/ai/ai.repository.ts), [`ai-stream-lifecycle.ts`](https://github.com/cyjoon68/shopport-be/blob/7fd120f/src/modules/ai/ai-stream-lifecycle.ts)는 account·conversation·run 소유권을 확인하고 취소를 terminal state로 기록한다. provider 작업은 250ms 간격의 취소 확인으로 abort된다. 재시도에서는 완료된 동일 사용자 메시지의 account·conversation·본문·이미지가 모두 일치할 때만 새 run에 재사용해 history 중복을 막는다.

#### 검증

- `conversation-screen.unit.spec.tsx`: 생성 중 편집 전에 cancel 완료를 기다리는지, 비동기 취소 순서가 뒤바뀌어도 최신 편집을 보존하는지 검증한다.
- `fetchers.integration.spec.ts`: cancel HTTP 계약과 local stop을 함께 검증한다.
- backend integration: 다른 account의 cancel을 404로 숨기고 같은 run의 반복 취소를 멱등 처리하며, 취소된 run에 assistant message가 남지 않는지 확인한다. 별도 테스트는 PostgreSQL row lock 아래에서 cancel과 complete를 실제로 경합시켜 cancel이 먼저 확정되면 completion이 lease를 잃고 assistant message를 쓰지 못하는지 검증한다.
- `agent-control.yaml`: 질문 전송 → `응답 중지` → terminal 안내 확인 → 같은 질문 재검색 → 다시 중지 → 질문 수정 → draft 재전송 흐름을 Android UI에서 수행하도록 구성했다. root PR의 Maestro CI 통과 전에는 실행 완료 증거로 사용하지 않는다.

#### 말할 수 있는 결과

> AI 응답을 별도 결과 화면이 아니라 사용자가 제어할 수 있는 대화 상태로 재설계하고, 모바일의 중지·편집 UI부터 backend의 멱등 취소와 provider abort까지 연결했다.

#### 아직 말할 수 없는 결과

- 사용자 이탈이나 잘못된 구매 탐색이 줄었다고 말할 수 없다.
- 편집은 과거 메시지를 삭제하고 대화 history를 분기하는 rollback이 아니다. 이전 문장을 composer로 가져와 새 요청을 준비하는 기능이다.
- 취소 후 사용자가 느끼는 안도감이나 재요청 성공률은 측정하지 않았다.

#### 추후 측정 지표

- `agent_run_cancel_requested`부터 composer 복구까지의 지연
- 취소 뒤 60초 안에 편집·재전송한 비율
- 전송 오류 뒤 draft 보존 및 재전송 성공률
- 검색 시작 후 화면 이탈률과 완료 전 취소율

### 5.2 Home의 질문 카드에서 composer 중심 quick action으로

#### 관찰한 문제

원본 Home은 “원하는 질문을 선택해보세요” 아래에 큰 2열 카드를 배치했다. 최저가 찾기 같은 항목을 누르면 세부 질문이 세로 label 목록으로 펼쳐져 Home 콘텐츠를 덮었다. 질문 선택 영역과 입력창이 분리되어 있었고, 선택 결과가 별도 mode처럼 보였다.

#### 설계 판단

질문 제안은 에이전트 대화의 입구이지 별도 홈 콘텐츠가 아니다. 따라서 composer 바로 위에 한 줄짜리 가로 스크롤 label로 배치했다. 대화가 아직 없고 input value가 비어 있을 때만 보여주며, 사용자가 문자를 입력하는 즉시 감춘다. 제안을 고르면 자동 전송하지 않고 composer에 채워 사용자가 고쳐 보낼 수 있게 했다.

#### 구현

- [`chat-quick-actions.tsx`](https://github.com/cyjoon68/shopport-fe/blob/4529dc5/apps/mobile/src/features/chat/components/composer/chat-quick-actions.tsx)는 판매처와 `최저가 찾기`, `추천받기`, `대체품 찾기`를 horizontal `ScrollView`의 label 형태로 제공한다.
- 첫 단계 label을 누르면 선택지를 bottom sheet로 열고, 고른 문장을 input에 복사한다.
- [`new-chat-footer.tsx`](https://github.com/cyjoon68/shopport-fe/blob/4529dc5/apps/mobile/src/features/chat/components/composer/new-chat-footer.tsx)는 `quickActionsEnabled && inputEditable && text.trim().length === 0`일 때만 quick action을 렌더링한다.
- [`conversation-screen.tsx`](https://github.com/cyjoon68/shopport-fe/blob/4529dc5/apps/mobile/src/screens/chat/conversation-screen.tsx)는 history loading이 끝났고 추가 질문이 없으며 대화 내용이 0개일 때만 이 기능을 허용한다.

#### 검증

- unit test는 input에 문자가 생기면 quick action이 사라지고 다시 비우면 나타나는지 확인한다.
- 선택한 prompt가 composer에 복사되고 sheet가 닫히는지, backdrop으로도 닫을 수 있는지 확인한다.
- `quick-action-composer.yaml`은 quick action 노출 → prompt 선택 → label 숨김 → 채팅·상품 탭 전환 → draft 유지까지 검증한다.

#### 말할 수 있는 결과

> 질문 제안을 큰 Home 카드에서 composer 위의 조건부 horizontal label로 옮기고, 선택한 문장을 자동 실행하지 않고 편집 가능한 draft로 제공했다.

#### 기대 효과와 한계

입력 위치와 제안 위치가 가까워져 첫 질문 작성 부담과 화면 점유를 줄일 것으로 예상했다. 하지만 task completion time, prompt 선택률, 선택 후 수정률은 측정하지 않았다. “더 직관적이다”라고 단정하기보다 설계 가설로 표현한다.

### 5.3 결과만 남는 화면에서 대화와 상품을 오가는 구조로

#### 관찰한 문제

원본 앱은 상품을 찾은 뒤 상품 리스트를 중심으로 보여주고, 어떤 질문과 조건을 거쳐 결과가 나왔는지 다시 확인하기 어려웠다. 사용자는 결과를 검토하다 조건을 바꾸려면 자신의 탐색 맥락을 기억해서 다시 입력해야 했다.

#### 설계 판단

대화와 상품은 서로 다른 목적을 갖지만 같은 탐색 session의 두 표현이다. 화면을 교체하는 대신 `채팅`과 `상품` segmented control을 두고 같은 conversation state를 공유하게 했다.

#### 구현

- [`chat-segmented-control.tsx`](https://github.com/cyjoon68/shopport-fe/blob/4529dc5/apps/mobile/src/features/chat/components/header/chat-segmented-control.tsx)는 tap과 horizontal pan으로 탭을 바꾸며, 선택되지 않은 탭에 새 메시지나 상품이 생기면 unread dot을 표시한다.
- [`chat-screen.tsx`](https://github.com/cyjoon68/shopport-fe/blob/4529dc5/apps/mobile/src/screens/chat/chat-screen.tsx)는 conversation message에서 recommendation을 투영해 상품 탭에 전달한다. 두 탭을 같은 화면 tree에 유지해 전환 뒤에도 대화와 상품 상태를 보존한다.
- 채팅 안의 상품을 선택하면 해당 상품을 focus한 채 상품 탭으로 이동한다.
- streaming text만 바뀔 때 상품 projection이 같으면 상품 탭의 불필요한 rerender를 막는다.

#### 검증

- segmented control의 tap 전환과 unread 접근성 상태를 unit test로 확인한다.
- chat screen test는 stream의 text-only update가 상품 탭을 다시 렌더링하지 않는지 확인한다.
- `quick-action-composer.yaml`은 상품 탭에 다녀온 뒤 채팅 draft가 그대로 남는지 검증한다.

#### 말할 수 있는 결과

> 상품 결과와 그 결과를 만든 대화를 같은 conversation state의 두 탭으로 구성해, 사용자가 탐색 근거를 잃지 않고 오갈 수 있게 했다.

실사용에서 조건 수정 시간이 줄었는지는 아직 검증하지 않았다.

### 5.4 실패·오프라인·불확실한 재고를 숨기지 않는 복구 경험

#### 예상한 실패 시나리오

실서비스 사용자 데이터 없이 장애 감소를 주장할 수는 없다. 대신 앱의 실제 경계에서 발생 가능한 실패를 명시하고, 실패가 생겼을 때 거짓 성공이나 맥락 손실로 이어지지 않도록 계약과 테스트를 만들었다.

- 검색 중 앱이 background로 이동하거나 네트워크가 끊긴다.
- 여러 판매처 중 한 곳만 일시적으로 실패한다.
- 판매처 응답에 재고 값이 없거나 상품별 재고 조회가 실패한다.
- 사용자의 취소와 AI completion이 거의 동시에 database에 도착한다.

#### 구현

- 앱이 inactive·background로 바뀔 때 chat persistence를 flush한다. offline 전환 시 local stream을 멈추되 저장된 resume pointer를 지우지 않고, reconnect 때 같은 conversation을 한 번 remount해 history hydrate와 stream join을 다시 수행한다.
- offline에서 시작된 늦은 persistence write가 reconnect 뒤 도착해 새 resume pointer를 덮지 못하게 한다. offline remove도 억제한다.
- 강제 선택된 판매처는 각각 한 번 재시도한다. 일부만 실패하면 성공한 상품은 유지하고 `unavailableProviderIds`를 AI 결과에 포함하며, 모두 실패했을 때만 안전한 오류로 종료한다. 사용자가 고르지 않은 판매처로 몰래 대체하지 않는다.
- 재고를 `IN_STOCK`·`OUT_OF_STOCK`·`UNKNOWN`으로 분리한다. 누락·조회 실패를 품절로 단정하지 않고 `재고 확인 필요`로 보여주며, 확인 시각과 7일 이상 지난 정보의 오래됨도 함께 노출한다.
- cancel과 complete가 경합할 때 database의 조건부 terminal transition을 단일 진실 원천으로 사용한다. cancel이 먼저 확정되면 늦은 completion은 `AI run lease lost`로 거절된다.

#### 검증 가능한 결과와 한계

> 네트워크 단절, 판매처 부분 실패, 불확실한 재고, cancel/complete 경합을 명시적인 상태로 모델링하고 모바일 복구 UI·GraphQL 계약·PostgreSQL 통합 테스트까지 연결했다.

이 문장은 구현과 자동 검증을 설명한다. 실제 장애율, 재시도 성공률, 재고 정확도, 사용자 이탈이 개선됐다는 뜻은 아니다. provider가 반환한 `unavailableProviderIds`는 현재 AI가 응답을 정직하게 구성하기 위한 근거이며, 별도 사용자용 판매처 상태 배지까지 구현한 것은 아니다.

### 5.5 navigation stack처럼 동작하던 메뉴를 실제 Drawer로

#### 관찰한 문제

원본 앱에서 메뉴를 연 뒤 왼쪽으로 스와이프하면 Drawer가 오른쪽 방향으로 닫히지 않고 이전 Home으로 돌아갔다. 사용자 관점에서는 Drawer가 overlay가 아니라 navigation history에 쌓인 화면처럼 동작했다. 원본 내부 코드를 볼 수 없으므로 실제 구현 방식까지 단정하지 않고 관찰한 결과를 문제로 삼았다.

#### 설계 판단과 구현

- [`(drawer)/_layout.tsx`](https://github.com/cyjoon68/shopport-fe/blob/4529dc5/apps/mobile/src/app/%28drawer%29/_layout.tsx)는 `expo-router/drawer`를 앱의 root navigator로 사용한다.
- [`chat-screen.tsx`](https://github.com/cyjoon68/shopport-fe/blob/4529dc5/apps/mobile/src/screens/chat/chat-screen.tsx)는 메뉴 버튼에서 `navigation.openDrawer()`를 호출한다.
- [`shopport-drawer-content.tsx`](https://github.com/cyjoon68/shopport-fe/blob/4529dc5/apps/mobile/src/navigation/components/shopport-drawer-content.tsx)는 메뉴 이동 전 `navigation.closeDrawer()`를 호출한다. Drawer를 닫는 동작과 다른 route로 이동하는 동작을 구분한다.

#### Maestro가 검증하는 범위

`drawer-gesture.yaml`은 상품 탭을 선택한 상태에서 Drawer를 열고 오른쪽에서 왼쪽으로 swipe한 뒤 다음을 확인한다.

- Drawer 콘텐츠가 사라진다.
- 메뉴 버튼이 다시 보인다.
- underlying 화면은 여전히 상품 탭이다.
- 채팅 composer가 나타나지 않는다.

이 테스트는 swipe가 navigation pop으로 Home을 새로 연 것이 아니라 Drawer를 닫고 기존 화면 상태로 복귀했음을 검증한다.

#### Maestro가 검증하지 못하는 범위

Maestro의 최종 assertion만으로 Drawer가 손가락을 따라 움직였는지, 닫힘 방향과 easing이 자연스러운지, frame drop이 없었는지 증명할 수 없다. 이 부분은 iOS 실제 기기나 시뮬레이터 화면 녹화로 보여줘야 한다. 포트폴리오에는 제스처 시작부터 닫힘까지의 영상을 별도 증거로 넣는다.

### 5.6 iOS에서 익숙한 동작과 접근성 반영

#### 문제 정의

원본 앱은 모바일 화면이지만 iOS 사용자가 기대하는 menu, symbol, haptic, safe area, motion·transparency 설정과의 연결이 약하다고 판단했다. 목표는 장식을 추가하는 것이 아니라 플랫폼에서 익숙한 입력과 피드백을 사용하는 것이었다.

#### 구현

- composer는 iOS에서 API가 제공되고 Reduce Transparency가 꺼진 경우 `expo-glass-effect`를 사용하며, 그 외 환경에는 읽을 수 있는 일반 surface를 제공한다.
- 아이콘은 SF Symbols source를 사용하고, 전송·상품 선택 같은 주요 동작에는 iOS haptic feedback을 연결했다.
- 사용자 메시지 작업은 [`@expo/ui`의 native `MenuView`](https://github.com/cyjoon68/shopport-fe/blob/4529dc5/apps/mobile/src/features/chat/components/conversation/message-list-item.tsx)를 사용한다.
- Drawer의 최근 대화에는 native `Link.Preview`와 `Link.Menu`를 연결해 고정·이름 변경·삭제를 제공한다.
- Safe Area, 최소 44pt touch target, `allowFontScaling`, accessibility role·state·label을 주요 interaction에 적용했다.
- [`accessibility/hooks.ts`](https://github.com/cyjoon68/shopport-fe/blob/4529dc5/apps/mobile/src/shared/accessibility/hooks.ts)는 Reduce Motion과 Reduce Transparency 설정을 읽는다.

#### 검증과 표현 한계

[mobile Maestro PR #32](https://github.com/cyjoon68/shopport-fe/pull/32)와 [root PR #24](https://github.com/cyjoon68/shopport-app/pull/24)에는 iPhone 17 Pro, iOS 26.5 시뮬레이터에서 핵심 흐름 3개가 통과한 기록이 있다. 다만 여러 실제 기기의 VoiceOver, Dynamic Type, Reduce Motion, orientation까지 확인한 것은 아니다.

지원 서류에서는 “iOS 네이티브로 개발했다”보다 “React Native에서 iOS platform affordance와 접근성 설정을 반영했다”라고 쓴다.

### 5.7 에이전트가 조건을 되묻는 구조

레브잇은 범용 답변보다 카테고리별 구매 맥락을 이해하는 AI shopping agent를 설명한다. 본 프로젝트는 조건이 부족할 때 에이전트가 구조화된 추가 질문을 보내는 `AskUser` 흐름을 구현했다.

- [`ask-user-sheet.tsx`](https://github.com/cyjoon68/shopport-fe/blob/4529dc5/apps/mobile/src/features/chat/components/conversation/ask-user-sheet.tsx)는 추가 질문을 modal bottom sheet로 연다.
- [`ask-user-card.tsx`](https://github.com/cyjoon68/shopport-fe/blob/4529dc5/apps/mobile/src/features/chat/components/conversation/ask-user-card.tsx)는 선택 중 중복 제출을 막고, 실패하면 다시 누를 수 있는 상태를 제공한다.
- 사용자는 질문에 답하거나 sheet를 닫아 건너뛸 수 있다. free-text 허용 여부도 agent request가 정한다.
- schema test는 option 개수, 질문 길이, free-text flag 같은 AI 출력 경계를 검증한다.

이는 “AI가 알아서 찾는다”는 한 번의 실행보다 구매 조건을 대화로 좁히는 agent UX에 가깝다. 아직 카테고리별 질문 품질이나 추천 만족도는 평가하지 않았다.

## 6. 공고 맞춤 엔지니어링 근거

### 6.1 UI 변경을 backend 계약까지 연결

중지 버튼만 추가하면 local stream은 멈춰도 server와 provider 작업이 계속될 수 있다. 본 프로젝트는 `threadId`와 `runId`를 cancel 계약에 포함하고, account ownership 확인, 멱등 상태 전이, provider abort까지 구현했다. 취소 뒤 같은 질문을 다시 검색할 때는 사용자 메시지를 복제하지 않고 새 run만 만들도록 backend 계약도 확장했다. 프론트엔드 문제를 network·persistence·provider lifecycle로 추적한 사례다.

공고 연결: 문제 정의와 아키텍처부터 출시까지 전체 사이클, React Native·GraphQL 기반 앱 개발.

### 6.2 대화 상태의 복구와 데이터 경계

- `threadId`는 conversation ID, `runId`는 idempotency key로 사용한다.
- TanStack AI transport는 reconnect를 최대 5회 시도하고 PostgreSQL stream event는 1시간 replay할 수 있다.
- server history, live stream, SQLite message를 canonical UUID로 merge한다.
- inactive·background에서 SQLite persistence를 flush한다. offline에서는 cached conversation과 draft만 허용하고 remote send queue는 만들지 않는다.
- reconnect 때 저장된 resume pointer로 한 번만 다시 join하며, reconnect와 경합한 오래된 offline write가 pointer를 덮지 못하게 한다.
- logout·account deletion 시 Apollo, SQLite, SecureStore의 사용자 상태를 정리한다.

공고 연결: 사용자 경험과 안정성을 함께 고려한 frontend 환경 개선. 다만 production 장애 복구를 수행한 경험으로 확대해서는 안 된다.

### 6.3 streaming 성능과 화면 경계

- message list는 FlashList와 stable key를 사용하고 bottom 근처에서만 streamed response를 따라간다.
- chat screen에는 message와 product의 필요한 projection만 비교하는 `hasSameChatScreenProjection`이 있다.
- text token만 추가될 때 product tab rerender를 막는 unit test가 있다.
- chat component를 composer, conversation, header, screen 경계로 분리해 변경 범위를 좁혔다.

공고 연결: 앱 component 설계와 사용자 경험·개발 생산성 개선. 실제 frame time이나 memory 수치는 아직 없다.

### 6.4 핵심 UX를 Maestro CI로 고정

처음에는 Maestro flow가 로컬에서만 실행됐다. 이후 외부 Kakao·catalog·AI credential 없이도 재현할 수 있도록 고정 identity, 고정 catalog, 4초 지연 AI stream을 제공하는 전용 NestJS runner를 만들고 Android API 34 CI에 연결했다.

CI의 세 흐름은 다음 위험을 맡는다.

| 흐름                         | 회귀 위험                                    | 자동 검증                                                     |
| ---------------------------- | -------------------------------------------- | ------------------------------------------------------------- |
| `quick-action-composer.yaml` | quick action이 입력과 대화를 덮음            | 빈 input에서만 노출, 선택 후 draft 유지, 탭 전환 뒤 상태 유지 |
| `drawer-gesture.yaml`        | swipe가 Drawer close 대신 화면 이동을 일으킴 | Drawer 종료 뒤 underlying 상품 탭 상태 유지                   |
| `agent-control.yaml`         | 취소 뒤 다음 행동이 없거나 대화가 중복됨      | terminal 안내, 동일 질문 재검색, 질문 수정, 재전송·재중지     |

[root PR #25](https://github.com/cyjoon68/shopport-app/pull/25)의 [GitHub Actions run 33163261017](https://github.com/cyjoon68/shopport-app/actions/runs/33163261017)은 이전 revision의 compatibility, backend integration, secret scan, Maestro 3개 흐름을 통과했다. 신규 recovery 코드의 [frontend PR #34](https://github.com/cyjoon68/shopport-fe/pull/34), [backend PR #23](https://github.com/cyjoon68/shopport-be/pull/23), 후속 경합 수정 [frontend PR #35](https://github.com/cyjoon68/shopport-fe/pull/35), E2E 환경 수정 [frontend PR #36](https://github.com/cyjoon68/shopport-fe/pull/36)도 각 저장소 CI를 통과했다. 통합 [root PR #27](https://github.com/cyjoon68/shopport-app/pull/27)의 [첫 run 33317692606](https://github.com/cyjoon68/shopport-app/actions/runs/33317692606)은 `agent-control.yaml`의 마지막 assertion에서 실패했다. 별도 unit 재현으로 이전 재검색의 늦은 완료가 새 취소 recovery를 비활성화하는 제품 경합을 찾아 PR #35에서 수정했다. 이후 진단 artifact를 확보한 [run 33320550872](https://github.com/cyjoon68/shopport-app/actions/runs/33320550872)에서는 `질문 수정`이 input을 focus할 때 AOSP 키보드의 연락처 권한 팝업이 전송 버튼을 가린 테스트 환경 원인을 확인해 PR #36에서 선택적으로 처리했다. root Maestro 최종 재실행 결과는 아직 남아 있다.

공고 연결: 자동화·최적화로 개발 생산성을 높인 경험, GitHub Actions, 빠른 변경과 회귀 방지.

### 6.5 출시 가능성과 실제 출시를 구분

[`release-gates.md`](../release-gates.md)는 자동 gate와 수동 출시 검증을 나눈다. CI는 lint, typecheck, unit·integration test, coverage, GraphQL compatibility, Expo Doctor, iOS·Android export, Maestro, secret scan을 수행한다. 실제 cloud account, provider 계약, signing, 실기기, production 부하·관측 증거는 준비되지 않았다고 명시한다.

공고 연결: 품질 기준을 코드와 문서로 명시한 점은 강점이다. AWS, Argo CD, Datadog, Sentry를 “운영했다”고 쓰면 과장이다. 현재는 설계·구성과 일부 local/CI 검증 경험이다.

### 6.6 부분 성공과 데이터 신뢰도를 계약으로 표현

두 판매처를 함께 검색할 때 한 곳이 실패해도 성공한 결과를 버리지 않는다. 각 판매처를 한 번 재시도한 뒤 실패한 ID를 `unavailableProviderIds`로 AI adapter까지 전달하고, 모든 판매처가 실패한 경우에만 요청 전체를 실패시킨다. 재고는 boolean만으로 표현하지 않고 `IN_STOCK`·`OUT_OF_STOCK`·`UNKNOWN`을 GraphQL과 저장 snapshot에 보존한다.

공고 연결: commerce 데이터의 불완전성을 UI 문구, generated GraphQL type, cache migration, AI tool 결과까지 일관되게 다룬 사례다. 실제 판매처 SLA나 재고 정확도를 측정한 결과는 아니다.

## 7. 공고 요구사항 매핑

| 공고 요구                      | 프로젝트 근거                                                       | 근거 강도 | 지원 서류 표현                                            |
| ------------------------------ | ------------------------------------------------------------------- | --------- | --------------------------------------------------------- |
| React·React Native             | Expo React Native 앱과 feature 단위 component                       | 강함      | 모바일 interaction을 React Native로 구현                  |
| TypeScript·JavaScript          | FE·BE 전반 TypeScript, schema·runtime validation                    | 강함      | TypeScript 기반 end-to-end 계약 구현                      |
| GraphQL                        | Apollo Client, NestJS GraphQL, generated schema, compatibility gate | 강함      | canonical GraphQL contract와 codegen 관리                 |
| 사용자 경험 관심               | 중지·편집, quick action, segmented control, Drawer, accessibility   | 강함      | 관찰한 friction을 interaction 단위로 재설계               |
| 문제를 발견·분석하고 제안      | 원본 사용 관찰 → 가설 → 구현 → claim boundary                       | 강함      | 사용자 행동과 navigation·stream lifecycle로 문제 분해     |
| 설계부터 출시까지 주도         | mobile, backend, CI, release gate를 한 기능으로 연결                | 강함      | UI부터 cancel API와 regression gate까지 연결              |
| 빠른 개발·배포                 | 작은 PR, 자동 gate, deterministic E2E                               | 보통 이상 | 작은 변경 단위와 자동 검증으로 merge 가능 상태 유지       |
| commerce·apptech               | 상품 검색·추천·가격·찜·구매 링크, retailer filter                   | 강함      | 대화형 commerce 탐색 구현                                 |
| 자동화·생산성                  | GitHub Actions, Maestro, 고정 E2E runner                            | 강함      | 외부 credential 없는 핵심 UX CI 구성                      |
| AWS·Argo CD·Datadog·Sentry     | infra·observability config와 runbook                                | 제한적    | 설계·구성 경험으로 한정, production 운영은 미검증         |
| HTML·CSS의 깊은 이해           | React Native·Unistyles 중심                                         | 약함      | 이 프로젝트로는 web DOM·CSS 역량을 증명하지 않음          |
| Relay·React Query·MobX·zustand | Apollo·TanStack AI·React state 사용                                 | 대체 경험 | 상태·server cache 원리는 설명하되 사용 경험을 꾸미지 않음 |
| AI 개발 도구 활용              | 저장소 결과만으로 개발 과정의 AI 도구 활용 수준을 확인하기 어려움   | 미확인    | 실제 사용 방식과 검증·리뷰 사례를 별도 경험으로 준비      |
| 1년 이상 또는 동등 역량        | 저장소만으로 경력 기간 확인 불가                                    | 미확인    | 이력서의 실제 경력·다른 프로젝트로 별도 증명              |
| 실제 고객·사업 임팩트          | 사용자·매출 지표 없음                                               | 약함      | 검증된 엔지니어링 결과와 향후 측정 계획을 분리            |

## 8. 프로젝트 기준 적합도

이 점수는 지원자 전체의 합격 가능성이 아니다. 현재 저장소와 이 문서만으로 공고에 얼마나 답할 수 있는지를 평가한다.

| 항목             |   점수 | 근거                                                                                              |
| ---------------- | -----: | ------------------------------------------------------------------------------------------------- |
| 기술 스택 매칭   | 8.0/10 | React Native, TypeScript, GraphQL, GitHub Actions는 강하다. HTML·CSS, Relay는 직접 증거가 약하다. |
| 경험 연관성      | 9.0/10 | AI shopping agent, commerce mobile UX, 실패 복구·부분 성공 계약과 release gate가 역할과 가깝다.  |
| 경력 수준 적합성 | 4.0/10 | 저장소만으로 1년 이상 경력이나 조직 협업 기간을 증명할 수 없다.                                   |
| 공고 키워드 밀도 | 6.0/10 | 기술 문서는 충분하지만 고객 문제, 판단, 임팩트 언어가 기존 README에는 적다.                       |
| 산업·도메인 경험 | 8.5/10 | commerce·추천·상품 탐색과 app experience가 직접 연결된다. 실제 사업 운영은 없다.                  |

- 공고 방식의 가중 종합: **7.5/10, ★★★★☆**
- 경력 기간 항목을 제외한 프로젝트 자체 적합도: **약 8.3/10**

현재도 지원 자료로 사용할 수 있는 강한 프로젝트다. 점수를 가장 크게 깎는 요소는 코드 완성도가 아니라 실제 고객 검증과 경력 기간 증거의 부재다. 다른 경력에서 이 두 항목을 채울 수 있다면 프로젝트의 역할은 기술과 문제 해결 방식을 보여주는 데 집중하면 된다.

## 9. 사실과 표현의 경계

### 그대로 말해도 되는 사실

- 원본 앱을 사용하며 특정 UX 현상을 관찰했다.
- AI 실행 중지와 메시지 편집 진입을 구현했다.
- cancel을 frontend, API, database terminal state, provider abort까지 연결했다.
- 취소 뒤 같은 메시지를 중복 저장하지 않고 새 run으로 재검색하거나 질문을 composer에서 수정할 수 있다.
- background·offline 상태에서 resume pointer를 보존하고 reconnect 때 같은 stream에 다시 join한다.
- 판매처 일부 실패 시 성공 결과와 실패 판매처 ID를 함께 보존한다.
- 재고를 구매 가능·품절·확인 필요로 구분하고 관찰 시각의 신선도를 표시한다.
- quick action을 빈 conversation·빈 input에서만 나타나는 horizontal label로 구현했다.
- 채팅과 상품 segmented control을 만들고 상태를 보존했다.
- Expo Router Drawer와 swipe 종료 뒤 underlying tab 보존을 Maestro로 검증했다.
- 기존 병합 revision의 Android API 34 CI에서 당시 Maestro 3개 flow가 통과했다. terminal recovery의 재시도·재취소 경합 수정은 frontend PR #35에, AOSP 키보드 권한 팝업 처리는 PR #36에 병합됐고 root PR #27의 최종 Maestro 재검증은 남아 있다.
- 기존 병합 revision의 iOS 시뮬레이터에서 당시 같은 세 흐름을 수동 실행했다.
- 기존 CI가 생성한 JUnit·screenshot·log artifact가 있다.

### 가설로만 말해야 하는 문장

- 사용자가 AI 작업을 더 잘 통제할 것이다.
- 대화 맥락을 다시 찾는 시간이 줄어들 것이다.
- quick action이 첫 질문 작성 시간을 줄일 것이다.
- platform affordance가 iOS 사용자에게 더 익숙할 것이다.
- 자동 E2E가 release regression 비용을 낮출 것이다.

가설을 말할 때는 “이 문제를 줄일 것으로 보고 설계했다”라고 쓰고, 바로 뒤에 검증 방법을 붙인다.

### 쓰면 안 되는 문장

- “이탈률을 낮췄다”, “전환율을 높였다”, “매출에 기여했다”
- “실사용자에게 검증했다”, “production에서 안정성을 검증했다”
- “원본 쇼포트의 내부 navigation 구조가 정확히 이렇다”
- “Maestro로 Drawer 애니메이션 방향과 부드러움을 검증했다”
- “과거 대화를 rollback하고 분기한다”
- “Swift·SwiftUI로 네이티브 앱을 개발했다”
- “AWS·Argo CD·Datadog을 production에서 운영했다”

## 10. 지원 서류용 원재료

아래 문장은 최종 제출본이 아니라 사실을 압축한 후보 문장이다. 이력서에는 두세 개만 고르고, 포트폴리오에서는 문제와 증거를 펼쳐 쓴다.

### 프로젝트 한 줄 소개 후보

> 공개 앱 사용 과정에서 발견한 AI 쇼핑 에이전트의 대화 단절과 navigation 문제를 분석하고, React Native·NestJS·GraphQL로 사용자 제어가 가능한 모바일 경험과 자동 회귀 검증을 구현한 독립 프로젝트

### 이력서 bullet 재료

- AI 검색 중 입력과 중단 경로가 사라지는 흐름을 conversation state로 재설계하고, 응답 중지·이전 질문 편집·재전송 UI를 backend의 멱등 cancel과 provider abort까지 연결
- 취소 뒤 질문 수정·동일 질문 재검색을 terminal recovery로 제공하고, 같은 user message에 새 run만 연결하는 계약으로 대화 중복 없이 복구
- background·offline 전환에서도 SQLite resume pointer를 보존하고 reconnect 시 stream을 1회 재join하도록 stale write 경합을 방어
- 다중 판매처 검색을 부분 성공으로 모델링하고 실패 판매처를 AI 결과에 명시하며, 재고 미확인을 품절과 구분해 확인 시각과 함께 표시
- 큰 Home 질문 카드를 빈 대화·빈 input에서만 노출되는 horizontal quick action으로 바꾸고, 선택 prompt를 자동 실행하지 않는 편집 가능한 draft로 제공
- 상품 결과만 남던 탐색을 `채팅/상품` segmented control로 재구성하고, streaming 중에도 대화와 recommendation state 및 unread 상태를 보존
- navigation history처럼 보이던 메뉴 상호작용을 Expo Router Drawer로 재구성하고, swipe close 뒤 underlying 상품 탭이 유지되는 흐름을 Maestro로 고정
- 외부 Kakao·catalog·AI credential 없이 재현 가능한 deterministic API runner를 만들고 핵심 agent UX 3개를 Android API 34 GitHub Actions gate로 자동화
- GraphQL compatibility, FE·BE unit·integration test, Expo export, secret scan, Maestro를 release gate로 묶고 실제 provider·실기기·production 검증은 별도 항목으로 명시

### 포트폴리오 구성안

1. **프로젝트 정체성**: 공식 제품이 아닌 독립 UX 분석·재구현임을 먼저 밝힌다.
2. **관찰 증거**: `IMG_3251.PNG`, `IMG_3252.PNG`와 짧은 화면 녹화에 문제 위치를 표시한다.
3. **문제 정의**: “ChatGPT처럼 만들기”가 아니라 대화 연속성, 실행 통제권, 탐색 맥락, mobile navigation 네 가지로 정리한다.
4. **핵심 설계**: before/after flow와 state diagram으로 stop·edit·quick action·segmented control·Drawer를 보여준다.
5. **구현 깊이**: 중지 버튼부터 cancel API, terminal state, provider abort까지 한 세로 단면으로 설명한다.
6. **검증**: unit·integration·Maestro가 각각 무엇을 증명하고 무엇을 증명하지 않는지 표로 보여준다.
7. **공고 연결**: 고객 문제를 발견하고 설계부터 release gate까지 맡은 방식만 한 장으로 정리한다.
8. **한계와 다음 실험**: 실제 사용자 임팩트가 없음을 밝히고 측정 계획과 우선순위를 제시한다.

### 자기소개서 소재 카테고리

공고에 별도 자기소개서 문항과 글자 수 제한은 확인되지 않았다. 실제 작성 단계에서는 다음 세 소재 중 두세 개를 선택할 수 있다.

| 카테고리       | 사용할 경험                                     | 공고 연결                                     | 빠뜨리면 안 되는 한계                        |
| -------------- | ----------------------------------------------- | --------------------------------------------- | -------------------------------------------- |
| 고객 문제 발견 | AI 실행 중 통제권과 대화 맥락이 사라지는 현상   | 실제 고객 문제를 먼저 정의하는 Problem Solver | 사용자 조사와 지표가 아닌 직접 관찰에서 출발 |
| 끝까지 구현    | 중지 UI에서 멱등 cancel·provider abort까지 연결 | 아키텍처부터 출시까지 전체 사이클             | production 트래픽 검증은 없음                |
| 개발 생산성    | deterministic backend와 Maestro CI              | 자동화·최적화, 빠른 배포                      | 애니메이션 품질은 manual evidence가 필요     |

지원동기나 입사 후 기여 문단은 이 근거 문서에서 확정하지 않는다. 실제 이력과 레브잇에서 맡고 싶은 문제를 정한 뒤 별도로 쓴다.

### 면접에서 받을 가능성이 높은 질문

#### “왜 ChatGPT 같은 UI를 만들었나요?”

특정 앱의 외형을 따라 한 것이 아니라고 답한다. 에이전트가 오래 걸리는 작업을 수행할 때 필요한 progress, cancel, revise, context recovery를 기준으로 설계했다고 설명한다. 그중 현재 구현은 cancel과 edit-to-draft, conversation continuity까지이며 semantic progress는 다음 과제라고 선을 긋는다.

#### “실제로 문제였다는 근거가 있나요?”

직접 사용한 화면과 재현 절차는 있지만 사용자 조사와 product metric은 없다고 먼저 말한다. 관찰을 가설로 바꾸고, 코드·E2E로 구현의 정확성만 검증했다고 답한다. 실제 효과를 확인하려면 task-based usability test와 event measurement가 필요하다고 덧붙인다.

#### “Drawer 문제를 E2E로 어떻게 확인했나요?”

애니메이션을 자동 검증했다고 말하지 않는다. 상품 탭에서 Drawer를 연 뒤 swipe close하고 같은 상품 탭이 남는지를 확인해 stack pop·screen reset 회귀를 막았다고 설명한다. 닫힘 방향과 interactive motion은 화면 녹화와 실기기 확인 항목이다.

#### “메시지 편집은 대화를 되돌리나요?”

아니다. 생성 중이면 run을 먼저 취소하고 과거 질문을 composer에 복사한다. history branching이나 이후 메시지 삭제는 구현하지 않았다. 사용자의 수정 비용을 낮추는 첫 단계이며, branching이 필요하다는 데이터가 생기면 별도 모델을 설계한다고 답한다.

#### “왜 backend까지 만들었나요?”

local UI만 멈추면 provider 작업과 비용이 계속될 수 있고, 다른 account의 run을 취소하는 보안 문제도 남는다. 사용자 통제권을 실제 시스템 동작으로 만들려면 ownership, idempotency, terminal state, abort까지 필요했다고 설명한다.

#### “가장 아쉬운 점은 무엇인가요?”

실제 사용자 지표가 없다는 점과 agent progress를 사용자 언어로 보여주지 못한 점을 고른다. 이를 감추지 않고 다음 검증 계획으로 연결한다.

## 11. 다음 업그레이드 우선순위

### P0. 지원 자료의 증거를 완성

코드 추가보다 먼저 해야 할 일이다.

1. 원본 화면 두 장에 문제 지점을 표시한다.
2. 본 프로젝트에서 동일한 task를 수행하는 30~60초 화면 녹화를 만든다.
3. `중지→편집`, `quick action→draft`, `채팅↔상품`, `Drawer swipe close` 네 영상을 분리한다.
4. 각 영상에 OS, device/simulator, build SHA, 검증 날짜를 붙인다.
5. Drawer 영상은 손가락을 따라 닫히는 방향과 underlying tab 보존을 한 번에 보여준다.

이 작업이 끝나면 “내가 무엇을 바꿨는가”를 코드에 익숙하지 않은 채용 담당자도 바로 이해할 수 있다.

### 완료. 취소 후 recovery와 실패 상태 모델링

cancel terminal 안내, 질문 수정, 동일 메시지의 새 run 재검색, background persistence, reconnect join, 판매처 부분 실패, 재고 `UNKNOWN`, cancel/complete database 경합 검증을 frontend·backend `develop`에 병합했다. 재시도 도중 다시 취소했을 때 recovery action이 잠기는 경합도 frontend PR #35에서 수정했고, Android CI의 키보드 시스템 팝업은 PR #36에서 처리했다. 각 저장소 CI는 통과했으며 root PR #27의 통합 Maestro 최종 재검증은 남아 있다. 이는 실제 사용자 임팩트가 아니라 예방적 검증이다.

### P1. 사용자에게 이해되는 에이전트 진행 상태

사용자가 AI가 무엇을 하는지 알 수 있는 semantic progress는 아직 약하다. 내부 chain-of-thought나 raw tool name을 노출하지 않고 다음 공개 상태만 제공하는 것이 좋다.

- 요청 이해 중
- 상품 검색 중
- 조건 비교 중
- 추천 정리 중
- 사용자가 중지함

다음 acceptance criteria는 공개 progress가 실제 backend/tool phase와 일치하고, reconnect 뒤 중복되거나 역행하지 않으며, 완료·실패·취소 시 terminal 상태로 끝나는 것이다.

### P1. 측정 가능한 가설과 event contract 추가

실제 배포가 어렵더라도 무엇을 측정할지는 코드와 문서로 정의할 수 있다. event에는 prompt 원문이나 상품 구매 URL 같은 개인정보를 넣지 않는다.

| 가설                                    | event 예시                                               | 판단 지표                                       |
| --------------------------------------- | -------------------------------------------------------- | ----------------------------------------------- |
| quick action이 첫 질문 작성을 돕는다    | impression, prompt_selected, draft_edited, sent          | 노출 대비 전송률, 선택 후 수정률, 전송까지 시간 |
| 중지·편집이 잘못된 탐색의 복구를 돕는다 | run_started, cancel_requested, composer_restored, resent | cancel latency, 취소 후 재전송률                |
| segmented control이 맥락 회복을 돕는다  | tab_changed, product_focused, message_revisited          | 상품 확인 뒤 채팅 복귀율, 조건 수정률           |
| Drawer가 현재 작업을 보존한다           | drawer_opened, drawer_closed, route_changed              | close 뒤 conversation·tab state 보존율          |

데이터가 없을 때는 빈 dashboard를 만들지 않는다. 먼저 event schema와 privacy rule, local debug sink, 분석 query 예시까지만 만들고 “측정 준비”로 표현한다.

### P1. 카테고리별 shopping brief와 추천 근거

현재 `AskUser`는 구조화된 추가 질문을 지원하지만 카테고리별 구매 판단 모델까지 보여주지는 못한다. 레브잇이 설명한 category agent와 더 가까워지려면 대화에서 다음 shopping brief를 만들고 사용자가 확인·수정할 수 있게 하는 편이 좋다.

- 공통: 예산, 사용 목적, 반드시 필요한 조건, 포기할 수 있는 조건
- 뷰티: 피부 타입, 고민, 피해야 할 성분, 선호 texture
- 생활용품: 크기, 재질, 설치 환경, 반복 구매 여부
- 전자제품: 사용 환경, 핵심 specification, 호환성, 성능과 가격의 우선순위

추천 결과에는 “어떤 조건을 충족했는지”, “어떤 조건은 타협했는지”, 가격을 언제 어느 provider에서 확인했는지를 표시한다. 내부 reasoning을 노출하는 것이 아니라 구매 판단에 필요한 검증 가능한 근거를 보여주는 기능이다.

실제 provider가 제한된 상태에서는 live coverage를 과장하지 않는다. category별 fixture query와 예상 추가 질문·constraint coverage를 evaluation set으로 만들고, 승인된 provider가 생긴 뒤 recommendation quality 지표로 확장한다.

### P1. 작은 usability test

배포하지 못하더라도 로컬 기기나 시뮬레이터를 사용한 moderated test는 가능하다. 참여자를 구하기 어렵다면 본인이 수행하는 cognitive walkthrough부터 기록한다.

- task A: 조건이 잘못된 검색을 중지하고 질문을 고쳐 다시 보낸다.
- task B: 추천 상품을 본 뒤 어떤 조건으로 찾았는지 확인한다.
- task C: 상품 탭에서 메뉴를 열었다 닫고 원래 화면으로 돌아온다.
- task D: quick action을 골랐다가 문장을 수정해 보낸다.

측정값은 completion 여부, 첫 오류 지점, 수행 시간, 발화 기록이다. 참여자가 없으면 결과를 사용자 연구라고 부르지 않고 self-walkthrough로 표시한다.

### P2. mobile 성능·접근성 증거

- 실제 iPhone과 Android에서 cold start, chat list frame time, stream 중 dropped frame, memory를 같은 시나리오로 기록한다.
- Dynamic Type 최대 단계, VoiceOver·TalkBack, Reduce Motion·Transparency, keyboard, rotation을 수동 matrix로 검증한다.
- 성능 개선 전후 수치는 같은 device와 build mode로 비교한다.
- iOS Maestro CI는 macOS runner 비용과 유지비가 정당화될 때 추가한다. 현재는 Android CI와 iOS 수동 evidence면 충분하다.

### P2. 가정이 명시된 synthetic 검증

[“이력서에 문제 해결을 쓸 수가 없어요”](https://www.youtube.com/watch?v=4DeRhvTAMj8)의 핵심처럼 배포할 수 없는 프로젝트에서는 실제 트래픽을 꾸미지 않고 가정을 밝힌 예방 검증을 할 수 있다.

예를 들어 “동시 AI run 100개, 10%가 5초 안에 취소를 요청한다”는 가정을 세우고 local API 한 instance에서 cancel latency, 남은 provider 작업, database terminal state를 측정한다. 결과는 “실사용자 100명을 처리했다”가 아니라 “가정한 workload를 local 환경에서 재현했다”라고 쓴다.

### 지금 추가하지 않아도 되는 것

- 실제 traffic이 없는데 A/B testing platform부터 만드는 일
- 동작 증거 없이 AWS·Kubernetes 구성만 더 늘리는 일
- business metric처럼 보이는 임의 숫자와 dashboard
- 원본 앱의 visual을 더 정교하게 복제하는 일
- Drawer animation의 방향을 Maestro assertion만으로 증명하려는 일

현재 가장 큰 개선 여지는 새로운 인프라가 아니라 agent progress·recovery, 측정 계약, before/after 증거다.

## 12. 제출 전 체크리스트

- [ ] 프로젝트를 독립 UX 분석·재구현이라고 밝혔는가
- [ ] “ChatGPT처럼 보이게 했다”는 표현을 제거했는가
- [ ] 실제 임팩트와 기대 효과를 구분했는가
- [ ] Drawer의 state 검증과 animation 수동 검증을 구분했는가
- [ ] 메시지 편집을 history rollback이라고 과장하지 않았는가
- [ ] AWS·Argo CD·Datadog·Sentry를 production 운영 경험처럼 쓰지 않았는가
- [ ] 사용한 bullet마다 code, test, PR 중 하나 이상의 근거가 있는가
- [ ] 지원 서류마다 핵심 사례를 두세 개만 선택했는가
- [ ] 원본·개선 화면의 build와 환경을 기록했는가
- [ ] 면접에서 미검증 항목을 먼저 말할 준비가 되었는가

## 13. 근거 목록

### 프로젝트

- [통합 README](../../README.md)
- [아키텍처](../architecture.md)
- [테스트·출시 게이트](../release-gates.md)
- [개인정보와 데이터 수명주기](../privacy-lifecycle.md)
- [full-stack quality PR #20](https://github.com/cyjoon68/shopport-app/pull/20)
- [chat message actions PR #21](https://github.com/cyjoon68/shopport-app/pull/21)
- [mobile Maestro flow PR #24](https://github.com/cyjoon68/shopport-app/pull/24)
- [Maestro CI PR #25](https://github.com/cyjoon68/shopport-app/pull/25)
- [failure recovery frontend PR #34](https://github.com/cyjoon68/shopport-fe/pull/34)
- [retry recovery race fix frontend PR #35](https://github.com/cyjoon68/shopport-fe/pull/35)
- [Maestro keyboard permission handling frontend PR #36](https://github.com/cyjoon68/shopport-fe/pull/36)
- [failure recovery backend PR #23](https://github.com/cyjoon68/shopport-be/pull/23)
- [failure recovery integration root PR #27](https://github.com/cyjoon68/shopport-app/pull/27)
- [Maestro failure diagnostic run 33320550872](https://github.com/cyjoon68/shopport-app/actions/runs/33320550872)
- [검증 완료 GitHub Actions run](https://github.com/cyjoon68/shopport-app/actions/runs/33163261017)

### 원본 관찰 자료

- `/Users/cyjoon/Downloads/IMG_3251.PNG`: Home의 큰 질문 카드와 composer
- `/Users/cyjoon/Downloads/IMG_3252.PNG`: 선택 뒤 세로로 펼쳐지는 질문 label
- 직접 관찰: Home 질문 전송 뒤 별도 AI 검색 화면, 실행 중 취소·수정 불가
- 직접 관찰: Drawer에서 왼쪽 swipe 시 Drawer close가 아니라 이전 Home으로 이동

원본 캡처는 제3자 제품 화면이므로 공개 포트폴리오에 사용할 때 출처와 분석 목적을 표시하고 필요한 부분만 인용한다.

### 회사·공고

- [Wanted 채용공고](https://www.wanted.co.kr/wd/339807)
- [Problem Solver 채용공고 톺아보기](https://blog.alwayz.co/ps)
- [코드를 넘어 비즈니스를 봅니다](https://blog.alwayz.co/sy)
- [프로덕트와 조직의 성장에 직접 기여한다는 것](https://blog.alwayz.co/yhl)
- [AI-oriented 엔지니어링 조직으로 나아갑니다](https://blog.alwayz.co/levin)
- [이력서에 문제 해결을 쓸 수가 없어요](https://www.youtube.com/watch?v=4DeRhvTAMj8)
