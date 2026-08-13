# 개인정보와 데이터 수명주기

- access JWT 15분, rotating refresh token 30일. 원문은 기기 SecureStore에만 두고 서버에는 hash만 저장합니다.
- 모바일 SQLite에는 최근 대화·찜·입력 초안만 제한 저장합니다. 로그아웃·계정 삭제 시 제거하며 offline 전송 queue는 만들지 않습니다.
- prompt, 업로드 이미지, access token, provider secret, 구매 URL query token은 로그·Sentry에 수집하지 않습니다.
- 원본 이미지는 실제 decode 검증 후 EXIF를 제거한 최대 2048px JPEG로 정규화하며 S3 lifecycle로 24시간 후 삭제합니다.
- normalized asset과 archive는 대화와 함께 유지합니다. 대화 삭제 시 관련 asset을 제거합니다.
- message는 월별 partition, 최근 90일 hot입니다. 이후 checksum이 포함된 compressed NDJSON archive를 검증한 뒤 partition에서 제거합니다.
- 계정 삭제 요청 즉시 access를 차단하고 Aurora, Redis, OpenSearch 사용자 문서, S3 asset/archive를 비동기 purge합니다.
- Aurora backup 안의 삭제 데이터는 복구 목적 보존 기간 35일 후 자연 만료됩니다. 복구 시 삭제 tombstone을 먼저 재적용합니다.

출시 전 실제 개인정보처리방침에 위 보존 기간, affiliate 고지, 처리 위탁, 문의·삭제 절차를 반영해야 합니다.
