# Workers 연결부 — 합성 데이터 로컬 검증

ADR-025 1·2단계. 배포하지 않았다. 메모리 저장소는 isolate 변경·재시작 시 사라진다. D1과 실데이터 이전은 3단계다.

## 실행과 설정

`app`에서 `npm install --save-dev wrangler`를 실행한 후 `cd workers && npm run dev`로 실행한다. 이번 환경에서는 레지스트리 접근이 EACCES로 차단되어 설치하지 못했다. 대체 검증은 `node --test workers/tests/*.test.js`(app에서 실행), Node 26 Fetch·WebCrypto 기반이다. workerd 번들 실행은 미검증이다.

로컬 `.dev.vars` 또는 배포 비밀 설정에 값을 지정한다. 실제 값은 커밋하지 않는다.

| 설정 | 의미 |
|---|---|
| ACCESS_TEAM_DOMAIN | `team.cloudflareaccess.com` 형식 |
| ACCESS_AUD | Access 애플리케이션 Audience |
| ADMIN_EMAILS | 최초 관리자 이메일, 쉼표 구분. 비활성 계정을 재활성화하지 않음 |
| PUBLIC_BASE_URL | 선택적인 고정 origin 검사 |
| INGEST_TOKEN_HASHES | 관리자 수집 토큰 SHA-256 hex, 쉼표 구분 |
| INBOX_TOKEN_HASHES | `{"<SHA-256 hex>":"<person_id>"}` 사람별 업로드 토큰 JSON |

기본 데이터와 사용자 목록은 비어 있다. 합성 초대 목록은 `createMemoryStorage({users:[{id,email,role,status}],dataset})`로 주입한다. `createHandler(env,{storage,fetch,jwks,now})`로 모의 저장소·JWKS·네트워크·시간을 주입한다.

## Access와 정적 파일

화면·일반 API를 Access로 보호하고 `/api/ingest/*`, `/api/inbox`에는 더 구체적인 Bypass 애플리케이션/정책을 설정한다. 두 경로는 앱 자체 Bearer 수집 토큰으로 보호한다. JWT의 RS256 서명, kid, iss, aud, exp, nbf를 확인하고 이메일을 초대 목록과 대조한다. JWKS는 팀 도메인의 `/cdn-cgi/access/certs`에서 가져온다. 일반 쓰기는 동일 Origin과 `/api/me`가 반환한 CSRF 값을 요구한다. Access 로그인 시도 제한은 Access 정책에서 관리한다. Node OIDC 세션·로그인 제한은 기존대로 유지한다.

`build-assets.cjs`는 허용한 정적 파일만 dist에 복사한다. 서버·원본 데이터는 포함하지 않고 data.js는 빈 부트스트랩이다. `run_worker_first = true`로 정적 파일에도 인증과 보안 헤더를 적용한다.

## 수집 계약

- `POST /api/ingest/delta`: 기존 delta JSON, 최대 5 MiB·200건. 초과는 `413 {"error":"batch_limit"}`. dry_run·병합·재실행 검증은 공유 core 사용.
- `push-delta.cjs`: 200건씩 순서대로 전송, 결정적 run ID, 마지막 요청에만 체크포인트. 중간 실패 시 같은 파일로 재시도한다. 청크 간 원자성은 없으므로 상호 참조·제거는 각 청크가 유효하도록 구성해야 한다.
- `POST /api/inbox`: `{records:[{id,service,title,summary,actor,occurred_at,url,source_id}]}`. 필드는 문자열 최대 160자, 요청당 200건. 알려지지 않은 필드·본문·중첩 값·비밀 패턴 거부. 사람별 토큰으로 소유자를 정하고 `(person_id,id)` 중복 제거.
- `GET /api/inbox?since=<cursor>`: 관리자 수집 토큰 전용, 최대 200건과 다음 cursor. 사람별 기록은 별도로 저장하며 판별 시 서비스 고유 ID로 합친다.

## 이식 경계·3단계 인계

server/core는 경로·라우팅 표·권한·CSRF·보안 헤더·판단 입력·화면 투영·delta 병합을 공유한다. server/node는 HTTP/SQLite/파일을, workers/src는 Fetch/Access/WebCrypto/메모리를 연결한다. 비동기 계약은 `server/core/contracts.cjs`의 Storage·Identity·Http JSDoc이다. Node OIDC 내부 트랜잭션은 기존 동기 SQLite 방식이다.

D1은 미구현이다. 기존 사용자·세션·토큰·감사 스키마의 ID/버전, inbox 단조 cursor와 소유자/원본 ID unique 제약, delta 데이터·상태·감사의 원자성과 재실행 보장을 맞춰야 한다. SQL은 SQLite·D1·PostgreSQL 공통 표준을 우선하고 dialect별 트랜잭션은 연결부에 둔다.

메모리 구현은 로컬 API 검증용이며 Node 사용자·수집 토큰 관리 API/화면 전체를 Workers에 이식하지 않았다. 관리 API·영속 보존 정책과 무료 CPU 10ms 실측은 후속 검증이 필요하다. 200건 상한만으로 CPU 한도를 보장하지 않는다.

ChatGPT Sites로 옮길 때 Sign in with ChatGPT Identity를 구현하고 같은 core·Storage 계약을 유지한다. Sites 실제 인증·바인딩 계약은 별도 검증한다.

공식 참고: [Static Assets 설정](https://developers.cloudflare.com/workers/static-assets/binding/), [Access JWT 검증](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/).
