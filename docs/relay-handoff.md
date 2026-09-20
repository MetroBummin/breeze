# Breeze 책 릴레이 — Codex 인수인계

## 1. 기준 / 완료 커밋과 브랜치

- 기준: `main` / `08e230bec0d03f756d7f2bcf1f85541f0a866fd1`.
- 서버 코드·테스트 커밋: `702d3df8b3725560175e79c77049a6256252b479`.
- 브랜치: `chatgpt/book-relay-server-dev-20260920`. 이후 문서 커밋까지 checkout한다.
  최종 문서 커밋은 `git log -1 --format=%H -- docs/relay-handoff.md`로 확인한다.
- 기존 파일 수정 없이 `server/relay/`, 추가 SQL, 이 문서와 관련 초안만 추가.
  진행 중인 사용자 로컬 작업은 확인하지 않았다. sync/progress/Ready/lookup/JEV는 변경하지 않았다.

## 2. 실제 확인한 환경 / 생성 리소스 / URL

2026-09-20 재확인: Breeze 프로젝트 `hrtfhojbhqvaoiulspto`,
Organization `nxnssinjzlxqnkwlbwmp` / `Breeze` / **Free**,
`ACTIVE_HEALTHY`, 서울 리전. 프로젝트 ID·Org ID 직접 조회는 성공했다.
일반 project/org list는 이전 연결 범위를 반환하므로 직접 ID 조회 결과를 기준으로 한다.

Cloudflare 호출 도구는 이번 세션에도 노출되지 않아 **계정별 요금제·기존 Worker/R2를 실제 조회하지 못했다.**
따라서 Worker/R2/secret/lifecycle은 생성·변경하지 않았다. **Worker URL: 없음.**
`breeze-book-relay-dev` Worker·private bucket, rate-limit namespace `26092001`은 아직 후보 이름이다.
공개 Cloudflare 문서상 Workers Free/R2 Standard 무료 포함량은 존재하지만, 계정 상태 확인 전 생성하지 않는다.

## 3. 적용 여부 / 승인 대기

코드·설정·migration 파일·테스트 작성 완료. **Cloudflare 배포 0건. Supabase relay schema는 실제 적용 완료.**
Breeze project `hrtfhojbhqvaoiulspto`에 migration
`20260920053847 / add_breeze_relay_v1`로 적용했다. Ready에는 적용하지 않았다.

실제 생성된 relay DB 객체:
- tables: `relay_accounts`, `relay_files`, `relay_events`, `relay_nonces`, `relay_maintenance`
- functions: `relay_context`, `relay_commit`, `relay_events_page`, `relay_snapshot_page`,
  `relay_due`, `relay_sweep_cursor`, `relay_prune`, `relay_bootstrap`
- indexes: `relay_due_idx`, `relay_events_retention_idx`, `relay_nonces_expiry_idx`

5개 relay table 모두 RLS ON이고 anon/authenticated table grant·RPC EXECUTE가 없으며,
`service_role` RPC EXECUTE grant가 존재한다. 적용 직후 relay data row는
accounts/files/events/nonces 모두 0, maintenance만 초기 row 1개다.
공개 엔드포인트, main 병합, 유료 전환, 기존 데이터 삭제는 하지 않았다.
`RELAY_ENABLED=false`, `INFRA_VERIFIED=false`, `workers_dev=false`는 그대로다.

별도 Supabase dev branch는 없었고 추가 비용 없이 만들 수 있음이 확인되지 않아 생성하지 않았다.
Cloudflare 계정·요금·이름 충돌 확인 후 개발용 새 private R2/Worker 생성·제한 배포와 secret 설정만 남아 있다.
순서는 [배포 절차](../server/relay/README.md)를 따른다.

JWT의 실제 활성 서명 알고리즘/키 목록은 확인하지 못했다. 이를 추정하는 대신 해당 프로젝트
`/auth/v1/user`에 토큰을 검증시킨다. JWT 키 회전·Auth 설정 변경은 하지 않는다.
기존 pairing은 열쇠 전달용이며 영구 기기 승인 증명이 아니다. 새 서명기기 등록은 pending이고,
**첫 개발 기기는 운영자가 fingerprint·E2EE 해제·동의를 확인한 뒤 service-only bootstrap**한다.
일반 사용자용 최초 등록·모든 승인기기 분실 복구는 별도 보안 설계/구현이 필요하다.

## 4. API / 오류 / 상태

모든 API는 `POST /v1/<작업>`; Supabase Bearer + 기기 P-256 서명·시각·nonce 필수.
원문 요청 바이트를 서명한다. user_id는 body에서 받지 않는다.

```json
{"file_id":"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA","request_id":"11111111-1111-4111-8111-111111111111"}
```

위는 `/v1/request` 예시(가짜 ID). 응답 예시:

```json
{"file_id":"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA","transfer_id":"22222222-2222-4222-8222-222222222222","state":"waiting_source","expires_at":null}
```

흐름: `register → approve → offer/request → upload → 기기에서 R2 PUT → complete → download → 기기에서 R2 GET → ack`.
`events/status/snapshot`, `retry/source-missing`, `cancel/revoke/consent/cleanup-retry`도 구현했다.
업로드 완료는 HEAD 크기 확인 → 조건부 서버 내부 Copy → HEAD 확인이다. Worker가 책을 읽지 않는다.
`ack`에는 `file_id,transfer_id,attempt_id,verified:true,stored:true`를 보낸다.

상태: `idle → waiting_source ↔ unavailable_known_sources → uploading → ready → closing → deleted`.
정리 8회 실패 시 `cleanup_failed`. 마지막 ACK와 새 수신자 참여는 계정 단위 SQL CAS로 직렬화한다.
한 명만 ACK한 다중 수신 전송은 보존한다. closing 이후 참여는 정리 후 새 전송으로 처리한다.
만료는 자동 재업로드하지 않으며 원본 기기가 오프라인이면 대기한다.
`no_known_source`는 알려진 원본 보유처 부재이지, 미확인 기기까지 조사했다는 뜻이 아니다.

핵심 오류: 401 `BAD_PROOF`, 403 `DEVICE_NOT_APPROVED`, 409 `UPLOAD_LEASE_BUSY`/
`CLEANUP_PENDING`/`STALE_UPLOAD`/`CURSOR_EXPIRED`, 410 `TRANSFER_EXPIRED`,
413 `FILE_SIZE_LIMIT`, 422 `CIPHERTEXT_SIZE_MISMATCH`, 429 `RATE_LIMIT`/`ACCOUNT_CAPACITY`.
정확한 필드·모든 오류·서명 규격은 [PROTOCOL](../server/relay/PROTOCOL.md)에 있다.

## 5. 앱의 identity / 암호화 / ACK 계약

원본 바이트 SHA256을 기기에서 확인하고
`VaultCrypto.recordId(master,'relay-file-v1',sourceHash.toLowerCase())`로 불투명 file_id를 만든다.
원본 해시·제목·파일명은 암호화 manifest 안에만 둔다. 기존 raw SHA256/local book.id를 서버 ID로 보내지 않는다.
[PROTOCOL의 binary package 규격](../server/relay/PROTOCOL.md#identity-and-client-encrypted-package)을 따른다.
앱의 1MiB chunk 암호화 codec은 아직 구현하지 않았다. E2EE 키는 Worker/Supabase/R2에 전달하지 않는다.

전부 복호화·태그/해시/identity 검증 → 원본과 책 인덱스 저장 transaction 완료 → 다시 읽기 성공 후 ACK.
HTTP 200이나 storage.persist 요청만으로 ACK하지 않는다. 읽기 오류를 null로 삼키는 기존 helper를 주의한다.
새 기기는 최초 snapshot의 첫 resume_cursor를 유지한 채 페이지를 끝내고 증분 events를 따라간다.
계속 켜진 foreground 앱은 60–120초 jitter 증분 조회, 시작/foreground/재접속 때 누락을 복구한다.
full-vault polling은 추가하지 않는다. 기존 책과 이후 책의 전송 동의를 먼저 받아야 한다.

개발 제한: 파일 암호문 32MiB, 계정 예약 256MiB(임시/완료 사본 2개 계산), 활성 8건,
기기 8대, 계정 API 60회/분, 전송당 업로드 3회·수신자 GET 권한 12회,
파일당 새 전송 3회/24시간. 기본 TTL 24시간, 개별 URL 최대 60초.
URL은 1회용이 아니며 유출/기기 해제 후에도 잔여 유효기간 동안 재사용될 수 있다.

## 6. Secret 이름 / 설정 위치 (값 없음)

신규 Worker의 Wrangler secret 또는 로컬의 Git 제외 `.dev.vars`:
`SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `R2_ACCOUNT_ID`,
`R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `ALLOWED_USER_IDS`.
`BOOK_RELAY` R2 binding, `RATE_LIMITER` binding과 `SUPABASE_URL`, `R2_BUCKET_NAME`,
`TEMP_TTL_SECONDS`, `ALLOWED_ORIGINS`, 활성화 플래그는 `server/relay/wrangler.json`.
service-role은 relay 외 프로젝트 권한도 가지므로 서버에서 격리한다. 앱에 넣지 않는다.
실제 계정/자격증명/허용 사용자 값은 이번에 조회·저장하지 않았다.

## 7. 실행한 테스트 / 미검증

Node 22.16.0에서 `cd server/relay && npm test && npm run check`: **39 통과 / 0 실패**.
실제 localhost HTTP, ECDSA 요청 검증, 더미 AES-GCM 복호화·파일 fsync/readback,
정상 전송·두 수신자 ACK·타 계정/미승인 기기 차단·중복·만료·크기·URL 만료·정리 재시도·경쟁을 검사했다.
서명 URL은 독립 botocore 1.43.18 생성 벡터 3개와 일치했다.
[원본 테스트 로그](../server/relay/test-results.txt) 참조.

**테스트 대역:** 로컬 테스트의 Supabase 상태/인증, R2 HTTP 저장소, Cloudflare rate limiter.

**실제 Supabase에서 검증 완료:**
- migration `20260920053847 / add_breeze_relay_v1` 적용 성공
- relay 5개 table 생성 및 RLS ON 확인
- `test/database-checks.sql` 실행 성공: anon/authenticated table 권한·RPC EXECUTE 없음,
  service_role RPC EXECUTE 존재, 예상 밖 relay policy 없음
- Supabase advisor 재실행. relay의 `RLS enabled, no policy` INFO는 browser 완전 차단 설계상 의도됨.
- 실패한 함수 smoke transaction 뒤 accounts/files/events/nonces 0 row를 재확인해 운영 테스트 찌꺼기 없음

**실제 환경에서 아직 미검증:**
- 연결된 SQL 실행기는 `supabase_read_only_user`이며 service_role로 SET ROLE할 수 없어,
  service-role 실제 RPC 실행/CAS 동시성은 이 커넥터에서 수행 불가
- 실제 Supabase 사용자 JWT를 통한 `/auth/v1/user` 검증
- Cloudflare/Wrangler build·배포, 실제 R2 PUT/GET/HEAD/CopyObject·조건부 헤더·길이·lifecycle·URL 만료
- Safari Blob 업로드, 전체 책 package codec, 앱/iPhone/iPad/iOS 백그라운드

Cloudflare 실제 smoke와 service-role 경로 검증 전 `INFRA_VERIFIED`/relay feature flag를 켜지 않는다.

## 8. Codex의 앱 측 작업만

- [ ] 영구 기기 서명키·UUID 보관, 요청 서명, 기존 pairing에서 fingerprint 검증·승인 연결.
- [ ] E2EE 잠금 해제와 최초 전송 동의/기기별 송수신 설정 연결. 이메일-only 키 복구 금지.
- [ ] 원본 identity 확인, 책별 chunk 암호화·복호화·manifest 검증, 기기↔R2 직접 전송.
- [ ] 최초 없는 책 + 이후 추가 책 자동 큐, upload lease·재시도·오프라인 대기·알려진 원본 부재 처리.
- [ ] import/IndexedDB 원자적 저장·재열기·crash-safe ACK, 중복 수신 시 중복 책 방지.
- [ ] 증분 cursor 복구·foreground 연동·기기 해제·동의 철회·제한/만료 오류 UX.
- [ ] 개인정보 안내 초안 반영 후 iPhone/iPad 검증. 백그라운드 전송은 별도 구현·검증.

## 9. 기능 중지 / 롤백 / 남은 파일 정리

`RELAY_ENABLED=false`로 새 API 접근을 중단하되 `CLEANUP_ENABLED=true`, Cron·R2 lifecycle은 유지한다.
이미 발급된 URL은 최대 60초 잔여 유효기간이 있다. 정확히 24시간 물리 삭제를 보장하지 않는다.
`cleanup_failed`를 확인·재시도하고, 전용 private bucket의 `relay/` 목록/남은 multipart를 확인한다.
계정 삭제로 DB 레코드가 사라져도 제한된 orphan scan과 lifecycle이 남은 파일을 정리한다.

정리 완료를 확인하기 전 Worker/Cron/DB/정리 권한을 먼저 제거하지 않는다. DB/플랫폼 장애가 있으면
승인된 관리 경로에서 전용 prefix만 청소한다. 기존 다른 bucket/데이터는 삭제하지 않는다.
이번 변경은 main 미병합·배포/DB 미적용이므로 현재 운영 롤백은 필요 없다.
클라이언트 활성화 전 [개인정보 안내 수정안](relay-privacy-proposal.md)을 최종 검토한다.
