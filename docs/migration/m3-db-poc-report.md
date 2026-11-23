# M3 SQLite 로컬 DB PoC 결과 — 미완료 / 재검증 한도 도달

작성: AX-Builder · 2026-11-19 · 브랜치 `chore/ui-baseline-verification`

> 후속 차수: Lead의 small() 교정 후 기존 서버 18/18을 포함해 신규 보강 26/26 통과. 아래는 최초 차수 이력이며 현재 상태는 `m4-drive-connector-report.md` 참조. 같은 파일 2연결 대리 해제/판단·거절/자동 Link 경쟁, 수집 403 failed Run/기존 source 불변, JSONL 전체 참조 export/import(건수·checksum·열린 Review·활성 Suppression), seed digest/활성 lease 보호, 외부 프로세스 장기 잠금 감사 대기열/재기록을 보강했다. 기존 43/43, navigation 88/88, visual 54/54, typecheck/build 통과. 실제 수집은 실행하지 않았다. reset 경합·파일럿 기준 정보 등 미해결 게이트로 전체 완료 판정은 보류한다.

**완료 판정 불가.** 새 서버 최종 테스트는 18개 중 17개 통과, 작은 픽스처 브라우저 1개 실패다. 사용자 지시의 수정·재검증 3회 한도에 따라 추가 구현·수정을 중단했다. commit/push/추가 에이전트/외부 네트워크/실데이터 접근은 수행하지 않았다.

## 실행과 구조

`app/`에서 `npm.cmd run poc`, 초기화는 `npm.cmd run poc:reset`, 검증은 `npm.cmd run test:server`.
주소: `http://127.0.0.1:8766/?data=local`. 기본 대규모 데이터는 7 프로젝트·50 태스크·189 표시 작업 내역이며 큰 픽스처 브라우저 검사는 통과했다. 내부 DB는 `app/server/.runtime/local.sqlite`, 생성 성능 데이터는 `.benchmark/`에 두며 둘 다 Git 제외다. 기존 8766 서버는 종료하거나 교체하지 않았다.

- domain/rules.cjs: UUIDv7, 정규 직렬화 digest, T1~T5 순수 역할 규칙.
- domain/normalize.cjs: 기존 collector의 키·시각·행위자 정규화 규칙 이전. 기존 PoC 모듈 의존 없음.
- service/index.cjs: 업무 트랜잭션, 요청 replay/digest, busy 최대 3회, 실패 별도 audit, 판단·전이·대리·공수 아닌 작업 내역·삭제·조회.
- service/collector.cjs: 합성 페이지 저장, 커서·Run·이벤트·대기열 원자성, 변형 격리, 소유 만료 재처리, Task 자동 Link·억제 생성·해제.
- repo/sqlite/: 연결 초기화, BEGIN IMMEDIATE, 만료되는 tx capability, 시드와 기존 어댑터 투영용 조회.
- db/migrations/0001_initial.sqlite.sql: 번호 SQL, schema_migrations 적용 이력, STRICT, 복합 FK, CHECK와 인덱스, 추가 전용 표 UPDATE/DELETE 차단.
- api/server.cjs: 127.0.0.1, Host·Origin·허용 정적 파일·JSON 크기·입력 필드 검증.
- backup.cjs: node:sqlite 온라인 backup → 재개방 → integrity_check/FK/business snapshot digest.
- benchmark.cjs: 5년 확장 데이터 생성 및 p95·지연 측정 도구. 실행 미완료(아래).

새 npm 의존성은 추가하지 않았다. Node v26.13.0 환경에서 구현했다. 기존 app/poc는 비교용으로 보존했다. UI의 /api/recovery 목록·재개 경로는 제거하고 같은 요청 ID 재전송은 유지했다.

## 표 목록

workspaces, persons, external_accounts, connectors, project_collection_scopes, projects, tasks, worklogs, sources, reviews, links, suppressions, source_event_actors, review_basis_links, source_events, source_event_variants, event_key_aliases, change_log, access_audit, protected_contents, requests, request_attempts, runs, connector_cursors, processing_queue, inbound_deliveries 및 schema_migrations.

기존 ID는 display_key에, 내부 ID는 UUIDv7에 저장한다. 합성 JSON을 수정하지 않고 읽어 시드한다. 제목·요약·제안·전후 값 등은 protected_contents로 분리한다. worklog 실행자 known/unknown과 정확·날짜·미상 조합 CHECK, Link의 대상/근거 각각 정확히 하나 CHECK, 활성 Suppression 네 조합 부분 UNIQUE, workspace 복합 FK가 있다.

## 설계 §12 결과

| 항목 | 자동 검증 결과 / 한계 |
|---|---|
| Task·Review·change_log 쓰기 실패 전체 롤백 | 통과: tasks/reviews/audit/request 각각 실패 주입, 상태·요청·감사 미반영과 별도 실패 audit 확인 |
| 두 연결의 상반 판단 | 통과: 같은 DB 파일 open 2회, 첫 연결 쓰기 잠금 중 둘째 요청 진입·busy 재시도, 한 결정 반영·다른 요청 conflict/attempt 기록 |
| 대리 해제와 판단 경쟁 | 부분: 해제 후 project version 충돌 검사는 통과. 두 연결의 실제 대리 해제 경쟁 미작성 |
| 거절과 자동 연결 경쟁 | 부분: source 억제·해제·자동 Link 경계 검사는 통과. 두 연결 실제 경쟁 미작성 |
| 커밋 후 응답 유실 / 같은 ID | 서비스 replay·재개방 통과. 브라우저는 앞선 작은 픽스처 탐색에서 실패해 응답 유실 단계에 도달하지 못함 |
| 같은 ID·다른 payload | 통과: rejected_payload, 기존 requests 결과 유지, request_attempts 추가 |
| 같은 event_key·다른 내용 | 통과: 기존 event 유지, variants·conflict Review 저장, 큐 추가 없음 |
| 커서 실패 → 이벤트·대기열 롤백 | 통과: cursor 체크포인트 실패 후 신규 이벤트/큐 없음, 같은 요청 성공 |
| 큐 소유 만료 재처리 | 통과: 타 작업자 소유 중 거부, 만료 후 재획득, 구 작업자 처리 거부, 새 작업자 완료 |
| 재시작·백업·복원·무결성 | 통과 범위: 파일 재개방 요청 replay, 온라인 백업 복원 integrity_check=ok/FK 0/business digest 일치. 복원 DB에서 requests replay 직접 대조는 미작성 |
| 화면·기존 기준선 | 큰 로컬 브라우저 통과, 7/50/189 및 3명 확인. 작은 브라우저 실패. typecheck/build 성공, 기존 43/43, navigation 88/88, visual 54/54 |

## 기존 JSON 시나리오와의 대응

| 기존 시나리오 | DB 결과 / 이전 범위 |
|---|---|
| poc 1~3: 응답 유실·digest·같은 버전 경쟁 | 서비스 replay, 재개방, 두 연결 경쟁 테스트 통과 |
| poc 4~5: WorkLog/Link 부분 실패·History 보충 | **트랜잭션으로 대체됨**. worklog와 존재하지 않는 source Link를 한 연산으로 요청하면 WorkLog도 없음. audit 실패 시 Task/Review도 없음 |
| poc 6: 부분 복구 3회 실패 | **트랜잭션으로 대체됨**. 업무 부분 상태 복구 Run은 없음. busy 전체 재시도 최대 3회. 소진과 장기 DB 잠금 감사 보존은 미검증 |
| poc 7, regression A5/B2: 이벤트 충돌·digest 위장 | 입력을 재정규화해 digest 계산. variants는 큐에 넣지 않음. 변형 테스트 통과 |
| poc 8~11: 자동 허용 목록·억제·해제·악성 제안 | Task Link만 생성, WorkLog 생성 없음, 억제·해제 테스트 통과. 의미 제안/악성 LLM 후보 전체 시나리오 미이전 |
| poc 12: 완료 전이 1~10 | 순수 T1~T5 및 일부 서비스 역할 검사 통과. 모든 전이의 DB 통합 시나리오·self_approved 기록 검증 미이전 |
| poc 14 / A8: 수집 권한 실패 Run | 외부 접근 없음, 페이지 단위 실패 원자성 검증. 조회 실패/권한 거절의 Run failed 기록 경로 미구현 |
| 자동 availability / 시스템 요약 | availability와 Link/WorkLog 보존 통과. 시스템 작성 요약만 수정하는 서비스 미구현 |
| A1/A2/A3/A4: 부분 생성 세탁·보조 필드 유출·예약 우회 | **트랜잭션으로 대체됨**. 부분 생성 자체 없음, 결정·Task·감사 함께 롤백. 기존 시드의 불완전 Run 가시성은 유지 |
| A6/B5: actor·clock·reason·basis·정확한 conflict 원인 | actor/time/reason 저장. basis의 관계 표 시드/서비스 기록 및 conflict 상세 원인은 부족함(완전 이전 아님) |
| A7: timezone-equivalent / actor ordering | domain 정규화 코드는 이전. 새 서버 독립 테스트로 해당 케이스 미작성 |
| A9: 로컬 초기화 | 기존 reload 동작 보존. 새 브라우저 reset 검증 미도달 |
| B1: stale version의 영구 예약 | **트랜잭션으로 대체됨**. version 검사가 쓰기 전 실행되고 deciding 상태 자체 없음 |
| B3: suppression 해제 일부 반영 | **트랜잭션으로 대체됨**. 해제와 change_log가 같은 tx. 해당 지점 실패 주입 독립 테스트 미작성 |
| B4: Source Link 거절 | source Link 거절/억제/해제 테스트 통과 |
| B6/B7 및 Reviewer 3회차: 복구 목록·진행 중 예약·보정 실패 | **트랜잭션으로 대체됨**. API/UI 복구 목록, deciding, :repair 없음. 커밋된 판단은 재조회, 요청 결과는 동일 ID replay. 브라우저 단계는 미검증 |
| B8: 참조 검증 | FK 검사와 음성 대조군(타 workspace·Link CHECK·삭제 RESTRICT) 통과. 기존 JSON history/manifest 내부 참조 모든 음성 대조군은 미이전 |
| B9: 시드 갱신·기존 판단 보존 | 일반 재개방은 시드 건너뜀. --reset은 종료한 DB 파일 보관 후 새 시드. seed digest 변경 자동 판별은 미구현 |

## JSON PoC 대비 제거한 우회 코드와 남은 것

기존 파일은 삭제하지 않았으므로 물리적 삭제 줄 수는 **0**이다. 새 런타임에서 제외한 기존 파일 전체 크기(개행 기준)는 store.cjs 18줄, write-service.cjs 39줄, decisions.cjs 34줄, transitions.cjs 15줄, matching.cjs 38줄이다. 이 수치를 전부 우회 코드 제거량으로 해석하지 않는다.

| 우회 경로 | 기존 위치·줄 수 | 새 런타임 |
|---|---|---|
| 행 단위 CAS·파일 교체 | store.cjs 18줄 전체 | repo DB tx로 교체 |
| manifest/receipt/History 보충/부분 Run 재개 | write-service.cjs 39줄 전체 | 해당 엔진을 호출하지 않음 |
| Review 예약·복구·:repair·복구 요청 목록 | decisions.cjs 34줄 전체(복구 관련 함수 포함) | 해당 파일을 호출하지 않음 |
| 예약→Task→최종 Review requires | transitions.cjs 15줄 중 순수 역할 판단 이외 | 역할 규칙만 domain으로 이전, 전부 tx로 적용 |
| 불완전 생성 격리·미완료 해제 방어 | matching.cjs 38줄 중 해당 분기 | 신규 업무 연산에서는 불필요. 기존 시드 불완전 Run은 조회에서 제외 |
| /api/recovery·retryLocal·복구 목록 UI | poc/server.cjs, src/app.ts | 새 API 없음, 화면 경로 제거 |

남은 것: 요청 ID·digest·결과 replay, 버전/역할 재검증, 억제, 수집 Run·queue lease·재시도, 기존 불완전 시드 필터, 온라인 백업·복원. 예약 우회 코드의 함수별 순수 삭제 줄 수를 산정하는 정밀 diff 분석은 미완료다.

## 성능

후속 차수에서 benchmark.cjs 1회 완주(exit 0): 1,500,000 이벤트·200,000 작업 내역·1,250,000 change_log 추가, 828,072.54ms, DB 1,769,005,056 bytes. 조회 p95 weekly 1.1304ms / projects 0.2517ms / reviews 0.2984ms, 이벤트 SQL 1,000행 삽입 p95 377.9125ms, 조회 구간 루프 지연 max 24.3794ms / p95 20.9060ms. Node v26.13.0, SQLite 3.54.0, i7-9750H, RAM 31.77GiB. 아래 중단 기록은 최초 차수 이력이다. 전체 Collector 페이지 tx 성능이 아니라 SQL 삽입 측정이며 M4 보고서의 한계를 함께 본다.

benchmark.cjs 목표: 30명 확장 가정 5년치 이벤트 1,500,000·작업 내역 200,000·change_log 1,250,000행. 생성 DB는 별도 ignored 파일이다. 서비스 metrics()의 weekly/projects/reviews p95, 이벤트 1000행 삽입 p95와 이벤트 루프 지연을 출력하도록 작성했다.

실제 실행은 events 600,000 진행 로그까지 확인했으며, 검증 한도 중단에 따라 Ctrl+C로 종료했다(exit 1). 중단 시 DB 본체 415,137,792 bytes, WAL 8,260,632 bytes. 생성 완료 수·조회 p95·페이지 저장·루프 지연 **측정 결과 없음**. full benchmark의 page 계측도 실제 Collector.page(커서/Run/queue 포함)가 아닌 SQL 이벤트 삽입이어서 요구 성능 기준의 대체 증거로 쓸 수 없다.

## 최종 검증·실패 이력

- `npm.cmd run typecheck`: 성공(exit 0).
- `npm.cmd run build`: 성공(exit 0). 현재 셸에 기존 Codex Python runtime PATH를 추가했다. build.py는 수정하지 않았다.
- `npm.cmd test`: 43 tests / 43 pass / 0 fail.
- `npm.cmd run test:navigation`: 88 checks / 0 failures / 0 errors. build와 일부 실행 시간이 겹쳤으므로 완전히 고정된 최종 산출물 재검사로 과장하지 않는다.
- `npm.cmd run test:visual`: 54 checks / 0 failures / 0 errors, 기준·offline 차이 모두 0. 기준 이미지 재생성 안 함.
- 최종 `npm.cmd run test:server`: 18 tests / 17 pass / 1 fail. 서비스·DB 16개와 큰 로컬 브라우저 1개 통과.
- 실패: `SQLite browser decision failure, same request retry, response loss/reload, Origin guard`; `.task-toggle` click 30000ms timeout. 작은 시드에서 category가 빠져 주제별 목록에 태스크가 렌더링되지 않았다.
- 수정 재검증 1: 브라우저 초기 클릭 상태 처리 전 실패. 2: 펼침 상태 확인 후에도 동일 실패. 3: category/created_at 치환을 시도했으나 파일에 반영되지 않은 채 동일 실패. 한글을 포함한 PowerShell→Node 파이프 문자열 치환이 불일치한 것으로 추정(추가 수정·재검증 안 함). 최초 스키마 모듈 미존재 RED와 Python/PATH/npm.ps1 환경 오류는 별도 구현·환경 확인 이력이다.

## 설계 차이·미해결 위험 (다음 차수 전 Lead 판단 필요)

1. 작은 브라우저 픽스처 실패가 남는다. 테스트 완화·삭제로 통과시키지 않았다. API의 small()에서 기존 category/created_at 누락을 확인했고, 일반 large 시드는 원본 값을 보존한다.
2. §12의 대리/자동 연결 두 연결 경쟁, 기존 시나리오 전체 재작성, 성능 측정이 미완료여서 Acceptance Criteria 전체 미충족.
3. repo는 저장소 구현에 종속된 SQL을 service에서 사용한다. PostgreSQL 이관용 명시적 repo 업무 인터페이스를 아직 분리하지 못했다. tx 외 접근은 capability 만료 검사로 차단한다.
4. G0 고정 workspace·합성 로컬 행위자 모드다. 읽기 service의 사용자/역할별 필드 제한 인터페이스는 미구현. 실데이터·운영 인증으로 사용할 수 없다.
5. schema에 review_basis_links가 있으나 기존 basis가 이벤트 키인 경우의 Link 매핑 및 시드가 미완성. 자동 업무의 basis 감사 기록도 부족하다. self_approved 및 decided_at 기록이 기존 계약 수준으로 완성되지 않았다.
6. 현재 상태의 일부 legacy 표시·참조는 metadata JSON에 남는다. 핵심 FK·상태는 정형 컬럼이지만 모든 참조 목록과 가시성 조건이 정형화된 것은 아니다. snapshots는 전체 읽기라 확장 성능 근거 없음.
7. protected_contents 값 삭제/기록은 통과했지만 보존 만료·백업 만료 정책, 사람 작성 요약 보호 갱신 서비스, 원본 접근 불가 시 모든 보호 내용 정리 범위는 미완료.
8. 장기 DB 잠금으로 실패 감사 트랜잭션도 busy면 error.auditError로 노출할 뿐 durable request_attempts를 보장하지 못한다. 이 경우 재기록 운영 절차가 필요하다.
9. runs/queue/cursor/inbound/aliases 표는 있으나 inbound·키 버전 alias 등록·취소·조회실패 Run 전이 등 모든 운영 서비스가 구현된 것은 아니다. 큐 처리는 명시 ID Task Link까지만 하며 비자동 후보 Review 전체 흐름은 미완료.
10. reset은 기존 DB close 후 본체를 보관한다. 동시 다른 프로세스 실행 중 reset 보호와 시드 버전 자동 판별은 미검증. 실행 중 백업은 node:sqlite backup만 사용한다.
11. SQLite FK/STRICT는 검증했으나 날짜 CHECK는 형식 중심이며 실존 날짜 전체 검증/모든 이벤트 UTC 정밀도 DB CHECK가 완비되지 않았다.

## 변경 파일

신규 `app/server/`: domain/{rules,normalize}.cjs, service/{index,collector}.cjs, repo/sqlite/{index,records}.cjs, db/migrations/0001_initial.sqlite.sql, api/server.cjs, backup.cjs, benchmark.cjs, tests/{db,service,browser}.test.cjs.
기존 수정: app/package.json, app/.gitignore, app/src/app.ts, 생성 app/app.js. 문서: 이 보고서와 tasks/current-state.md.

`app/data.json`, `app/assets/`, `app/build.py`, 기존 `app/tests/*.test.cjs`, `app/poc/dataset/synthetic-large.json`은 이번 작업에서 수정하지 않았다. 보호 tracked 파일에 대한 git diff 출력은 비어 있다. dataset은 시작 시 미추적 상태였으므로 Git 기준선 비교로 불변을 입증했다고 주장하지 않는다.

작업 트리에는 기존 M0~M2 및 Lead 문서 변경도 들어 있다. `git diff --stat`은 미추적 신규 app/server와 이 보고서를 포함하지 않으며, 아래 숫자는 이번 작업만의 diff가 아니다(상태 문서에 이 결과를 추가하기 전 기준).

```text
 .gitignore                       |   2 +
 AGENTS.md                        |  77 ++++++++++++++++++++++
 CLAUDE.md                        |  17 +++++
 app/.gitignore                   |   8 +++
 app/app.js                       | 135 ++++++++++++++++++++++++++++++---------
 app/package.json                 |  16 ++++-
 app/src/app.ts                   | 109 ++++++++++++++++++++++---------
 app/src/model.js                 |   4 +-
 app/styles.css                   |   3 +
 docs/02-decisions-needed.md      |   4 +-
 docs/decisions/README.md         |   5 +-
 docs/migration/open-decisions.md |   5 ++
 tasks/backlog.md                 |  22 ++++---
 tasks/current-state.md           | 110 ++++++++++++++++++++++++++++++-
 14 files changed, 441 insertions(+), 76 deletions(-)
```

다음 작업: Lead가 실패·설계 차이와 추가 차수 허용 여부를 검토. 독립 Reviewer 검토 및 완료 판정 전이며, 자동 후속 수정·Commit·Push 금지.
