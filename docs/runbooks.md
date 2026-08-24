# 운영 runbook

## 배포 rollback

1. Datadog release marker, API error/latency, queue lag와 migration Job을 확인합니다.
2. schema가 additive 상태인지 확인합니다. contract migration은 이전 binary 제거 후 별도 배포합니다.
3. Argo CD에서 직전 검증 image digest와 Helm revision으로 sync합니다.
4. 모바일 native 회귀는 이전 store binary를 유지하고 호환되는 JS bundle만 EAS rollback합니다.

## Aurora 복구·failover

1. writer 장애는 RDS failover와 RDS Proxy endpoint 전환을 확인합니다.
2. 복구 훈련은 격리 VPC에 최신 snapshot/PITR로 새 cluster를 생성합니다.
3. migration version, row count, archive manifest checksum, 삭제 tombstone을 검증합니다.
4. global rate limit과 1시간 stream replay를 확인합니다.
5. smoke/E2E 통과 후에만 DNS/secret endpoint 변경을 승인합니다.

## SQS redrive

DLQ message의 trace ID, asset/outbox idempotency key와 실패 원인을 확인합니다. 원인을 수정한 뒤 작은 batch로 source queue에 redrive하고 queue age, duplicate 처리, asset 상태를 관찰합니다.

## 계정 purge

access 차단과 outbox 생성을 확인한 뒤 Aurora, OpenSearch, S3 prefix별 deletion receipt를 대조합니다. 실패 항목만 idempotent retry합니다. backup은 수정하지 않고 35일 만료를 기다립니다.

## 보안 사고

credential을 Secrets Manager에서 rotate하고 OIDC session 및 provider token을 revoke합니다. prompt/image/token이 포함된 로그를 외부로 복제하지 않습니다. 필요한 증거는 request ID와 redacted trace만 보존합니다.
