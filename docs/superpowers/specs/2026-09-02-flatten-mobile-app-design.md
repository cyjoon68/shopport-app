# Shopport 모바일 단일 패키지 전환 설계

## 목표

`shopport-fe`에는 모바일 앱 하나만 있으므로 `apps/mobile`과 내부 workspace package를 제거하고 저장소 루트가 곧 Expo 앱이 되도록 단순화한다. 앱 동작, API 계약, 배포 정책은 바꾸지 않는다.

## 비목표

- 기능, 화면, 디자인 변경
- 의존성 버전 변경
- GraphQL schema 또는 생성 결과 변경
- 과거 commit SHA를 가리키는 포트폴리오 증거 링크 변경
- 새로운 공용 모듈이나 설정 계층 추가

## 목표 구조

```text
shopport-fe/
├── .eas/workflows/
├── e2e/
├── scripts/
├── security/
├── src/
│   ├── app/
│   ├── features/
│   ├── navigation/
│   ├── providers/
│   ├── screens/
│   ├── shared/components/
│   └── theme/
├── app.config.ts
├── codegen.ts
├── eas.json
├── package.json
├── schema.graphql
└── tsconfig.json
```

`apps/`와 `packages/`는 제거한다. `pnpm-workspace.yaml`은 build 허용 목록과 dependency release 정책을 보존하기 위해 남기되 package glob은 제거한다.

## 파일 이동과 통합

| 현재 | 변경 후 |
| --- | --- |
| `apps/mobile/src` | `src` |
| `apps/mobile/e2e` | `e2e` |
| `apps/mobile/.eas` | `.eas` |
| `apps/mobile`의 Expo·Jest·Metro·GraphQL 설정 | 저장소 루트 |
| `apps/mobile/scripts/*` | 기존 루트 `scripts/`에 병합 |
| `packages/ui/src/*` | `src/shared/components/` |
| `packages/tokens/src/index.ts` | `src/theme/unistyles.ts`에 통합 |
| `packages/typescript-config/*` | 루트 `tsconfig.json`에 통합 |

기존 `src/shared/ui/glass-button.tsx`도 `src/shared/components/`로 이동해 공용 UI 위치를 하나로 만든다. 공용 UI는 `src/shared/components/index.ts`에서 재노출하고 `@shopport/ui` import와 test mock은 `@/shared/components`로 변경한다.

theme token은 현재 `src/theme/unistyles.ts` 한 곳에서만 소비되므로 별도 token module을 만들지 않고 Unistyles 설정과 타입 선언에 직접 통합한다.

## 패키지와 설정

루트 package 이름은 기존 `shopport-fe`를 유지하고 모바일 dependency와 script를 직접 둔다. `pnpm --filter @shopport/mobile` proxy는 제거하고 `start`, `build`, `test`, `codegen`, `doctor`, `typecheck`가 루트 앱을 바로 실행하도록 한다. dependency 감사 test는 기존 `test`와 `test:coverage` 뒤에 계속 실행한다.

루트 `tsconfig.json`은 기존 base와 React Native compiler option을 합치고 `@/* -> ./src/*` alias 및 현재 include 범위를 유지한다. project reference, project reference에만 필요했던 `composite`, `@shopport/typescript-config`는 제거한다.

루트 `.gitignore`와 `.prettierignore`에는 모바일 저장소의 ignore 규칙을 합치고 옛 `apps/mobile` 경로를 루트 `ios`, `android` 경로로 바꾼다. 로컬 CNG native directory가 있으면 루트로 옮겨 사용자 상태를 보존하고 `.expo`, build output, log 같은 재생성 가능한 cache만 옛 경로에서 제거한다.

## 외부 참조

다음 현행 참조를 새 경로로 변경한다.

- 루트 통합 저장소의 GraphQL contract 검사
- Maestro Android 실행 script와 flow 경로
- `shopport-fe` GitHub Actions 및 EAS workflow의 working directory
- 현재 구조를 설명하는 README와 architecture/release 문서

commit SHA가 고정된 `docs/application`의 GitHub 링크는 해당 과거 revision에서 유효한 증거이므로 변경하지 않는다.

## 검증

구조 변경 뒤 다음을 실행한다.

1. `pnpm install --frozen-lockfile`로 단일 importer lockfile 검증
2. `pnpm check`
3. `pnpm test`
4. `pnpm codegen` 후 생성 결과가 구조 이동 외에는 동일한지 확인
5. `pnpm run doctor`
6. `pnpm build`
7. 루트에서 `make contract`

`apps/`, `packages/`, `@shopport/*`, 현행 경로를 참조하는 `apps/mobile` 문자열이 남지 않아야 한다. 과거 SHA 링크와 재생성 가능한 local cache 기록은 검사 대상에서 제외한다.

## 완료 조건

- `shopport-fe` 루트에서 설치·개발·검사·export 명령이 실행된다.
- 앱 source와 설정의 유일한 package root는 `shopport-fe`다.
- 기존 unit test, integration test, GraphQL codegen, Expo 검사가 통과한다.
- 루트 통합 저장소의 GraphQL 및 Maestro 경로가 새 구조를 사용한다.
- 앱의 runtime 동작과 public API 계약은 바뀌지 않는다.
