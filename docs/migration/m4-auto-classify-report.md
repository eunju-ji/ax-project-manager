# M4 자동 판별 우선 구현 보고서

2026-11-19 · AX-Builder · ADR-016 · 현재 작업 트리 · Commit/Push 없음

## 구조

- `classify-schema.cjs`: 의존성 없는 엄격한 결과 계약과 판별자용 규칙. 알 수 없는 operation/필드와 잘못된 중첩 참조를 거부한다.
- `classify.cjs`: 최소 입력 추출, 확신도·근거·상충·교정·버전 검증, 트랜잭션 반영, 감사 이력, 묶음 되돌리기, 지표.
- `classify-files.cjs`: 기존 ACL 검사 재사용, `.pilot/classify/*.json` 입출력, 엄격 UTF-8, 파일당 8 MiB 상한, 폴더 중심 배치와 manifest.
- CLI/package: `drive:auto-classify` 명령 추가. API/LLM 호출 없음.
- DriveStore: 자동 판별 모드에서는 수집 이벤트를 판별 대기 상태로 처리하고, 검토 화면에는 classification Review만 표시한다. 사람의 연결 교정·거절은 rejected Link와 source Suppression으로 보존한다.
- Service: 병합·분리된 이전 태스크를 일반 화면에서 숨긴다. 새 구조·연결·작업 내역은 기존 adapter로 표시한다. UI/CSS 변경 없음.

첫 `extract`가 workspace의 `auto_classify_enabled`를 켠다. 전환 이전의 CSV/폴더 매핑 경로는 호환을 위해 유지한다. 전환 이후 수집은 전건 검토함을 만들지 않으며, 이전 시스템 제안은 화면에서 숨기고 apply에서 superseded 처리한다. 사람이 결정한 Review는 보존한다.

## 사용법

아래 명령은 `app/`에서 실행한다. Builder 검증에서는 실제 파일럿 DB·인증 정보에 접근하지 않았다.

```powershell
npm.cmd run drive:auto-classify -- extract
# AX-Lead가 출력된 입력과 규칙을 읽고 같은 classify 폴더에 result.json 작성
npm.cmd run drive:auto-classify -- apply server/.pilot/classify/result.json --dry-run
npm.cmd run drive:auto-classify -- apply server/.pilot/classify/result.json
npm.cmd run drive:metrics
npm.cmd run drive:auto-classify -- revert <result_id>
```

기존 ACL 준비와 `AX_DRIVE_ID` 고정 검사를 통과해야 한다. 이 명령에는 토큰 디렉터리 접근·Google 호출·LLM 내장 호출이 없다. 자동 기준은 `AX_CLASSIFY_THRESHOLD` 환경 변수, 기본 0.8이다.

입력은 `input-<ISO 시각>.json`, 크면 `input-<시각>-batch-N.json` 및 manifest로 쓴다. 배치마다 규칙과 공통 구조·사람 결정을 포함한다. 폴더 한 개가 크면 파일 단위로 더 나눈다. **모든 배치를 판별한 뒤 하나의 결과로 합쳐 apply**한다. 파일 내용·원본 URL·토큰 필드는 추출하지 않는다. 이름 등 자유 텍스트의 URL과 이메일 도메인도 가린다. 경로는 저장된 과거 경로 대신 현재 부모 체인으로 재구성하며 접근 불가 조상 이름은 가린다.

## 결과 계약

```json
{
  "format": "ax-classify-result",
  "version": 1,
  "input_id": "input-입력에 있는 ID",
  "operations": [
    {
      "op": "create_project", "temp_key": "P1",
      "name": "프로젝트", "purpose": "목적",
      "confidence": 0.95,
      "evidence": {"ids": ["drive:D:FILE_ID"], "summary": "폴더와 파일 근거"}
    },
    {
      "op": "create_task", "temp_key": "T1", "project_ref": "P1",
      "title": "검증", "category": "검증",
      "confidence": 0.95,
      "evidence": {"ids": ["drive:D:FILE_ID"], "summary": "활동 근거"}
    }
  ]
}
```

근거는 입력에 제시된 Source/Event 내부 ID 또는 공용 키, 기존 entity/person/link ID를 쓴다. 참조는 앞서 생성된 temp_key 또는 기존 내부 ID/공용 키를 받는다. 생성 키는 코드가 AUTO-UUID로 발급한다.

| operation | 공통 필드 외 필드 |
|---|---|
| create_project | temp_key, name, purpose |
| create_task | temp_key, project_ref, title, category |
| create_worklog | task_ref, performer_person_id, title, summary, source_refs; 선택 temp_key, performed_at 또는 performed_on |
| link | target, source_ref, role |
| relink / unlink | link_id, reason; relink에는 target |
| rename | target, name, reason |
| set_category | task_ref, category, reason |
| merge_tasks | task_refs, into_task_ref, reason |
| split_task | task_ref, parts, reason |
| needs_review | target, question, candidates(문자열 목록), reason |

모든 operation에 `confidence`(0~1), `evidence:{ids:[],summary}`가 필요하다. target은 `{type:"project|task|worklog",id}`이고 연결 대상은 task/worklog만 가능하다. source_ref/source_refs의 항목은 `{type:"source|event",id}`다. 업무 유형은 기획·설계, 조사·분석, 제작·구현, 검증, 운영·지원이다.

실행자 미상은 `performer_person_id:"unknown"`, 시각 미상은 두 시각 필드 생략으로 표현한다. split parts는 `{temp_key,title,category,worklog_ids:[],link_ids:[]}`이며 기존 직접 자식 전체를 정확히 한 번씩 배분해야 한다. 병합·분리는 원래 태스크를 이력용으로 보존한다. 완료 시도는 `set_status` 방어용 operation으로 검토에만 보내며 자동 실행하지 않는다. 다른 operation의 알 수 없는 status 필드는 스키마 오류다.

## 검증·교정·감사

- 확신도 미달, 실제 근거 누락/접근 불가, 같은 대상의 상충 결론, source 범위 억제, 사람 결정 변경, 오래된 입력, 누락된 선행 참조, 잘못된 분리 배분은 Review로 보낸다.
- 다른 source를 같은 task에 붙이는 것은 허용한다. 같은 source의 복수 연결 결론은 보수적으로 모두 검토로 보낸다.
- 사람 감사 기록·confirmed 수동 연결·human_decision 표식·Suppression을 우선한다. 병합·분리에서 이동할 자식의 사람 교정도 확인한다.
- 완료 상태는 변경하지 않는다. 완료/완료 제안 상태의 태스크 병합·분리는 검토로 보낸다.
- 결과 JSON 전체를 하나의 동기 SQLite 트랜잭션으로 처리한다. 실패하면 Review·내용·감사 기록까지 롤백한다. dry-run은 같은 처리기를 savepoint 안에서 실행하고 모두 롤백한다.
- 변경마다 `actor_id=system:auto-classify`, 결과 JSON SHA-256 ID, operation 번호, 근거, 확신도, 전체 변경 전후 행을 protected content에 기록한다. 동일 결과 재적용은 저장된 결과를 반환한다.
- 파일 이름·지시문·스크립트 문자열은 데이터로만 저장한다. eval, 셸 실행, 텍스트 기반 SQL 생성은 없다.
- revert는 결과 전체를 의존성 묶음으로 다룬다. 이후 변경·사람 판단·새 종속 레코드가 있으면 묶음을 보존하고 conflicts를 반환한다. 충돌이 없으면 역순으로 복구하고 이력도 남긴다.

## 지표

`drive:metrics`의 `auto_classify`: automatic_applied(operation 수), human_reverted(자동 변경 후 사람이 교정한 고유 entity 수), sent_to_review, review_reasons(중복 사유 포함), 0.2 간격 confidence_distribution. human_reverted는 엄밀한 이전 값 복원만이 아니라 사람이 수정한 경우도 포함하는 보수적 교정 지표다. 기존 폴더 제안 지표는 유지한다.

## 검증

- 신규 합성 테스트 8/8: 생성·연결·작업 내역 표시, dry-run, 낮은 확신도, 근거 불일치, 상충 판별, 사람 변경·완료 차단, 감사 실패 전부 롤백, 지시문 텍스트, 조상/과거 경로·토큰·URL 비노출, 병합·분리·이름 변경·연결 수정·해제·되돌리기, 모델 자가 검토, 입력 경로/확장자/크기/UTF-8, 배치·manifest.
- `npm.cmd test`: 43/43.
- `npm.cmd run test:server`: 최종 60/60, failures 0.
- `npm.cmd run test:navigation`: 88/88, failures/errors 0.
- `npm.cmd run test:visual`: 54/54, failures/errors 0. 모든 baseline/offline 픽셀 차이 0. 기준 이미지 재생성 명령 실행 없음.
- `npm.cmd run typecheck`: exit 0.
- `npm.cmd run build`: python PATH 없음으로 실패. 동일 `build.py`를 설치된 `python3.15.exe`로 샌드박스 밖 실행해 exit 0. 샌드박스 안 trampoline은 permission denied였음. 빌드 코드 변경 없음.
- 실제 Google 호출 0건, 실데이터/자격 증명 접근 0건, 새 npm 의존성 0개, 추가 위임·Commit·Push 없음.
- 보호 파일에 이번 작업의 편집 없음. 보호 대상 tracked 파일 `git diff --name-only` 출력 없음. 기존 미커밋 변경은 보존했다. Git diff --check에는 기존 CLAUDE.md/current-state.md EOF 공백 경고가 있었다.
- 로그: `app/test-results/auto-classify-{unit,server,navigation,visual}.log`(Git 제외).

## 한계·다음 작업

- 외부 LLM의 의미 판별 정확도는 합성 테스트로 증명할 수 없다. 실제 판단은 AX-Lead가 수행하며 Builder는 실제 파일럿 입력을 만들거나 읽지 않았다.
- 공통 구조·교정 이력만으로 8 MiB를 넘는 입력은 안전하게 실패한다. 대규모 DB에서 공통 context 자체를 나누는 방식은 후속 작업이다.
- unknown 실행자를 허용하고 기존 사람별 집계에서는 제외한다. 집계 영향이 큰 불확실성은 판별자가 needs_review로 보내야 한다.
- 판별 Review는 기존 카드의 질문·후보와 판단 불가 동작을 재사용한다. 자동 결과를 사람이 수정하려면 새 판별 결과 작성 또는 기존 수동 경로를 사용한다. 전용 편집 화면은 추가하지 않았다.
- 독립 Reviewer/AX-Lead 완료 판정은 이번 Builder 범위 밖이다. 완료·운영 배포·실수집 시작 승인으로 간주하지 않는다.

## 이번 변경 파일

`app/package.json`, `app/server/connectors/drive/{classify-schema,classify,classify-files,cli,store}.cjs`, `app/server/service/index.cjs`, `app/server/tests/drive-classify.test.cjs`, 이 보고서, `tasks/current-state.md`.
