# M1-01 논리 데이터 모델 상세와 쓰기 계약

> 작성: AX-Lead, 2026-11-19 · 상태: **설계안 v2**(AX-Reviewer 검토 반영) · ADR-004 승인 방향의 상세화, 물리 저장소 무관 · 게이트 G0
> 기준: ADR-002·003·004·006·007, `docs/legacy-context/02_DATA_AND_EVIDENCE.md`

## 1. 결정: SourceEvent는 별도 엔터티로 둔다 (ADR-012 승인)
- **대안 A (권고)**: Source(원본 객체)와 SourceEvent(발생 이벤트)를 분리한다.
- 대안 B: Source의 버전 행으로 이벤트를 표현한다.
- 이유: Drive 활동 1건, GitHub 커밋 1건, 회의 1건은 원본 객체와 수명이 다르다. 원본이 삭제돼도 이벤트(업무 근거)는 남아야 한다(L02). 대안 B는 "삭제된 원본의 과거 이벤트"와 "원본의 현재 상태"가 한 행에 섞인다.

## 2. 엔터티
ID 규칙: 모든 업무 ID는 생성 시 부여하는 불변 문자열(예: `PRJ-…`, `TSK-…`, `WL-…`)이며 행 번호·화면 순서와 무관하다. 원본 키는 업무 ID와 따로 둔다.
버전 규칙: **수정 가능한 엔터티(Task, WorkLog, Link, Review, Project)는 모두 `version`을 가진다.** 모든 수정은 §4의 비교·적용 단일 연산을 거친다.

| 엔터티 | 키 | 주요 필드 | 비고 |
|---|---|---|---|
| Project | `project_id` | name, purpose, owner_id(책임자), deputy_id(대리 확정자, 책임자가 지정·해제), created_at, version | 진척률·유형 없음(L05) |
| Task | `task_id` | project_id, title, category(업무 유형 5종), assignee_id, completion_criteria, status, created_at, version | 상태는 M1-02 |
| WorkLog | `worklog_id` | task_id, performer_id 또는 `unknown`, performer_basis(실행자 확인 근거), performed_at, performed_at_precision(`exact`/`date`/`unknown`), summary, origin(`suggested`/`manual`), run_id, created_at, version | 건수 집계 단위(ADR-002) |
| Source | `source_key` = `{service}:{account_scope}:{external_id}` | title, uri, author_external_id, availability(`available`/`access_denied`/`moved`/`deleted`/`unknown`), availability_checked_at, retained_meta | 원본 객체 |
| SourceEvent | `event_key` (§2.1) | source_key, kind, actor_external_ids[], occurred_at 또는 occurred_range, collected_at, key_version, normalized_payload_digest, run_id | 발생 이벤트 |
| Link | `link_id` | target_type(`task`/`worklog`), target_id, evidence_type(`source`/`event`), evidence_key, role(요청·산출물·검토·참고…), basis, status(`suggested`/`confirmed`/`rejected`), decided_by, decided_at, version | 다대다. 거절도 보존 |
| Suppression | `suppression_id` | scope(`event`/`source`), evidence_type, evidence_key, target_type, target_id, created_by, created_at, released_by, released_at | 교정 지속성(M1-03 §4) |
| Review | `review_id` | kind(`completion`/`link`/`new_task`/`conflict`/`performer`), subject_type, subject_id, proposal, basis_links[], status(`open`/`decided`/`superseded`), decision, decided_by, decided_at, applied_change_id, version | 판단과 적용 분리, 한 번만 적용 |
| History | `change_id` | entity_type, entity_id, field, before, after, basis, actor_id 또는 `system`, run_id, applied_at, result(`applied`/`conflict`/`failed`/`rejected_payload`) | 보호 대상(ADR-007) |
| Person | `person_id` | display_name, external_ids[]({service, account_scope, external_id}) | 계정 ↔ 사람 매핑 |
| Run | `run_id` | trigger, started_at, finished_at, state(`running`/`complete`/`incomplete`/`failed`), manifest(§4.1) | 실행 단위 |
| AccessAudit | `audit_id` | viewer_id, action, resource_type, resource_id, at | 공통 데이터 열람·내보내기 |

### 2.1 SourceEvent 키 (서비스별 이벤트 단위)
핵심 위험은 해시 충돌보다 **입력이 부족하거나 재수집 때 달라지는 것**이다. 외부가 안정적인 이벤트 ID를 주면 그것을 쓰고, 없을 때만 정규화한 값으로 키를 만든다.

| 서비스 | 이벤트 단위 | 키 구성 |
|---|---|---|
| GitHub 커밋 | 저장소 안의 커밋 1개 | `github:{repo_id}:commit:{sha}` |
| GitHub PR 동작 | PR의 열기·병합·리뷰 1건 | `github:{repo_id}:pr:{number}:{action}:{action_id 또는 정규화 시각}` |
| GitHub webhook 전송 | **이벤트 키가 아님** | delivery ID는 수신 중복 방지에만 쓴다 |
| Drive 활동 | DriveActivity 1건을 (동작 × 대상) 조합으로 분해 | `drive:{scope}:{target_file_id}:{action_type}:{정규화 시각 또는 범위}:{행위자 집합 정규화}` |
| Calendar(후보) | 일정 1건의 발생 1회 | `calendar:{calendar_id}:{event_id}:{recurrence_instance}` |

정규화 규칙(`key_version = 1`):
- 시각은 UTC 밀리초 ISO 문자열로 정규화한다. 범위(`timeRange`)는 시작~끝을 함께 넣는다.
- 행위자·대상 배열은 정렬한 뒤 연결한다. 미상 값은 빈 문자열이 아니라 `unknown` 토큰으로 넣는다.
- Drive는 활동 하나에 여러 행위자·동작·대상이 들어올 수 있어(공식 데이터 모델) 위 규칙으로 분해한다. 통합(consolidation) 설정은 PoC에서 고정한다.
- 키 규칙을 바꾸면 `key_version`을 올리고 이전 키와의 대응표를 남긴다.
- 키가 같은데 `normalized_payload_digest`가 다르면 조용히 버리지 않는다. 둘 다 보존하고 `conflict` Review를 만든다.

### 관계
- Project 1—N Task 1—N WorkLog
- Source 1—N SourceEvent
- Link: (Task | WorkLog) N—N (Source | SourceEvent)
- 원본 상태(availability)가 바뀌어도 WorkLog·Link·SourceEvent는 삭제하지 않는다. 화면 노출 범위는 ADR-007에 따라 별도로 줄이며, 미리보기를 끄는 것만으로 보호가 끝난 것으로 보지 않는다.

## 3. 집계 규칙 (ADR-002)
- 작업 내역 건수 = 고유 `worklog_id` 개수. Link나 Source 개수로 세지 않는다. 자료 수를 업무 수로 쓰지 않는다.
- 공동 작업: 한 결과를 여러 사람이 함께 했으면 실행자별 WorkLog 1건씩. 팀 합계는 고유 WorkLog 수다.
- 주 집계: `performed_at` 기준(Asia/Seoul, 월~일). `precision = unknown`이면 주간 집계에서 빼고 "실행 시각 미상"으로 따로 센다. `collected_at`으로 대체하지 않는다. `date`면 해당 날짜의 주에 넣되 시각은 표시하지 않는다.
- 실행자 `unknown`: 팀 합계에는 넣고, 담당자별 집계·참여 인원 수에는 넣지 않는다.
- **완료되지 않은 Run(`incomplete`/`failed`)이 만든 레코드는 정상 집계에서 제외**하고 "확인 중"으로 따로 표시한다. Run이 `complete`가 되면 포함한다.

## 4. 쓰기 계약 (M2 PoC 기대 결과)

### 4.1 실행(Run)과 변경(change)
- 하나의 수집·판단 실행 = Run 1개. Run은 시작 시 **manifest**를 먼저 기록한다: 만들거나 바꿀 변경 목록 `[{change_id, entity, entity_id, op, expected_version, payload_digest}]`.
- 새로 만들 레코드의 ID(`worklog_id`, `link_id` 등)는 manifest 작성 시점에 미리 정한다. 재시도할 때는 **같은 ID를 재사용**하므로 WorkLog가 두 번 만들어지지 않는다.
- 변경 하나하나가 멱등 단위다. Run은 모든 변경이 `applied`(또는 사유가 기록된 `conflict`)이고 History가 모두 기록됐을 때만 `complete`가 된다.

### 4.2 불변식
1. **비교와 적용은 하나의 배타적 연산이다.** `expected_version` 확인과 쓰기 사이에 다른 쓰기가 끼어들 수 없어야 한다(저장소가 무엇이든 잠금·조건부 쓰기 등으로 보장). 보장할 수 없는 저장소는 OD-09 후보에서 제외한다.
2. 같은 `change_id`에 다른 `payload_digest`가 오면 거부하고 `rejected_payload`로 기록한다.
3. Review 한 건은 한 번만 적용된다. `decided` 상태의 Review를 다시 적용하려는 요청은 기존 `applied_change_id`를 돌려준다.
4. 수집 실패·권한 부족은 기존 데이터를 지우거나 상태를 바꾸지 않는다. Run 결과만 "갱신 실패"로 남는다(L01).

### 4.3 상황별 기대 결과
| 상황 | 기대 결과 |
|---|---|
| 같은 `change_id` 재시도, 이미 적용됨 | 재적용하지 않고 기존 결과를 돌려준다 |
| 적용됐지만 응답이 유실됨 | 재시도가 위와 같이 처리된다. 결과는 재조회로 확인한다 |
| 같은 이벤트 재수집 | `event_key`가 있고 digest가 같으면 새 SourceEvent를 만들지 않는다. `collected_at`만 갱신 가능 |
| 버전 불일치 | 덮어쓰지 않는다. History `conflict` + `conflict` Review |
| 동시 요청 2개(같은 버전) | 정확히 하나만 적용, 다른 하나는 conflict |
| WorkLog는 저장, Link 저장 실패 | Run `incomplete`. 해당 WorkLog는 정상 집계 제외. 같은 Run을 재개해 미적용 변경만 같은 ID로 재시도 |
| History 기록 실패 | 변경은 적용됐어도 Run `incomplete`. 재개 시 History만 보충(같은 `change_id`) |
| 복구 도중 다시 실패 | Run은 `incomplete` 유지, 재개 횟수 기록. 3회 실패하면 `failed` + 사람에게 알림 |
| 원본 접근 불가 | Source.availability만 갱신. 일시 실패(`unknown`)와 확인된 삭제(`deleted`)를 구분 |

## 5. 뷰 모델 어댑터 계약 (M1-05 테스트 대상)
현재 UI의 형태(`projects[].tasks[].subtasks[]`, `files[]`, `reviews[]`)로 투영하는 규칙. **가짜 Source나 가짜 날짜를 만들어 불변식을 맞추지 않는다.**

| 운영 모델 | 뷰 모델 | 규칙 |
|---|---|---|
| WorkLog | `Subtask` | 1:1. `subtask.id = worklog_id`. WorkLog를 복제하지 않는다 |
| WorkLog의 confirmed Link 여러 개 | `Subtask.sourceId` | 대표 자료 1개: 현재 confirmed인 Link만 대상, role 우선순위(산출물 > 검토 > 요청 > 참고) → `decided_at` 최신 → `link_id` 사전순. 대표가 rejected되면 다시 계산 |
| confirmed 자료가 없는 WorkLog | `Subtask.sourceId` 없음 | **UI 최소 동작 변경 필요**: sourceId를 선택 값으로 받고 자료 버튼을 숨긴다(§6) |
| event Link | `files[]` | 이벤트의 `source_key`로 Source 1행을 만든다 |
| 여러 태스크에 공유된 Source | `files[]` | 프로젝트마다 1행. `taskId`·`topic` = 그 프로젝트 안의 대표 태스크(현재 confirmed 중 `decided_at` 최신 → `task_id` 사전순) |
| 미연결 Source(suggested만) | 표시 안 함 | 검토 흐름으로만 노출 |
| availability ≠ available | `files[]` 행 유지 | 미리보기 비활성. 상태 문구는 UI 변경 승인 후 |
| `precision = date` | 날짜만 | **UI 최소 동작 변경 필요**: 시각 자리를 비운다(가짜 00:00 금지) |
| `precision = unknown` | 주간 집계 제외 | **UI 최소 동작 변경 필요**: `clockTime`이 잘못된 날짜에서 예외를 내지 않게 하고 "시각 미상" 표시 |
| performer `unknown` | `owner` 문자열로 넣지 않음 | **UI 최소 동작 변경 필요**: 참여자 계산(`app.ts` 참여자·주간 참여 인원)에서 제외 |
| Review `kind = completion` | `reviews[]`(taskId 필수) | 기존 완료 판단 UI로 투영 |
| Review 그 외 종류 | 투영하지 않음 | 기존 "완료인가요?" 버튼으로 처리하지 않는다. UI 지원 전까지 별도 대기 목록(운영 데이터)에만 둔다 |
| 미완료 Run의 레코드 | 투영하지 않음 | Run `complete` 후 반영 |

계약 테스트 불변식:
1. 뷰의 subtask 수 = 완료된 Run의 고유 WorkLog 수
2. 모든 `sourceId`는 같은 프로젝트 `files[]`에 존재
3. 주간 합계 = `model.js weekRecords` 결과, 시각 미상 WorkLog는 들어가지 않음
4. rejected Link는 뷰에 없음
5. `reviews[]`에는 completion 종류만 있음
6. `unknown` 실행자는 담당자 목록·참여 인원에 없음
7. 같은 입력이면 항상 같은 대표 자료·대표 태스크(결정적)

## 6. UI 최소 동작 변경 목록 (디자인 변경 없음, 별도 태스크)
사용자 승인 범위("디자인을 바꾸지 않는 UI 수정")에 들어가며 M1-05 이후 Builder 태스크로 진행한다.
1. `Subtask.sourceId` 선택 값 처리, 자료 없으면 버튼 숨김
2. 날짜만 있는 시각, 시각 미상 표시와 예외 방지
3. 실행자 미상을 참여자·담당자 집계에서 제외
4. completion 이외 Review가 들어와도 판단 UI에 섞이지 않게 방어
- 다대다를 모두 보여 주는 `sourceIds[]` 확장은 디자인 변경이 될 수 있어 M2 결과를 보고 따로 결정한다.

## 7. 합성 데이터 픽스처 시나리오 (M1-05)
가상 인물만 사용한다(기존 3명 재사용).
1. 같은 Drive 문서의 편집 이벤트 3건 → 1 Source, 3 SourceEvent, WorkLog 판단은 Review
2. GitHub 커밋 메시지에 `TSK-…` 명시 → Task Link 자동, WorkLog 연결은 Review
3. 한 자료가 두 태스크의 근거 → 대표 태스크 결정성
4. 같은 이벤트 재수집 2회 → SourceEvent 1건 유지
5. 같은 키, 다른 digest → 둘 다 보존 + conflict
6. 원본 삭제 후에도 WorkLog·Link 유지, availability = deleted
7. 실행자 미상, 시각 미상, 날짜만 있는 WorkLog → 집계·표시 규칙
8. 자료 없는 수동 WorkLog
9. 버전 충돌, 동시 요청 2개 → 하나만 적용
10. 부분 실패(Link 실패, History 실패, 응답 유실, 복구 중 재실패) → Run 상태와 집계 제외
11. completion 외 Review → `reviews[]`에 나타나지 않음
