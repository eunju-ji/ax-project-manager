# 실데이터 증분 반영 형식과 실행 절차

## GitHub·AI 색인 및 삭제 확장 (ADR-020)

- `project_removals`, `person_removals`, `source_removals`: ID 문자열 배열. 빈 값, 중복, 없는 대상, 같은 실행의 추가·갱신과 겹치는 삭제를 거부한다.
- 프로젝트에 태스크가 남거나, 사람에게 태스크 담당·작업 내역 수행·프로젝트 owner/deputy 참조가 남으면 삭제를 거부한다. 사람의 `externalAccounts` 행은 함께 삭제한다. 근거를 참조하는 links가 남으면 근거 삭제를 거부한다. 작업 내역·태스크 삭제 시 대상 links는 함께 삭제한다.
- `person_updates: [{person_id, display_name}]`: 이름은 1~80자 문자열. 사람이 고친 값은 보호한다.
- 최상위 `purge`는 불리언이다. `true`이면 삭제 대상과 entity_type/entity_id가 일치하는 기존 history를 제거하고 삭제 이력에 `before:null, after:null, reason:'purge'`를 남긴다. 기본 삭제는 기존 before 값을 보존한다. 사람의 수정 보호는 purge에도 적용한다.
- `state.json`의 `excluded: {projects:[], persons:[], chat_spaces:[]}`로 재유입을 막는다. 추가·갱신 레코드의 직접 참조와 작업·링크를 통한 간접 참조를 검사한다. sources의 source_key·uri에 제외 Chat 스페이스 ID(`spaces/` 뒤 부분)가 있으면 `excluded_reference`로 전체 delta를 거부한다.
- sources.kind의 `commit`, `pull_request`, `issue`, `ai_chat`은 `message`처럼 folder_path가 필요 없다. 자료 창에는 uri가 있을 때만 **원본 열기** 링크를 표시한다. 허용 링크 호스트에 github.com, claude.ai, chatgpt.com을 추가한다.
- 새 필드에도 원자적 반영, dry-run, run_id 재실행과 ignored 집계를 동일하게 적용한다.

### 색인 수집기

`app`에서 실행한다. 실사용 시 승인된 경로와 계정만 사용한다.

```sh
node server/real/collect-github.cjs --state <state.json> --out <file> [--since ISO]
node server/real/collect-ai-chats.cjs --out <file> [--claude-code-dir <dir>] [--project-filter <폴더부분문자열,...>] [--imports <dir>] [--since ISO]
```

GitHub 설정은 `state.github = {login, repos:[], checkpoint}`다. repos가 비면 최근 90일에 push된 계정 저장소를 조회한다. since 기본값은 checkpoint, 없으면 90일 전이다. `GITHUB_TOKEN`은 요청 헤더에서만 사용한다. 실패는 errors에 코드만 남기며 불완전한 결과로 체크포인트를 전진시키지 않는다.

AI imports는 `claude/conversations.json`, `chatgpt/conversations.json`을 읽는다. ZIP은 먼저 직접 압축 해제해야 한다. Claude Code는 기본 `~/.claude/projects`를 읽고 Temp 폴더를 제외한다. 본문·diff·댓글·도구 입력 전문은 결과에 저장하지 않는다. 제목은 첫 줄 160자 이내, 수정 경로는 cwd 기준 최대 20개, 활동일은 Asia/Seoul 기준이다. 색인 생성은 delta 적용이나 태스크 완료·공수 확정과 별개다.

2026-11-20 / AX-Builder. 수집·판별은 스케줄 에이전트가 수행한다. 이 도구는 로컬 JSON 검증·병합만 수행하며 Google API 호출이나 수집 예약을 하지 않는다. 아래 예시는 전부 합성 데이터다.

## 스케줄 에이전트용 한 페이지

`app` 디렉터리에서 실행한다. 기본 대상은 `server/.real/real-dataset.json`이고 대상과 같은 폴더의 `state.json`, `runs.log`, `apply-delta.lock`을 사용한다. 대상 폴더는 미리 준비되어 있어야 한다. 실제 계정 전용 폴더 접근 권한은 수집 실행자에게만 부여한다.

```sh
node server/real/apply-delta.cjs delta.json --dry-run
node server/real/apply-delta.cjs delta.json
# 합성 데이터 검증 또는 다른 데이터셋
node server/real/apply-delta.cjs delta.json --dataset /path/to/fixture.json --dry-run
```

매 실행마다 고유 `run_id`와 시간대가 포함된 ISO `collected_at`을 사용한다. 실패한 실행은 동일 JSON으로 재시도한다. 체크포인트는 해당 서비스에서 성공적으로 읽은 마지막 지점만 보낸다. 수집 실패·잘림이 있으면 해당 체크포인트를 전진시키지 않는다. 본문·토큰·첨부 원문 대신 짧은 요약과 원본 링크만 보낸다. `notes`는 검증만 하며 저장하지 않는다.

```json
{
  "run_id": "COLLECT-20261120-1800",
  "collected_at": "2026-11-20T18:00:00+09:00",
  "checkpoints": { "drive": "2026-11-20T08:59:00Z" },
  "persons": [{ "person_id": "DEMO-P", "display_name": "합성 담당자" }],
  "projects": [{ "project_id": "DEMO-PR", "name": "합성 프로젝트", "owner_id": "DEMO-P" }],
  "tasks": [{ "task_id": "DEMO-T", "project_id": "DEMO-PR", "assignee_id": "DEMO-P", "title": "초안 검토", "status": "in_progress", "category": "검증" }],
  "worklogs": [{ "worklog_id": "DEMO-W", "task_id": "DEMO-T", "performer_id": "DEMO-P", "title": "검토 의견 정리", "summary": "초안 검토 의견을 정리함", "performed_at_precision": "exact", "performed_at": "2026-11-20T08:30:00Z" }],
  "sources": [{ "source_key": "drive:demo-file", "title": "합성 검토 문서", "kind": "document", "folder_path": ["합성 프로젝트"], "uri": "https://drive.google.com/file/d/demo-file/view", "availability": "available" }],
  "links": [{ "link_id": "DEMO-L", "target_type": "worklog", "target_id": "DEMO-W", "evidence_type": "source", "evidence_key": "drive:demo-file", "status": "confirmed", "role": "산출물" }],
  "notes": "합성 형식 예시"
}
```

기존 태스크 변경은 `tasks` 재전송 대신 아래처럼 별도 실행의 `task_updates`에 보낸다. 완료 상태는 활동만으로 추정하지 않고 판별 근거가 있는 경우에만 보낸다.

```json
{"run_id":"COLLECT-20261120-2100","collected_at":"2026-11-20T21:00:00+09:00","task_updates":[{"task_id":"DEMO-T","status":"completed","completed_at":"2026-11-20","completion_basis":"완료 판별 근거 요약"}]}
```

stdout은 요약 JSON 한 줄이다. `ok: true`면 exit 0, 거부·입력·I/O 오류면 exit 1이다. `added`, `updated`, `removed`, `ignored`, `rejected`, `errors`를 확인한다. 오류는 값 대신 코드와 위치만 출력하므로 비밀값을 다시 노출하지 않는다. `--dry-run`은 JSON·state·로그·lock 모두 변경하지 않는다. lock이 있으면 dry-run도 거부한다.

## 병합 계약

- 최상위 필수값: `run_id`(영숫자·하이픈·밑줄, 1~64자), `collected_at`(시간대 포함 ISO). 선택값: `checkpoints`, 위 6개 레코드 배열, `task_updates`, `worklog_updates`, `project_updates`, `worklog_removals`, `task_removals`, `notes`. 그 밖의 최상위 필드는 거부한다.
- 각 배열의 키: `person_id`, `project_id`, `task_id`, `worklog_id`, `source_key`, `link_id`. 새 레코드의 `run_id`와 `created_run_id`는 실행 ID로 강제한다. 기존 키는 두 provenance 필드를 제외한 내용이 같으면 무시하고, 다르면 전체 delta를 거부한다. JSON 객체 속성 순서는 무관하다.
- 동일 run의 입력 digest를 `state.applied_runs`에 보관한다. 같은 run·같은 입력은 재적용하지 않는다. 같은 run·다른 입력은 거부한다. 최초 데이터셋에 이미 존재하지만 state에 추적되지 않은 run ID도 재사용할 수 없다.
- `task_updates`: `merged_into`, `wbs_groups`, `description`, `task_id`와 `status`, `completed_at`, `completion_basis`, `due_date`, `due_basis`, `title`, `summary`, `category`, `assignee_id`, `project_id`, `wbs_code`, `start_date`, `plan_source`, `plan_ref`만 허용한다. `wbs_groups` 외 값은 문자열 또는 null이며 상태는 `in_progress`, `completion_proposed`, `completed`만 허용한다. 한 실행에서 같은 태스크를 두 번 갱신할 수 없다.
- 변경 시 전체 태스크의 before/after와 `DELTA-<run_id>-<task_id>` history를 남긴다. 시각은 `collected_at`, actor는 `system`, reason은 `scheduled-collect task update`다. 기존 dataset history에서 actor가 system이 아닌 기록의 before/after 차이 필드는 보호한다. 보호 필드 변경 한 건이라도 있으면 전체 delta를 거부한다. 이미 같은 값인 필드는 수정으로 보지 않는다.
- 병합 후 모든 태스크의 프로젝트, worklog의 태스크·수행자(`unknown` 예외), link의 target(`task`/`worklog`)·evidence(`source`/`event`)가 존재해야 한다. 기존 sourceEvents도 event 참조에 사용할 수 있다. assignee 참조도 검사한다.
- worklog는 160자 이하 summary와 유효한 수행 시각 정밀도(`exact`/`date`/`unknown`)를 사용한다. source.title은 200자 이하, 파일 source.folder_path는 문자열 배열 필수(최상위면 빈 배열). `kind: message`는 folder_path가 없어도 된다. 길이는 유니코드 코드포인트로 센다.
- 비밀값 패턴 `AIza[0-9A-Za-z_-]{20,}`, `token=[A-Za-z0-9_-]{10,}`, `SMTP_PASSWORD=`, `KEY_JSON=`, `-----BEGIN`을 delta 전체에서 검사한다. 레코드의 body/raw/raw_body/content/message_body/html_body도 거부한다. 이 검사는 수집 단계의 원문 비저장·최소 수집 정책을 대체하지 않는다.
- 성공한 새 실행만 `runs`에 complete/scheduled-collect/manifest:[]/recoveries:0으로 추가한다. `demoAsOf`와 demoNotice의 마지막 수집 날짜는 collected_at의 서울 날짜로 바뀐다. checkpoints는 drive/chat/gmail만 허용하며 기존보다 뒤로 갈 수 없다. 그 밖의 state 설정은 유지한다.

## 파일 안전성과 서버 재적재

`wx`로 lock을 획득하고 30분이 지난 lock만 정리한다. 정상 종료 시 자신이 획득한 lock을 제거한다. 거부도 runs.log에 JSONL 한 줄을 남기되 lock 획득 실패나 파일 자체를 읽지 못하는 경우에는 기록하지 못할 수 있다. 로그에는 원문을 쓰지 않는다.

로그·state·데이터셋을 같은 폴더 임시 파일에 먼저 쓴 뒤 rename하며 데이터셋을 마지막에 교체한다. 교체 도중 일반 I/O 예외가 나면 이미 교체한 파일의 원래 바이트를 복원한다. 검증 거부 시 데이터셋·state는 그대로이고 거부 로그만 추가된다. 별개 3개 파일이므로 프로세스 강제 종료·전원 장애까지 하나의 트랜잭션으로 보장하지는 않는다. 강제 중단 후에는 lock과 dataset.runs/state.applied_runs를 비교하고 불일치를 복구한 뒤 재개한다. 지속적인 디스크 오류로 복원도 실패하는 경우에는 운영자 복구가 필요하다.

실데이터 서버는 요청마다 데이터셋 SHA-256을 비교한다. 변경 시 기존 연결과 lease를 먼저 닫고 기존 seed-file.prepare를 재사용하여 재시딩한다. 다른 서버가 같은 real.sqlite를 점유하면 prepare가 안전하게 거부하며 요청은 실패한다. 실행은 한 서버로 제한한다. 이전 DB는 기존 정책대로 `.previous-*` 백업으로 남는다. JSON에 반영하지 않은 SQLite 단독 교정은 재시딩으로 사라질 수 있으므로 사람 교정 보호 대상은 dataset.history에 보존해야 한다.

## 검증

신규 `server/tests/real-delta.test.cjs`는 정상 병합·재적용·충돌·참조·비밀값·길이·history·사람 보호·체크포인트·dry-run·lock·CLI·I/O 롤백·서버 재적재를 임시 합성 fixture로 검증한다. 실제 `server/.real` 폴더는 읽거나 수정하지 않았다. 전체 검증 결과는 `tasks/current-state.md`의 2026-11-20 증분 반영 항목을 참조한다.

## WBS 계획 필드와 작업 내역 재연결 (ADR-018)

신규 tasks와 task_updates는 선택 필드 wbs_code(문자열, 16자 이하), start_date 및 due_date(실제 존재하는 YYYY-MM-DD), plan_source(wbs 또는 activity), plan_ref(source_key 문자열)를 받는다. task_updates에서는 이 필드들을 null로 지울 수 있다. 신규 projects도 기존 추가 계약에 따라 지원한다.

`plan_source: "reference"` 신규 입력·갱신은 거부한다. 기존 데이터에 남아 있는 값은 검증 실패로 보지 않으며 기존 화면 제외 로직은 호환용으로 유지한다. 업무가 아닌 기록은 아래 제거 계약으로 삭제한다. 폴더 맥락은 완료 Run의 파일형 source 전체를 `folder_id`로 묶어 제공하고 메시지는 제외한다. 연결되지 않은 파일도 표시하며 URL은 기존 허용 호스트 검증을 통과한 경우에만 제공한다.

## 업무가 아닌 기록 제거

`worklog_removals: ["DEMO-W"]`, `task_removals: ["DEMO-T"]`는 실행 전 존재하는 ID의 배열이다. 빈 문자열·문자열 이외 값·동일 배열의 중복 ID·없는 ID는 거부한다. 같은 대상의 추가/갱신과 제거를 한 delta에 섞을 수 없다. 삭제는 모든 추가·갱신 및 worklog 제거 후 적용한다. task 제거 시 최종 상태에서 해당 task를 가리키는 worklog가 없어야 하므로, 같은 delta에서 worklog를 제거하거나 `worklog_updates`로 다른 task에 옮길 수 있다. 다른 task의 `merged_into` 대상인 task는 제거할 수 없다.

dataset.history에 해당 대상의 actor_id가 system이 아닌 이력이 하나라도 있으면 제거를 거부한다. 제거한 worklog/task를 target으로 하는 links도 함께 제거하고 sources는 유지한다. 각 제거는 `DELTA-<run_id>-<id>`, entity_type(worklogs/tasks), 원래 전체 레코드 before, after:null, actor_id:system, reason:`remove non-work record`, applied_at:collected_at으로 history에 남긴다. `removed`는 직접 제거한 worklog/task 수이며 함께 제거한 links는 세지 않는다. 재실행은 제거 요청도 ignored로 세고 history를 추가하지 않는다. 한 건이라도 실패하면 전체 delta를 거부하고 removed는 0이다. dry-run 및 파일 롤백 계약은 동일하다.

```json
{"run_id":"REMOVE-DEMO","collected_at":"2026-11-23T09:00:00+09:00","worklog_removals":["DEMO-W"],"task_removals":["DEMO-T"]}
```

```json
{"run_id":"WBS-DEMO","collected_at":"2026-11-20T21:00:00+09:00","tasks":[{"task_id":"DEMO-T2","project_id":"DEMO-PR","title":"계획 태스크","status":"in_progress","wbs_code":"1.1.1","start_date":"2026-11-01","due_date":"2026-11-30","plan_source":"wbs","plan_ref":"drive:demo-wbs"}],"worklog_updates":[{"worklog_id":"DEMO-W","task_id":"DEMO-T2"}]}
```

worklog_updates는 기존 worklog의 task_id와 title을 선택적으로 변경한다(둘 중 하나 이상). title은 빈 문자열을 허용하지 않으며 유니코드 160자 이하 문자열이다. 대상 worklog는 실행 전 데이터셋에, task_id를 보냈다면 대상 task는 병합 후 데이터셋에 존재해야 한다. 같은 실행에서 동일 worklog를 두 번 보내거나 title·task_id 외 필드(원문 본문 포함)를 보내면 전체 delta를 거부한다. 사람이 history에서 고친 필드는 human_correction_protected로 보호하고, 다른 필드의 독립적인 변경은 허용한다. 같은 값은 ignored로 집계한다. 변경 시 버전을 올리고 entity_type=worklogs, change_id=DELTA-<run_id>-<worklog_id>, actor_id=system과 전체 before/after를 history에 남긴다. 제목 변경은 기존 summary·performed_at·precision을 바꾸지 않는다. 재실행 digest와 원자적 검증 규칙도 동일하게 적용된다.

## 업무 설명

신규 tasks와 task_updates의 선택 필드 `description`은 어떤 업무인지 설명하는 문자열(유니코드 코드포인트 200자 이하) 또는 null을 받는다. 생략 시 기존 값을 유지하고 null은 설명을 지운다. delta 전체 비밀값 검사와 사람 교정 보호를 동일하게 적용한다. 산출물·완료 기준과 구분하여 드로어 제목 아래에 표시한다.

### WBS 상위 묶음
`tasks`·`task_updates`의 선택 필드 `wbs_groups`는 바깥부터 안쪽 순서의 문자열 배열(0~4개, 각 유니코드 코드포인트 120자 이하) 또는 null이다. 예: `3.1.1`의 `["3 Moncoti 개발·테스트", "3.1 Computer·Browser Use 점검 및 OFF 기능 검증"]`, 최상위 말단 `9`는 `[]`. 생략은 기존 값 유지, null은 묶음 해제이며 UI에서는 빈 배열로 취급한다. 비밀값 검사·사람 교정 보호·이력 기록을 동일하게 적용한다. 상위 묶음은 태스크·진척률 분모에 추가하지 않으며, 화면에서 자식 일정 범위와 완료 n/m을 요약한다. 묶음 접기 상태는 메모리에만 보관한다.

## 태스크 병합·프로젝트 수정

`task_updates[].merged_into`는 같은 프로젝트의 존재하는 task_id 또는 null이다. 자기 자신이나 이미 다른 태스크에 병합된 대상을 지정할 수 없다(체인·순환 금지). 생략은 유지, null은 병합 해제다. 전체 태스크 before/after와 기존 history·사람 교정 보호 규칙을 적용한다. 병합된 태스크와 그 기록은 화면 목록·간트·집계·히트맵·요약·드로어 이전/다음에서 제외하며 원장은 보존한다.

작업 내역은 자동 이동하지 않는다. 같은 delta의 `worklog_updates`로 대상 태스크에 옮긴다. 검증은 전체 변경을 합친 최종 상태를 기준으로 수행한다. 병합된 태스크를 가리키는 새 worklog나 해당 태스크로 옮기는 worklog_updates는 거부한다. 변경하지 않은 과거 기록은 남겨 둘 수 있고, 동일 값 재전송은 기존처럼 ignored로 센다.

```json
{"run_id":"DEMO-MERGE","collected_at":"2026-11-23T09:00:00+09:00","task_updates":[{"task_id":"DEMO-T","merged_into":"DEMO-T2"}],"worklog_updates":[{"worklog_id":"DEMO-W","task_id":"DEMO-T2"}],"project_updates":[{"project_id":"DEMO-PR","name":"합성 프로젝트","purpose":"합성 목적","display_owner":"합성 담당자","owner_id":"DEMO-P","deputy_id":"DEMO-P"}]}
```

`project_updates`는 존재하는 project_id와 선택 문자열 필드 `name`, `purpose`, `display_owner`, `owner_id`, `deputy_id`만 허용한다. name은 유니코드 코드포인트 120자, purpose는 200자 이하이며 null은 허용하지 않는다(비우기는 빈 문자열). 생략한 필드는 유지한다. 동일 프로젝트 중복 지정·알 수 없는 필드·비밀값은 전체 delta를 거부한다. 사람의 history 교정 필드는 보호하고 동일 값은 ignored로 센다. 변경 시 `entity_type: projects`, `DELTA-<run_id>-<project_id>`, 전체 before/after, actor system, reason `scheduled-collect project update`를 기록한다. 재실행 digest·원자적 검증 규칙은 동일하다.

## 프로젝트 구분과 단계 (2026-11-24)

- 신규 `projects`와 `project_updates`의 `kind`는 `core`(핵심 프로젝트) 또는 `ops`(AX팀 운영)만 허용한다. 생략하면 기존 값을 유지하며 화면에서는 값이 없을 때 `core`로 취급한다. null과 다른 값은 거부한다.
- 신규 `tasks`와 `task_updates`의 `stage`는 `리서치`, `기획`, `프로토타입`, `개발·테스트`, `출시·운영` 또는 null만 허용한다. 생략하면 기존 값 유지, null은 단계 해제다. 사람 교정 보호·전체 before/after 이력·원자적 검증을 동일하게 적용한다.
- 화면은 단계가 있는 프로젝트를 위 순서로 묶고 단계 없는 태스크를 마지막에 표시한다. 단계가 없는 프로젝트는 기존 WBS 묶음을 유지한다. 번호는 드로어의 `WBS 번호` 속성에서 확인한다.
