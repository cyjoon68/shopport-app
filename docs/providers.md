# Shopping provider 승인 정책

| providerId       | 목표           | production 상태 | 필요한 외부 입력                                 |
| ---------------- | -------------- | --------------- | ------------------------------------------------ |
| `coupang`        | Coupang        | 비활성          | 범용 검색/affiliate 또는 licensed feed 계약·명세 |
| `daiso`          | Daiso          | 비활성          | 공식 API/feed 계약·명세                          |
| `naver-shopping` | Naver Shopping | 비활성          | 종료된 legacy API가 아닌 승인 API/feed 계약·명세 |
| `gmarket`        | Gmarket        | 비활성          | 범용 상품/affiliate 또는 licensed feed 계약·명세 |

`CatalogProvider`는 `LIVE_QUERY`와 `LICENSED_FEED` capability, `search`, `getProduct`, `resolveOutboundLink`, optional `syncCatalog`을 정의합니다. 계약이 허용한 데이터만 Redis/OpenSearch/S3에 저장합니다.

승인 문서, credential, rate limit, attribution, 보존·이미지 권한, outbound domain allowlist가 확인되기 전에는 adapter를 등록하거나 production UI에 노출하지 않습니다. HTML parsing, crawling, 비공식 endpoint는 금지합니다. 승인 adapter가 없으면 fail-closed합니다.

정렬은 `neutral-v1`로 고정합니다: relevance bucket, 재고, 배송비 포함 총액, 배송 예정일, rating confidence, freshness, stable product ID. provider 이름과 affiliate 여부는 순위 입력이 아닙니다.
