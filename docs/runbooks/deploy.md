# 공개 사이트 배포 준비 (ADR-022)

실제 배포는 호스팅·도메인 결정과 G3 승인을 받은 뒤 진행한다. 이 문서는 실행 절차 준비이며 클라우드 자원을 생성하지 않는다.

## 실행 환경

Node 24 이상(node:sqlite 포함), 단일 서버 프로세스, 영구 DATA_DIR, HTTPS 종료 프록시가 필요하다. 프록시는 원래 Host를 전달하고 외부에서 Node 포트에 직접 접근하지 못하게 한다. 기본적으로 전달 헤더를 신뢰하지 않는다. `TRUSTED_PROXIES`에 설정한 IP/CIDR에 속하는 TCP peer에서 온 요청만 X-Forwarded-For를 해석한다. CSP의 inline style은 기존 화면의 동적 너비·위치 표시에 필요하다. 스크립트는 자체 출처만 허용한다.

| 변수 | 값 / 조건 |
|---|---|
| AUTH_MODE | 운영 `oidc`, 로컬 `off`(생략 시 off) |
| HOST / PORT | 운영 `0.0.0.0` / `8766`, off는 `127.0.0.1` 또는 `localhost`만 |
| OAUTH_CLIENT_ID | Google 웹 애플리케이션 클라이언트 ID |
| OAUTH_CLIENT_SECRET | 비밀 저장소에서 주입 |
| OAUTH_REDIRECT_URI | `https://<도메인>/auth/callback` |
| OAUTH_ISSUER | 기본 `https://accounts.google.com` |
| ALLOWED_DOMAIN | 회사 Workspace 도메인 |
| ADMIN_EMAILS | 최초 관리자 이메일, 쉼표 구분; 기존 사용자의 역할·비활성 상태를 덮어쓰지 않음 |
| SESSION_SECRET | 무작위 32자 이상, 비밀 저장소에서 주입 |
| PUBLIC_BASE_URL | `https://<도메인>` |
| DATA_DIR | 쓰기 가능한 영구 디렉터리 (필수) |
| INGEST_TOKEN_HASHES | 선택: 수집 토큰 SHA-256 hex, 쉼표 구분 |
| TRUSTED_PROXIES | 선택: 신뢰할 프록시 IP/CIDR의 쉼표 구분 목록(IPv4/IPv6). 미설정 시 TCP peer만 사용 |

필수 변수가 빠지면 이름만 출력하고 시작을 거부한다. off는 실제 listen 주소도 검사한다. 개발 시작: `node app/server/api/server.cjs`. 운영에서는 비밀값을 셸 명령 인수·이미지·저장소에 넣지 않는다.

프록시 설정 예: `TRUSTED_PROXIES=127.0.0.1/32,10.20.0.0/24`. 실제 프록시 주소만 좁게 허용한다. 서버는 TCP peer부터 X-Forwarded-For를 오른쪽에서 왼쪽으로 확인하고 신뢰 범위 밖 첫 주소를 클라이언트로 사용한다. 그 주소 왼쪽의 값은 무시한다. 신뢰하지 않는 peer가 보낸 XFF는 무시하며, 잘못된 체인은 peer로 처리한다. 프록시는 외부에서 받은 XFF를 덮어쓰거나 실제 연결 주소를 정확히 덧붙여야 한다. 잘못된 TRUSTED_PROXIES는 설정 이름만 출력하고 시작을 거부한다. 로그인과 콜백 제한은 각각 클라이언트당 분당 20회이며 카운터를 공유하지 않는다. 검증된 계정별 제한도 분당 20회 적용한다.

## Google OAuth 등록

1. 회사 Google Cloud 프로젝트의 Google Auth Platform에서 사용자 유형을 **Internal(내부)**로 설정한다. 회사 Workspace 조직 프로젝트가 필요하다.
2. 웹 애플리케이션 OAuth 클라이언트를 만들고 승인된 리디렉션 URI에 OAUTH_REDIRECT_URI와 정확히 동일한 HTTPS 주소를 등록한다.
3. 로그인 범위는 `openid email`만 사용한다. Drive·Calendar 수집 권한은 요청하지 않는다.
4. 클라이언트 ID·시크릿과 나머지 변수를 호스팅 비밀 설정으로 전달한다.
5. ADMIN_EMAILS의 회사 계정으로 로그인하고 사용자 관리에서 이메일·역할·담당자 ID를 등록한다. invited는 첫 로그인 때 active가 된다. 비활성 사용자는 로그인할 수 없다.

공식 근거: [Google OpenID Connect](https://developers.google.com/identity/openid-connect/openid-connect). state·nonce·PKCE 검증, 서명된 ID 토큰의 issuer·audience·만료·hd·email_verified 검증을 적용한다. 모의 IdP 테스트는 fetch/JWKS를 주입하며 실제 Google을 호출하지 않는다.

## 데이터와 수집

DATA_DIR에 승인된 `real-dataset.json`을 별도 안전한 절차로 준비한다. 서버는 운영에서 예시 데이터나 빈 업무 원장을 자동 생성하지 않는다. 최초 데이터 반입은 배포 승인 이후 별도 작업이다. `local.sqlite`에는 사용자·세션·토큰·access_audit가 저장된다. `real.sqlite`는 기존 데이터 투영 경로를 사용한다. JSON·state.json·runs.log와 두 SQLite DB를 함께 백업하며 실행 중 SQLite 파일을 단순 복사하지 않는다. 파일 권한은 서비스 계정으로 제한하고 암호화된 백업에 동일한 접근 정책을 적용한다. 감사 보존 기간과 복원 훈련은 운영 전 결정한다.

관리자 세션에서 `GET /api/me`의 csrf를 읽어 `Origin: <PUBLIC_BASE_URL>` 및 `X-CSRF-Token` 헤더와 함께 `POST /api/admin/ingest-tokens`에 `{"label":"로컬 수집기"}`를 보낸다. 응답의 token은 한 번만 반환되므로 즉시 비밀 저장소에 보관한다. GET은 해시·라벨·발급/폐기 시각만 반환한다. 폐기는 같은 POST에 `{"revoke":"<hash>"}`를 보낸다. 환경 변수 해시는 환경 설정에서 제거하고 프로세스를 재시작하여 폐기한다.

로컬 수집기는 토큰을 `AX_INGEST_TOKEN` 환경 변수로만 전달하고 다음 도구를 실행한다.

```text
node app/server/real/push-delta.cjs <delta.json> --url https://<도메인>
```

POST `/api/ingest/delta`는 Bearer 토큰만 사용하며 브라우저 세션과 분리된다. 최대 5MiB, JSON만 받는다. `?dry_run=true`는 검증만 하며 파일을 쓰지 않는다. 반영은 기존 applyDelta의 잠금·재실행·제외·이력 규칙을 따른다. 응답은 성공 여부와 건수만 포함한다. 전송 도구는 리디렉션을 따라가지 않으며 토큰·응답 원문을 출력하지 않는다.

## 컨테이너와 호스팅 선택

루트 Dockerfile은 node 비root 계정으로 실행하고 `/data` 볼륨을 사용한다. 의존 라이브러리 추가 없이 Node 내장 HTTP·crypto·SQLite를 사용한다. 이미지에는 .real·node_modules·테스트 결과·환경 파일이 포함되지 않는다. 시작 전 볼륨의 소유권을 서비스 UID에 맞추고 TLS 프록시를 구성한다. 다중 인스턴스로 실행하지 않는다(로그인 state·시도 제한이 메모리 기반).

| 후보 | 조건 / 남은 결정 |
|---|---|
| A Cloud Run + Cloud SQL | 현재 SQLite 파일·delta 저장 방식과 다름. ADR-014 DB·객체 저장소 전환 설계 및 승인 필요. 현재 컨테이너를 그대로 다중 인스턴스로 배포하지 않음 |
| B 사내 서버 / VM + SQLite 볼륨 | 현 구조 사용 가능. TLS·도메인·백업·패치·운영 담당자 결정 필요 |
| C 사내 인트라넷 호스팅 | 사내 접근 정책·HTTPS·영구 볼륨·OIDC 콜백 연결 가능 여부 확인 필요 |

미결정: 호스팅, 도메인, 회사 OAuth 프로젝트·등록 담당자, 최초 관리자, 데이터 반입·백업/감사 보존 정책. 운영 배포·실데이터 접근은 별도 승인 대상이다.
