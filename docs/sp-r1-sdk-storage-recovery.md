# SP-R1 실제 SDK·저장 경계 복구 검증 결과

- 검증일: 2026-09-06
- 대상: `shopport-app` 개인 재구현
- 상태: 완료 — 결정적 fixture 5/5 통과
- 기준 SHA: root `d8d24f4962f47db3c616cfde59d685a0b2315387`, FE `46c0ca8fe807765c1c333fca3a757cbaa5748780`, BE `21ebea61eea59e6fa4997fc9dc75ee23e26dc9b7`
- 검증 대상 SHA: root `f96c2f04efb66c0fd63e7703cdcdab59bb7882f4`, FE `0a22b11c901445192f336a850bfce6c2f3b68122`, BE `284d8a7fda6d0d69b754ea2e068ddd8c7178d467`
- 증거 실행: [GitHub Actions 34016950595](https://github.com/cyjoon68/shopport-app/actions/runs/34016950595), 전체 job 성공

## 결론

설치된 SDK의 `offset=-1` 초기 join 요청을 바꾸지 않고 GET resume 경계만 호환 처리했습니다. API 34 Pixel 7 x86_64 Android 에뮬레이터에서 S1·S2·S4·S5·S7을 같은 고정 fixture로 5회 반복했고 모두 통과했습니다. S3·S6도 각각 5회 반복 계약 테스트를 통과했습니다.

확인한 범위에서 첫 이벤트 누락, 결과 중복, 상품 누락, A/B 초안 오염, 취소 run resume 복원은 모두 0건입니다. S4는 실제 LocalStack 객체와 SQLite 기록 완료 뒤 같은 설치에서 재실행 복원을 확인했고, S7은 실패한 새 값 5건이 영속화되지 않고 직전 값이 재실행 뒤에도 유지됨을 확인했습니다. 성능 개선이나 임의 종료 시점 전체의 무손실은 주장하지 않습니다.

## 기준 재현과 최소 수정

설치된 `@tanstack/ai-client`의 `xhrHttpStream.joinRun`은 인증 헤더를 유지한 채 `GET /v1/ai/chat?offset=-1&runId=…`를 생성했습니다. 기준 BE 테스트는 `-1`을 잘못된 외부 offset으로 분류했고 공용 parser도 음수를 거부해, 기준 SHA 조합의 계약 불일치를 재현했습니다. 수정 후에는 SDK 요청을 `offset=0`으로 바꾸지 않고, GET resume에서 헤더가 없고 query가 정확히 `-1`인 경우에만 내부 시작 cursor `0`으로 변환했습니다. Android 원자료는 같은 SDK run ID의 실제 cold GET과 첫 envelope 수신까지 기록합니다.

다음 기존 구조는 유지했습니다.

- FE 전용 transport adapter를 만들지 않았습니다.
- SDK, 상태 관리, DB, migration을 교체하거나 추가하지 않았습니다.
- POST replay, 소유권 검사, 공용 offset parser, 취소 single-flight, generation guard, draft flush와 SQLite 병합을 재사용했습니다.
- fixture의 단절·지연·SQLite 실패만 테스트 경로에 두고 정상 제품 코드를 느리게 하지 않았습니다.

추가로 실제 경계를 검증하면서 두 가지 문제를 수정했습니다.

- 만료된 run은 이벤트 잔존 여부와 무관하게 stream 전에 `410 Gone`으로 종료하고 FE resume를 지웁니다.
- PostgreSQL event ID를 문자열 사전순이 아니라 숫자순으로 replay해 10개가 넘는 이벤트의 순서를 보존합니다.

## 고정한 SDK와 실행 환경

| 항목 | 값 |
| --- | --- |
| SDK | `@tanstack/ai-client@0.23.2` |
| SDK source | `src/connection-adapters.ts` |
| SDK source SHA-256 | `5e0976af2d147c20b3c1b3b3c32f1807776896f344489eb444f8726839a919e5` |
| 패키지 고정 | FE `pnpm-lock.yaml`, `pnpm install --frozen-lockfile` |
| Android | GitHub Actions emulator, Pixel 7 profile, API 34, x86_64 |
| 앱 | Expo development client, debug, Metro 사용 |
| 런타임 | Node.js 22.13.0, pnpm 11.20.0, Java 17 |
| 서버 저장소 | PostgreSQL 17 Alpine |
| 객체 저장소 | LocalStack 4.3.0 S3, `shopport-assets-raw` |
| 단말 저장소 | 앱 sandbox의 `files/SQLite/shopport.db`, device SQLite 3.39.2 |
| 증거 job 실행 시간 | 59분 27초; 측정 뒤 timeout 여유를 75분으로 조정 |

Node의 XHR contract shim 검사는 native 전송 증거가 아니라 설치 SDK가 만드는 URL·헤더·재시도 계약을 고정하는 보조 계약 테스트로만 사용했습니다. 대표 S1·S2·S4 경로의 최종 판정은 위 Android 에뮬레이터에서 수행합니다.

## S1–S7 결과표

| ID | 사건 순서 | 기대값 | 실측값 | 계층 | 반복 | 판정·증거 |
| --- | --- | --- | --- | --- | --- | --- |
| S1 | 소유 run 생성 → 화면 재진입 → 설치 SDK 초기 join | SDK가 만든 `offset=-1` URL 그대로 도달, 첫 이벤트 수신 | 5회 모두 cold GET이 `offset=-1`, replay header·`x-run-id` 없음; initial/cold 첫 envelope ID 일치 | 설치 SDK → native XHR → NestJS → PostgreSQL | 5회 | 통과 |
| S2 | 상품 5개·분할 설명 → 8번째 event 뒤 단절 → hot retry 종료 → cold join | 같은 run, 12개 event 순서, 최종 텍스트와 상품 ID 5개 일치, 중복·누락 0 | 5회 모두 동일 run, event 12개 숫자순, 텍스트·상품 ID 5개 일치, 중복·누락 0 | native UI·SDK·proxy·PostgreSQL·SQLite | 5회 | 통과 |
| S3 | A 취소 응답 2초 보류 → B 실행 → A 응답·event 도착 | B가 중지되거나 A 내용으로 바뀌지 않음 | fake timer 1,999ms/1ms 경계와 SDK normalization의 늦은 A content/error를 차단 | FE hook·HTTP cancellation unit | 5회 반복 통과 | 통과 |
| S4 | 초안·합성 사진 첨부 → background → SQLite commit 관측 → force-stop·재실행 | 같은 대화의 text·asset ID·같은 설치 URI 복원, 실제 LocalStack S3 object 존재 | 5회 모두 `s4-draft-N`·asset ID·URI가 background/relaunch에서 일치; LocalStack HEAD가 PNG 425 byte 확인 | ImagePicker → GraphQL presign → LocalStack PUT → SQLite → native UI | 5회 | 통과 |
| S5 | A/B 초안 생성 → 빠른 A→B 전환 → 취소 후 retry 완료 | A/B 오염 0, 취소 run과 완료 run 구분, terminal resume 0 | 5회 모두 전환 전후 A/B row 동일; 취소/완료 run ID 분리; 완료 SQLite resume 없음 | FE Promise 경합 unit + native SQLite/UI + PostgreSQL | 5회 | 통과 |
| S6 | 만료 run, 타 계정 run, 잘못된 header·offset | 권한·입력 차단 유지, 만료 410, 재시도 1회에서 종료, 복구 불가 안내와 resume 제거 | `-2`, `42-0`, `+1`, `1.5`, `9223372036854775808`, 잘못된 header/POST 차단; 타 계정 404; 만료 410; SDK 요청 1회; FE 안내·resume 제거 | SDK contract·FE·NestJS·PostgreSQL | 5회 반복 통과 | 통과 |
| S7 | 정상 draft 저장 → fixture trigger 설치 → 새 draft INSERT 실패 → force-stop·재실행 | 실패 시 새 값을 성공으로 영속화하지 않고 직전 값 보존 | 5회 모두 exact audit 1건, `s7-after-N` 미영속화, `s7-before-N` 실패 직후·재실행 뒤 보존 | native SQLite `BEFORE INSERT` audit + `RAISE(FAIL)` | 5회 | 통과 |

## 외부 replay 계약

| 입력 | 결과 |
| --- | --- |
| GET, header 없음, query `offset=-1` | 이 경계에서만 내부 `0`으로 해석 |
| GET, header 없음, query `0` 또는 유효 양수 | 기존 동작 유지 |
| 유효 `Last-Event-ID` | query보다 우선 |
| 잘못된 `Last-Event-ID` + 유효 query | header 오류를 query로 숨기지 않고 400 |
| query `-2`, 소수, 비정규 형식, 64-bit 범위 초과 | 400 |
| POST의 잘못된 replay header | 400 |
| 다른 계정의 run | 존재를 숨기며 404 |
| 시작 후 1시간이 지난 run | stream 전에 410, SDK 무한 재시도 없음 |

## 최종 Android 반복 실측

성공 실행의 5개 `attempt-N/result.json`과 `complete-state.json`을 독립적으로 다시 읽어 아래 값을 집계했습니다.

| 시도 | S1/S2 run 동일 | 요청 순서 | event | 중복/누락 | S4 재실행 복원 | S5 격리·terminal | S7 직전 값 보존 | 결과 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 일치 | `POST→POST(8)→GET(-1)` | 12 (`1–12`) | `0/0` | text·asset·URI 일치 | A/B 동일·run 분리·resume 0 | `s7-after-1` 거부, `s7-before-1` 복원 | 통과 |
| 2 | 일치 | `POST→POST(34)→GET(-1)` | 12 (`27–38`) | `0/0` | text·asset·URI 일치 | A/B 동일·run 분리·resume 0 | `s7-after-2` 거부, `s7-before-2` 복원 | 통과 |
| 3 | 일치 | `POST→POST(60)→GET(-1)` | 12 (`53–64`) | `0/0` | text·asset·URI 일치 | A/B 동일·run 분리·resume 0 | `s7-after-3` 거부, `s7-before-3` 복원 | 통과 |
| 4 | 일치 | `POST→POST(86)→GET(-1)` | 12 (`79–90`) | `0/0` | text·asset·URI 일치 | A/B 동일·run 분리·resume 0 | `s7-after-4` 거부, `s7-before-4` 복원 | 통과 |
| 5 | 일치 | `POST→POST(112)→GET(-1)` | 12 (`105–116`) | `0/0` | text·asset·URI 일치 | A/B 동일·run 분리·resume 0 | `s7-after-5` 거부, `s7-before-5` 복원 | 통과 |

괄호 안 POST 값은 각 run의 8번째 event cursor이며 hot retry의 `Last-Event-ID`와 일치합니다. 요청 순서는 매회 `POST initial` → `POST hot-retry` → `GET cold-join(offset=-1, replay header 없음)`이었고, 앱 복귀는 새 질문 POST가 아니라 같은 run GET join이었습니다.

## 회귀 검증

| 범위 | 명령 또는 CI 작업 | 결과 |
| --- | --- | --- |
| root 계약 | `node --test scripts/android-recovery-proxy.test.mjs scripts/sdk-join-run-boundary.test.mjs scripts/sdk-transport-recovery.test.mjs scripts/verify-android-recovery.test.mjs` | 11/11 통과; S2 내부 반복 5/5 |
| FE | check, coverage, codegen diff, doctor, web build | [FE CI 34015566566](https://github.com/cyjoon68/shopport-fe/actions/runs/34015566566) 통과 |
| BE | check, unit coverage, build, container | [BE CI 33984511906](https://github.com/cyjoon68/shopport-be/actions/runs/33984511906) 통과 |
| root compatibility | FE·BE 회귀, GraphQL·submodule, schema compatibility | [root CI 34016950595](https://github.com/cyjoon68/shopport-app/actions/runs/34016950595) 통과 |
| BE integration | 실제 PostgreSQL 통합 suite | 같은 root CI에서 통과 |
| 보안 | gitleaks full-history | root·FE·BE CI 통과 |
| Android native | `scripts/run-maestro-android.sh` | S1·S2·S4·S5·S7 5/5와 기존 Maestro 3/3 통과 |

## 원자료

[성공 실행 34016950595](https://github.com/cyjoon68/shopport-app/actions/runs/34016950595)의 [`maestro-android` artifact 9985026898](https://github.com/cyjoon68/shopport-app/actions/runs/34016950595/artifacts/9985026898)은 2026-09-13까지 7일간 보존됩니다. 내려받은 30 MiB 원자료에는 `result.json` 5개, 실패 directory 0개, JUnit XML 56개와 failure 0개, SQLite snapshot hash 파일 50개와 DB/WAL/SHM SHA-256 150개가 있었습니다. Bearer token과 presigned credential·signature 패턴 일치는 0개였습니다. 성공 시 구조는 다음과 같습니다.

```text
environment.json
device-sqlite.txt
run-as.txt
proxy.ndjson
attempt-1..5/
  result.json
  arm.json
  hot-state.json
  stopped-state.json
  complete-state.json
  before-cold/ and after-cold/
    shopport.db, shopport.db-wal, shopport.db-shm
    sha256.txt, verification.json
  s4/
    after-background/, after-relaunch/, upload.json
    UI screenshot, hierarchy, logcat, JUnit
  s5/
    before-switch/, after-switch/, terminal/
    UI screenshot, hierarchy, logcat, JUnit
  s7/
    before-failure/, after-failure/, after-relaunch/
    UI screenshot, hierarchy, logcat, JUnit
maestro-api.log
recovery-proxy.log
```

원자료에는 합성 fixture만 사용하며 인증 token, 실제 사용자 질문·사진, presigned credential과 signature는 저장 전에 치환합니다. run/event 식별자와 상대 시각은 재현 판정을 위해 남깁니다.

핵심 집계 파일의 SHA-256은 다음과 같습니다. 개별 SQLite DB/WAL/SHM 해시는 각 snapshot의 `sha256.txt`에 있습니다.

| 파일 | SHA-256 |
| --- | --- |
| `environment.json` | `5301dbab561da6021cb9824987079965b04e53eb603859b7e3cd2496abc6912a` |
| `attempt-1/result.json` | `2deffff4232b15473cc3c887127967a28e6d09858e7e5f0c4be3f37b33974a3d` |
| `attempt-2/result.json` | `2c0e8e31de5654f5de434eddcfe6e11b3b0bcf514a47c25b256aac22f9c43485` |
| `attempt-3/result.json` | `9a6147241911bff3005129fa3b5d61a97d08f40f7938a6791a072dda444ea5e7` |
| `attempt-4/result.json` | `7d6f0b0b6f063b277a243e9621bee5542360a726b7c5b679e68e0bdb9f8a884f` |
| `attempt-5/result.json` | `8ca7991455bc1c685378893367c55675b4952692878c18584a3b367b582bb3b1` |

### 실패 표본

| 실행 | 관측 | 조치 | 제품 기능 판정 |
| --- | --- | --- | --- |
| [33984519397](https://github.com/cyjoon68/shopport-app/actions/runs/33984519397) | Metro bundle 완료 전에 Maestro가 development launcher home을 검사 | 앱 접근성 트리가 준비될 때까지 bounded wait | 제품 경계 미실행 |
| [33985333193](https://github.com/cyjoon68/shopport-app/actions/runs/33985333193) | Expo 최초 안내 `Continue`가 앱을 가림 | 기존 시작 흐름이 처리하도록 준비 상태에 포함 | 제품 경계 미실행 |
| [33987026962](https://github.com/cyjoon68/shopport-app/actions/runs/33987026962) | `Continue` 뒤 열린 dev menu의 실제 접근성 이름은 `Close` | 오래된 `xmark` selector 교체 | 제품 경계 미실행 |
| [33987911803](https://github.com/cyjoon68/shopport-app/actions/runs/33987911803) | 12개 event와 의도한 단절은 발생했으나 첫 text 조각 끝 공백 때문에 정확 문자열 assertion 실패 | partial text 정규식으로 판정 | 제품 경계는 정상, UI assertion만 실패 |
| [33988786827](https://github.com/cyjoon68/shopport-app/actions/runs/33988786827) | hot retry와 cold 이전 SQLite 검증은 통과했지만 force-stop 뒤 앱 딥링크가 JS 대신 development launcher home으로 이동 | `adb reverse`의 Metro URL로 dev client를 재연결한 뒤 앱 딥링크 전달 | cold join 이전 harness 실패 |
| [33989935288](https://github.com/cyjoon68/shopport-app/actions/runs/33989935288) | 재연결 intent의 `BROWSABLE` category를 Expo 57이 null category 집합에 복사하며 `createAppIntent:438` NPE | dev-client 재연결 intent에서 불필요한 category 제거, 오류 화면 즉시 중단 | cold join 이전 Expo harness 실패 |
| [33991636299](https://github.com/cyjoon68/shopport-app/actions/runs/33991636299) | 실제 cold GET과 최종 응답은 통과했지만 상품 탭 E2E가 제품 코드의 최신 우선 순서 `5→1` 대신 `1→5`를 가정 | 제품 순서를 바꾸지 않고 E2E 스크롤 순서를 실제 계약에 맞춤 | S1·S2 통과 후 UI assertion 실패 |
| [34011061951](https://github.com/cyjoon68/shopport-app/actions/runs/34011061951) | S1·S2와 terminal SQLite 검증 뒤 Android 14 Photo Picker 타일의 실제 접근성 이름 `Photo taken on …`을 기존 selector가 찾지 못했고 좌표도 타일 위쪽을 가리킴 | 실제 클릭 가능 접근성 노드를 기다려 직접 선택 | S1·S2 통과 후 S4 picker harness 실패 |
| [34011891695](https://github.com/cyjoon68/shopport-app/actions/runs/34011891695) | Photo Picker 선택과 첨부 복귀는 통과했지만 복원된 기존 질문을 지우지 않은 채 fixture 초안을 커서에 삽입 | 기존 draft 교체 E2E와 같은 `eraseText`를 재사용 | S1·S2 통과 후 S4 입력 준비 harness 실패 |
| [34012723937](https://github.com/cyjoon68/shopport-app/actions/runs/34012723937) | `eraseText`가 복원된 cursor 앞만 지워 뒤쪽 `아줘`를 남김 | 첨부·공용 draft 교체 flow에서 전체 선택 후 한 번 삭제 | S1·S2 통과 후 S4 입력 준비 harness 실패 |
| [34013623716](https://github.com/cyjoon68/shopport-app/actions/runs/34013623716) | 전체 선택·삭제는 통과했지만 키보드가 열리지 않은 상태의 `hideKeyboard`가 Android back으로 동작해 앱 task를 닫음 | 두 draft 입력 flow에서 불필요한 `hideKeyboard` 제거; 호출부가 이어서 HOME 전환 | S1·S2 통과 후 S4 입력 확인 harness 실패 |
| [34014538632](https://github.com/cyjoon68/shopport-app/actions/runs/34014538632) | S4의 실제 업로드·LocalStack HEAD·SQLite 재실행 복원은 통과했지만 빈 S5 새 대화에서도 공용 draft 교체 flow가 `Select all`을 필수로 기다림 | 공용 flow의 전체 선택 메뉴만 optional 처리하고 삭제·입력 검증은 유지 | S1·S2·S4 통과 후 S5 입력 준비 harness 실패 |
| [34015574223](https://github.com/cyjoon68/shopport-app/actions/runs/34015574223) | S1·S2·S4·S5와 S7 직전 draft 저장은 통과했지만 최종 문자열만 거부하던 실패 trigger 전에 250ms debounce가 빈 값·부분 문자열을 먼저 저장 | 대상 대화의 모든 INSERT를 거부하고 최종 문자열만 audit하도록 실패 주입 경계 수정 | S1·S2·S4·S5 통과 후 S7 fixture 실패 |

## 해석의 한계

- 이 결과는 API 34 Pixel 7 x86_64 Android 에뮬레이터 결과이며 실기기 결과가 아닙니다.
- S4는 SQLite commit을 실제로 관측한 이후의 force-stop·재실행 내구성과 같은 설치 안의 attachment URI만 확인합니다. 저장 완료 전 임의 종료, 앱 재설치, 단말 손실까지 무손실이라고 주장하지 않습니다.
- S5의 정확한 Promise 완료 순서는 FE unit에서, 실제 저장·화면 전환 경계는 native 실행에서 나누어 확인합니다.
- terminal resume 제거와 취소 tombstone은 확인한 저장 범위만 보장합니다. 메모리 상태를 프로세스 경계 보장으로 확대하지 않습니다.
- S7은 SQLite fixture의 `BEFORE INSERT` trigger가 audit row를 남기고 `RAISE(FAIL)`로 새 INSERT를 거부하는 경우입니다. 현재 제품에는 별도의 저장 성공 알림이 없으므로 가시적인 성공 오표시나 오류 알림을 검증했다고 주장하지 않고, 새 값의 미영속화와 직전 값 보존만 판정합니다.
- replay 1시간 만료는 `started_at` fixture로 재현했으며 실제로 한 시간을 기다린 결과가 아닙니다.
- 2초 취소 지연과 상품 5개는 결정적 재현 조건이며 운영 수치가 아닙니다.
- release 빌드 30표본을 수집하지 않았으므로 복구 시간 개선율, FPS, 메모리, 서버 처리량은 미측정입니다. 성능 최적화는 하지 않았습니다.
- 개인 재구현 검증이며 레브잇의 실제 장애, 전환율, 초안 유실률 또는 운영 경험에 대한 근거가 아닙니다.
