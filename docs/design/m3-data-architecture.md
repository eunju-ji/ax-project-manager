# M3 데이터 아키텍처 — DB 원본 구조와 DB 선택

> 작성: AX-Lead, 2026-11-19 · 상태: **설계안 v2**(AX-Reviewer 검토 반영, pass-with-changes) · 기준: ADR-001·002·004·006·007·010·011·012·013
> 질문(사용자): 실제 데이터를 연동하고 프로젝트가 계속 쌓인다는 전제에서 구조를 어떻게 잡을지, 지금 쓰려는 DB가 맞는지, 나중에 DB를 서버로 옮길 때 보수가 편한 구조는 무엇인지.

## 1. 결론
- **목표 DB는 PostgreSQL이다. 합성 데이터 단계(G0)는 SQLite로 시작한다.** 스키마와 코드는 처음부터 PostgreSQL로 옮길 수 있게 만든다.
- **실데이터(G2) 전에 PostgreSQL에서 같은 계약 테스트 통과 + 합성 데이터 이관 연습 완료**를 필수 조건으로 둔다. 실데이터를 SQLite에 쌓은 뒤 옮기지 않는다.
- 코드는 **domain(순수 업무 규칙) / service(트랜잭션·인가·멱등성·감사 조율) / repo(저장·잠금) / connectors(외부 통신)** 4층으로 나눈다.
- 데이터는 **현재 상태 표**, **추가만 하는 사건 표**, **지울 수 있는 보호 내용 표**로 나눈다. 사건은 남기고, 보호 내용(제목·요약 등)은 정책에 따라 지울 수 있게 한다.
- 스키마 변경은 번호 붙은 마이그레이션 파일로만 한다.

## 2. 규모 추정 (검증 전 가정)
| 가정 | 파일럿(3명) | 확장(30명) |
|---|---|---|
| 이벤트/년 | 약 4만 | 약 30만 |
| 작업 내역/년 | 약 4천 | 약 4만 |
| 프로젝트/년 | 20~40 | 200~400 |
| 변경 이력/년 | 약 3만 | 약 25만 |
- 5년치 수백만 행 수준으로 **추정**한다. 용량 판단은 §10 성능 측정(행 수·데이터 크기·연결·감사 증가량·동시 수집·p95)으로 확인한다.

## 3. DB 선택
| 기준 | SQLite (`node:sqlite`) | PostgreSQL (관리형) |
|---|---|---|
| 여러 행 트랜잭션 | 지원 | 지원 |
| 동시 쓰기 | 한 번에 하나(WAL에서 읽기 동시). 같은 호스트의 여러 프로세스도 가능하나 쓰기 경합 | 행 잠금·다중 접속 |
| 배치 | 파일. 앱과 같은 디스크 | 네트워크 DB |
| 성숙도 | **Node v26.13.0에서 `node:sqlite`는 Stability 1.2(Release candidate)**. 동기 API | 안정 |
| 설치·비용 | 없음 | 관리형 비용(승인 필요) |
| 백업 | 온라인 백업 API | 자동 백업·시점 복구 |
| 권한 | 파일 권한뿐 | DB 사용자·역할 |

**판단**
- G0 로컬 PoC에는 SQLite가 적합하다(설치 없이 트랜잭션 효과 검증).
- **PostgreSQL 전환 조건**(하나라도 해당): G2 착수 전(필수), 앱 인스턴스 2개 이상·자동 확장 배포, AX팀 밖 확장, 사용자·역할별 DB 권한·자동 백업 필요, 측정 결과 잠금 대기·실패율·응답 지연이 기준 초과(§10).
- 처음부터 PostgreSQL만 쓰면 어댑터 두 벌 비용이 없다. 다만 현재 PC에 설치돼 있지 않고 G0 검증을 막을 이유는 없으므로 SQLite로 시작한다. PostgreSQL 구현은 이관 단계에서 추가한다(미리 만들지 않음).
- 운영 후보: Google Cloud의 관리형 PostgreSQL 등. 제품·비용 비교는 ADR-014.

## 4. 원자적 업무 연산 (트랜잭션 경계)
각 업무 연산은 **DB 트랜잭션 1개**다. 트랜잭션 안에서는 외부 호출(Google·GitHub API, LLM, Sheets 쓰기)을 하지 않는다.

| 연산 | 한 트랜잭션에 묶는 것 | 잠금·재검증 대상 |
|---|---|---|
| 완료 판단(T1~T5) | 요청 멱등 기록 + 적용 시점 역할 확인 + Task 변경 + Review 결정 + 관련 열린 Review `superseded` + change_log + 응답 결과 | Project → Task → Review 순서로 잠금 |
| 대리 확정자 지정·해제 | Project 변경 + change_log | Project |
| Link 확정·거절(+Suppression 생성) | 요청 기록 + Link 변경 + Suppression + change_log | Task(대상의 부모) → Source |
| Suppression 해제 | 요청 기록 + Suppression 해제 + change_log | Task → Source |
| 자동 연결(허용 목록 2번) | Suppression 확인 + Link 생성 + change_log | Task → Source (거절과 같은 순서) |
| WorkLog 생성·교정 | 요청 기록 + WorkLog + Link + change_log | Task |
| 수집 페이지 저장 | 수신 이벤트(정식·충돌 변형) + 처리 대기 항목 + 다음 커서 + 수집 실행 갱신 | connector_cursor 행 |
| 판별 처리 1건 | 처리 대기 항목 소유 + 판별 결과(Link·Review·WorkLog 제안) + 대기 항목 완료 표시 | 처리 대기 항목 → Task → Source |

- **잠금 방식**: SQLite는 `BEGIN IMMEDIATE`(쓰기 트랜잭션 직렬화). PostgreSQL은 위 순서로 `SELECT … FOR UPDATE` 후 재검증. 존재하지 않을 수 있는 행(Suppression 등)은 **부모 행**(Task·Source)을 잠가 보호한다. 잠금 순서를 고정해 교착을 줄인다.
- **오류 구분**: SQLite busy, PostgreSQL deadlock·직렬화 실패 → **같은 요청 ID로 전체 트랜잭션 재시도**(최대 3회, 짧은 대기). 업무 버전 충돌·역할 불일치 → 재시도하지 않고 conflict 결과 반환.
- **실패 감사**: 트랜잭션이 롤백되면 그 안의 기록도 사라진다. 그래서 거절·충돌·실패 결과는 **별도의 짧은 트랜잭션**으로 `request_attempts`에 남긴다(§5.4).
- **M1-01 §4 기대 결과 갱신**: 업무 연산 내부의 부분 저장은 생기지 않는다(전체 반영 또는 전체 롤백). 실행 목록 선기록·이력 보충·미완료 데이터 격리·보정 실행은 **업무 연산 내부용으로는 제거**한다. 여러 트랜잭션에 걸친 작업(수집 실행, 판별 대기열, Sheets 내보내기)은 실행 상태와 재시도를 그대로 가진다.

## 5. 표 구조
### 5.1 공통 규칙
- 모든 표에 `workspace_id`. 팀 경계가 있는 관계는 **`(workspace_id, id)` 복합 키로 참조**해 다른 팀 행을 가리키지 못하게 한다.
- ID는 앱이 만드는 UUIDv7 문자열. 사람용 표시 키(`TSK-…`)는 별도 컬럼, `(workspace_id, display_key)` UNIQUE.
- 필수값은 모두 `NOT NULL`(멱등 키, digest, 상태, 버전, 시각). UNIQUE는 NULL 중복을 막지 않으므로 키 컬럼은 반드시 NOT NULL.
- 원본·이벤트가 삭제·접근 불가가 돼도 WorkLog·Link·SourceEvent가 지워지지 않게 FK는 `ON DELETE RESTRICT`(삭제 전파 금지). 원본 상태는 `availability` 컬럼으로만 표현한다.

### 5.2 기준 정보
- `workspaces`, `persons`
- `external_accounts`(service, account_scope, external_id, person_id NULL 가능, is_bot) — `(workspace_id, service, account_scope, external_id)` UNIQUE
- `connectors`(소스·계정 범위·스트림 종류)
- `project_collection_scopes`(project_id, connector_id, 허용 범위) — 자동 연결 시 수집 범위 검사(m1-03 §5)

### 5.3 현재 상태 표 (`version BIGINT`로 충돌 감지)
- `projects`(owner_id, deputy_id), `tasks`(status, assignee_id, category), `worklogs`, `sources`(availability, checked_at), `reviews`(kind, status, decision), `suppressions`
- `worklogs`: `performer_person_id` NULL 가능 + `performer_state`(`known`/`unknown`) + CHECK(known이면 person_id NOT NULL, unknown이면 NULL). 시각은 `performed_at_precision`별로:
  - `exact` → `performed_at`(UTC 밀리초) NOT NULL, `performed_on` NULL
  - `date` → `performed_on`(업무 날짜, Asia/Seoul) NOT NULL, `performed_at` NULL (가짜 자정 금지)
  - `unknown` → 둘 다 NULL
  - CHECK로 조합 강제
- **Link는 대상·근거별 nullable FK + "정확히 하나" CHECK**: `task_id`/`worklog_id` 중 하나, `source_id`/`source_event_id` 중 하나. 다형 문자열 참조를 쓰지 않는다.
- `suppressions`: 활성 억제 중복 금지 — `(workspace_id, scope, source_id 또는 source_event_id, task_id 또는 worklog_id)`에 대해 `released_at IS NULL`인 행 1개만(SQLite·PostgreSQL 모두 부분 UNIQUE 인덱스 지원).
- 행위자 배열·Review 근거 목록처럼 참조 무결성이 필요한 목록은 JSON이 아니라 연결표로 둔다: `source_event_actors`, `review_basis_links`.

### 5.4 추가만 하는 사건 표 (수정 없음)
- `source_events`(정식 이벤트): `(workspace_id, event_key)` UNIQUE, `payload_digest`, `key_version`, 발생·수집 시각, source_id
- `source_event_variants`: 같은 event_key에 다른 digest가 온 경우 보존 — `(workspace_id, event_key, payload_digest)` UNIQUE. **자동 Link·WorkLog 처리에 쓰지 않고** conflict Review로만 노출. UPSERT로 정식 이벤트를 덮지 않는다.
- `event_key_aliases`: 키 정규화 버전이 바뀌었을 때 이전 키 → 새 키 대응
- `change_log`: 모든 현재 상태 변경과 같은 트랜잭션에서 기록(대상, 필드, 행위자, 근거, 요청 ID, 시각, 결과)
- `access_audit`: 공통 데이터 열람·내보내기
- **보호 내용은 이 표들에 두지 않는다.** 변경 전후 값이나 제목·요약처럼 보호 대상인 값은 §5.6의 `protected_contents`에 두고 ID로 참조한다.

### 5.5 운영 표 (상태가 바뀌는 실행·요청 기록)
- `requests`: `(workspace_id, request_id)` UNIQUE + `payload_digest` NOT NULL + 결과(성공 응답 스냅샷). 같은 ID 재시도 → 저장된 결과 반환. 업무 연산과 같은 트랜잭션에서 기록.
- `request_attempts`: 같은 ID·다른 payload 거절, 버전 충돌, 역할 불일치, DB 재시도 소진 등 **반영되지 않은 시도**를 별도 트랜잭션으로 기록. 원 요청의 성공 기록을 덮지 않는다.
- `runs`: 여러 트랜잭션에 걸친 작업(수집 실행, 판별 일괄 처리, Sheets 내보내기, 재동기화). 상태 `running`/`succeeded`/`failed`/`cancelled`, 처리 건수, 실패 사유, 소유자(작업자 ID)·소유 만료 시각. 업무 연산 1건은 Run이 필요 없다.
- `connector_cursors`: connector × 계정 범위 × 스트림(Drive Changes, Drive Activity, GitHub 등 별도) 단위. `version`과 소유권으로 두 수집기가 같은 커서를 동시에 쓰지 못하게 한다.
- `processing_queue`: 수집 페이지 저장 시 함께 넣는 판별 대상. 상태·시도 횟수·소유 만료로 작업자가 죽어도 다시 집어갈 수 있게 한다.
- `inbound_deliveries`: GitHub delivery ID UNIQUE + 처리 상태(`received`/`processed`/`failed`) + 시도 횟수. 수신 기록 후 처리 전에 중단돼도 재개.
- 수집 처리 단위: **외부 페이지 조회(트랜잭션 밖) → 짧은 트랜잭션으로 이벤트·변형·처리 대기·다음 커서·Run 진행 저장.** 커서만 앞서가는 일이 없다.

### 5.6 보호 내용 표 (지울 수 있음, ADR-005·007)
- `protected_contents`(id, workspace_id, 종류, 값, 보존 만료일, `purged_at`): 제목·요약·변경 전후 값·Review 제안 문구 등.
- 사건 표는 `protected_content_id`만 가진다. 보존 기간이 끝나거나 권한이 사라지면 값을 지우고 `purged_at`을 남긴다. 이 삭제 자체는 `change_log`에 "보호 내용 삭제"로 기록한다(값 없이).
- 같은 값이 복제되는 곳을 정책 범위에 포함한다: Review 제안, 이벤트 변형, 요청 결과 스냅샷, Sheets 사본, 백업. 세부(보존 기간, 백업 만료, 사본 재생성)는 G2 전 ADR-007 세부에서 확정.
- 원문 전문은 저장하지 않는다(ADR-005).

### 5.7 조회·내보내기
- 화면과 Sheets는 **service 계층의 조회 함수**를 거친다. 호출자의 신원·팀·역할을 받아 필드별로 제한한다(SQL 뷰만으로 사용자별 인가를 완성하지 않는다).
- Sheets 내보내기는 조회 함수 → 시트 한 방향 스냅샷 교체. 시트에 "읽기 전용, 원본은 시스템"과 내보낸 시각을 남긴다. 작업 내역 건수를 공수·성과로 해석하지 않는다는 안내를 유지한다(ADR-002·007).
- 현재 UI 어댑터(`app/src/adapter.js`)는 조회 결과를 UI 형태로 바꾸는 역할로 유지한다.

### 5.8 인덱스와 분할
- 초기에는 **분할하지 않는다.** PostgreSQL 분할표의 UNIQUE는 분할 키를 포함해야 해서 `event_key` 전역 중복 방지와 충돌한다. 필요해지면 비분할 이벤트 식별표 + 기간별 상세표 구조를 먼저 설계한다.
- 우선 인덱스: worklogs(workspace, performed_at·performed_on, performer), tasks(project), links(task_id), links(worklog_id), links(source_id), links(source_event_id), source_events(source_id, occurred_at), reviews(status = open), change_log(entity, applied_at), processing_queue(status, lease_until). 실제 조회 실행 계획으로 확정한다.

## 6. 이식성 규칙
| 항목 | SQLite | PostgreSQL | 규칙 |
|---|---|---|---|
| 표 | `STRICT` 표 | 일반 | SQLite는 STRICT로 타입 강제 |
| 문자열 ID·코드 | TEXT | TEXT | 비교는 정확 일치. 대소문자 무시 검색은 앱이 정규화한 별도 컬럼(`*_norm`)으로 |
| 정수·버전·건수 | INTEGER(64비트) | BIGINT | INTEGER 대신 BIGINT로 매핑 |
| 불리언 | INTEGER + CHECK(0,1) | BOOLEAN | 어댑터가 변환 |
| 시각(정확) | TEXT `YYYY-MM-DDTHH:MM:SS.sssZ` + CHECK | timestamptz | 앱이 항상 UTC 밀리초로 정규화해서 저장 |
| 날짜(업무일) | TEXT `YYYY-MM-DD` | date | 주간 경계 계산은 앱이 Asia/Seoul 기준으로 |
| JSON(부가 정보만) | TEXT + CHECK(json_valid) | jsonb | 조회 조건에 쓰지 않음. digest는 DB 직렬화가 아니라 앱의 정규화 직렬화(키 정렬·NULL 규칙)로 계산 |
| NULL 정렬 | NULL이 앞 | NULL이 뒤(오름차순) | 정렬에 `NULLS LAST` 명시 또는 NULL 없는 정렬 키 사용. 동률은 항상 ID로 마지막 정렬 |
| 부분 UNIQUE | 지원 | 지원 | 활성 Suppression 등 |
| FK | 연결마다 `PRAGMA foreign_keys=ON` 확인 | 기본 | 어댑터 연결 시 검사·실패 시 시작 중단 |
| UPSERT·RETURNING | 지원 | 지원 | 정식 이벤트 덮어쓰기 금지 규칙과 함께 사용 |
- 마이그레이션: `db/migrations/NNNN_name.sql`. 문법 차이가 있으면 `.sqlite.sql`/`.pg.sql` 쌍. `schema_migrations`로 적용 이력.

## 7. `node:sqlite` 사용 규칙
- 동기 API다. **트랜잭션 동안 연결을 한 요청이 독점**하고, 트랜잭션 함수 안에서는 `await`로 다른 비동기 작업을 기다리지 않는다(외부 호출은 트랜잭션 밖). tx 객체 밖에서 저장소를 쓰는 것을 막는다.
- Node 버전 고정(현재 v26.13.0), `busy_timeout`, WAL, `synchronous=NORMAL` 이상, FK ON을 시작 시 확인한다.
- 긴 조회의 이벤트 루프 지연을 측정한다. 기준 초과 시 Worker 분리나 PostgreSQL 이관을 앞당긴다.
- API가 RC 단계라 Node 업그레이드 때 회귀 테스트를 필수로 돌린다.

## 8. 코드 구조
```text
app/server/
  domain/        순수 업무 규칙: 상태 전이, 판별, 자동 허용 목록, 집계 (DB·HTTP 모름)
  service/       업무 연산 단위 조율: 트랜잭션 시작, 인가, 요청 멱등, 감사, 재시도 구분
  repo/          저장소 인터페이스 + sqlite/ 구현 (postgres/는 이관 시)
  db/migrations/ 번호 붙은 SQL
  connectors/    drive/, github/ (G1·G2 이후)
  export/        sheets/ (G1 이후)
  api/           127.0.0.1 HTTP API
```
- 현재 `app/poc/`의 전이·판별·검증 규칙은 `domain/`으로 옮기고, **같은 DB 트랜잭션 안의 부분 저장을 보정하던 코드**(예약 중간 상태, `:repair` 보정, 행 영수증, 이력 보충, 미완료 행 가시성 검사, Suppression 해제 부분 저장 방어)를 제거한다.
- 남기는 것: 요청 ID·digest·결과 재조회, 역할·범위 재검증, 버전 충돌, 교정 지속성, 여러 트랜잭션 작업의 실행 상태·재시도, 백업·복원.
- 범용 CRUD 프레임워크는 만들지 않는다. 설정은 환경 변수로만, 비밀값은 저장소에 두지 않는다.

## 9. 백업·이관
- SQLite 실행 중 백업은 **온라인 백업 API**만 쓴다(WAL 사용 중 본체 파일만 복사하면 누락·손상 위험). 파일 복사는 정상 종료된 DB에서만.
- PoC에서 백업 → 복원 → `PRAGMA integrity_check` → 참조 검사 → 업무 대조를 한 번 수행한다.
- PostgreSQL 이관 절차: 쓰기 중단 또는 일관된 스냅샷 → FK 순서로 적재 → 대조(행 수·체크섬 + 주간 집계, 열린 Review, 활성 Suppression, 요청 ID 재조회 결과) → 실패 시 SQLite로 복귀 기준.
- 운영 백업은 RPO·RTO, 복원 연습, 보호 데이터의 백업 만료 정책을 G2 전에 정한다.

## 10. 성능 기준선 (PoC 중 측정)
- 5년치 확장 기준 합성 데이터(행 수 + 보호 내용 크기 + 연결·감사 증가량)
- 측정: 주간 요약·프로젝트 목록·검토함 조회 p95, 수집 페이지 저장 시간, 동시 판단 2건 처리, 이벤트 루프 지연, 측정 장비 기록
- 목표(가정): 조회 p95 1초 이내. 미달 시 인덱스 → 집계 캐시 → 이관 순서로 검토

## 11. 보안·권한 (G2 전 확정)
- 실제 인증·인가, DB 계정 분리(실행용·마이그레이션용), 감사 표는 실행 계정이 추가만 가능, 비밀 관리, 내보내기 수신자 범위, ADR-007 세부.

## 12. 로컬 DB PoC 검증 항목
- 완료 판단의 Task·Review·change_log 각 쓰기 지점 실패 → **전체 롤백**(부분 상태 없음)
- 두 연결의 상반된 판단 경쟁 → 하나만 반영, 다른 하나 conflict + `request_attempts`
- 대리 해제와 판단의 경쟁, 거절과 자동 연결의 경쟁
- 커밋 후 응답 유실 → 같은 요청 ID 재시도가 저장된 결과 반환
- 같은 ID·다른 payload → 거절 기록, 원 결과 유지
- 이벤트 같은 키·다른 내용 → 변형 보존, 자동 처리 안 함
- 커서 저장 실패 → 이벤트·대기열도 롤백, 재수집 시 중복 없음
- 처리 대기 항목 소유 만료 → 다른 작업자가 재처리
- 서버 재시작 후 동작, 백업·복원·무결성 검사
- 기존 화면 기준선 54장·탐색 88건·기존 테스트 43개 유지, 로컬 모드 화면 동작 유지
