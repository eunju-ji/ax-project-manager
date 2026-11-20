# 실데이터 증분 반영 형식과 실행 절차

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
  "tasks": [{ "task_id": "DEMO-T", "project_id": "DEMO-PR", "assignee_id": "DEMO-P", "title": "초안 검토", "status": "in_progress", "category": "검토" }],
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

stdout은 요약 JSON 한 줄이다. `ok: true`면 exit 0, 거부·입력·I/O 오류면 exit 1이다. `added`, `updated`, `ignored`, `rejected`, `errors`를 확인한다. 오류는 값 대신 코드와 위치만 출력하므로 비밀값을 다시 노출하지 않는다. `--dry-run`은 JSON·state·로그·lock 모두 변경하지 않는다. lock이 있으면 dry-run도 거부한다.

## 병합 계약

- 최상위 필수값: `run_id`(영숫자·하이픈·밑줄, 1~64자), `collected_at`(시간대 포함 ISO). 선택값: `checkpoints`, 위 6개 레코드 배열, `task_updates`, `worklog_updates`, `notes`. 그 밖의 최상위 필드는 거부한다.
- 각 배열의 키: `person_id`, `project_id`, `task_id`, `worklog_id`, `source_key`, `link_id`. 새 레코드의 `run_id`와 `created_run_id`는 실행 ID로 강제한다. 기존 키는 두 provenance 필드를 제외한 내용이 같으면 무시하고, 다르면 전체 delta를 거부한다. JSON 객체 속성 순서는 무관하다.
- 동일 run의 입력 digest를 `state.applied_runs`에 보관한다. 같은 run·같은 입력은 재적용하지 않는다. 같은 run·다른 입력은 거부한다. 최초 데이터셋에 이미 존재하지만 state에 추적되지 않은 run ID도 재사용할 수 없다.
- `task_updates`: `task_id`와 `status`, `completed_at`, `completion_basis`, `due_date`, `due_basis`, `title`, `summary`, `category`, `assignee_id`, `project_id`, `wbs_code`, `start_date`, `plan_source`, `plan_ref`만 허용한다. 값은 문자열 또는 null이며 상태는 `in_progress`, `completion_proposed`, `completed`만 허용한다. 한 실행에서 같은 태스크를 두 번 갱신할 수 없다.
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

```json
{"run_id":"WBS-DEMO","collected_at":"2026-11-20T21:00:00+09:00","tasks":[{"task_id":"DEMO-T2","project_id":"DEMO-PR","title":"계획 태스크","status":"in_progress","wbs_code":"1.1.1","start_date":"2026-11-01","due_date":"2026-11-30","plan_source":"wbs","plan_ref":"drive:demo-wbs"}],"worklog_updates":[{"worklog_id":"DEMO-W","task_id":"DEMO-T2"}]}
```

worklog_updates는 기존 worklog의 task_id만 변경한다. 대상 worklog는 실행 전 데이터셋에, 대상 task는 병합 후 데이터셋에 존재해야 한다. 같은 실행에서 동일 worklog를 두 번 보내거나 다른 필드를 보내면 전체 delta를 거부한다. 사람이 history에서 교정한 task_id는 덮어쓸 수 없다. 같은 값은 ignored로 집계한다. 변경하면 entity_type=worklogs, change_id=DELTA-<run_id>-<worklog_id>, actor_id=system과 before/after task_id를 history에 남긴다. 재실행 digest와 원자적 검증 규칙도 동일하게 적용된다.
