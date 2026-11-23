# M1-05·M1-06 구현 및 검증 보고서

- 작성: AX-Builder, 2026-11-19
- 범위: 합성 운영 스냅샷의 뷰 모델 투영과 승인된 UI 최소 동작 변경
- 브랜치: `chore/ui-baseline-verification`. Commit/Push/추가 에이전트 호출 없음.
- 기존 미커밋 M0 변경을 유지했다. 아래 변경 파일 목록은 이번 작업 기준이며 Git diff에는 이전 작업도 포함된다.

## 어댑터 구조

`app/src/adapter.js`는 의존성 없는 UMD 모듈이다. Node에서는 `require(...).adapt(snapshot)`, 브라우저에서는 `AXAdapter.adapt(snapshot)`으로 사용할 수 있다. 현재 앱과 build.py에는 연결하지 않았다.

입력 컬렉션은 `projects`, `tasks`, `worklogs`, `sources`, `sourceEvents`, `links`, `reviews`, `persons`, `runs`이다. 출력은 현재 UI의 `projects[].tasks[].subtasks[]`, 프로젝트별 `files[]`, `reviews[]`이다. `demoAsOf`, `demoNotice`는 전달만 한다. 날짜·Source를 만들어 채우지 않는다.

- WorkLog는 알려진 complete Run만 허용하고 ID별 1회 투영한다. Run ID가 없거나 존재하지 않아도 제외한다.
- 나머지 엔터티는 run_id가 있으면 complete인지 검사한다. 설계에 run_id가 없는 수동 Project/Task/Source/Link/Review는 그대로 허용한다.
- confirmed Link만 사용한다. event Link는 SourceEvent.source_key를 거쳐 실제 Source가 있을 때만 투영한다. 없는 근거나 태스크는 추정하지 않는다.
- 대표 자료: 산출물 > 검토 > 요청 > 참고 > 기타 역할, decided_at 최신, link_id 사전순. 대표 태스크: 해당 프로젝트의 confirmed 연결 중 decided_at 최신, task_id 사전순.
- Source ID는 source_key 그대로 사용하며 프로젝트별 1행이다. unavailable Source는 유지하고 `previewable: false`를 출력한다. Source에 생성일이 없으면 빈 createdAt을 사용한다.
- 실행자 미상 또는 Person 매핑 부재는 빈 `owner`이다. 날짜 정밀도는 날짜 문자열, unknown은 빈 performedAt으로 출력하고 performedAtPrecision을 함께 둔다.
- Review는 유효한 Task를 대상으로 하는 open completion만 출력한다. decided/superseded 판단은 다시 제시하지 않는다.
- 입력을 변경하지 않는다. History·Suppression·재수집·상태 전이·동시 쓰기는 수행하지 않는다.

## 픽스처와 시나리오별 결과

`app/tests/fixtures/ops-synthetic.json`은 가상 인물 김지현·박성진·이수민만 사용한다. 외부 서비스나 실사용자 데이터는 사용하지 않았다. 정상 Run WorkLog 6개, 비정상 Run WorkLog 5개, Source 4개, SourceEvent 4개를 포함한다. 재수집 요청과 digest 충돌 보존 결과는 별도 합성 컬렉션에 기록해 정상 SourceEvent와 구분했다.

| §7 | 투영에서 검증한 결과 |
|---|---|
| 1. 같은 Drive 문서 편집 3건 | SourceEvent 3개를 이유로 WorkLog를 생성하지 않음. 해당 Source는 1행. WorkLog 연결 제안은 link Review로 운영 데이터에만 남음 |
| 2. GitHub 명시 태스크 참조 | 저장된 Task Link는 files에 반영. TSK-2의 WorkLog는 0개. 자동 연결 정책 자체는 실행하지 않음 |
| 3. 공유 자료 | 최신 연결의 TSK-2가 대표. 같은 시각이면 task_id가 작은 TSK-1. 추가 프로젝트에서는 별도 1행 |
| 4. 이벤트 재수집 | 재수집 요청 2개가 있어도 이미 정규화된 SourceEvent·WorkLog·자료를 늘리지 않음 |
| 5. 같은 키 다른 digest | 원본 이벤트와 eventConflicts, conflict Review를 입력에 보존. 뷰에 충돌 판단이나 WorkLog를 추가하지 않음 |
| 6. 원본 삭제 | WL-6과 Link 및 Source 행 유지. 자료와 작업 내역의 미리보기 버튼 비활성 |
| 7. 미상 값·날짜 | WL-2 owner 빈 값, 팀 주간 합계 포함/참여 인원 제외. WL-3 시각 미상은 주간 제외. WL-4 날짜는 주간 포함/시각 공란 |
| 8. 수동 기록 | WL-5의 sourceId 속성 없음. 관련 자료 버튼 없음 |
| 9. 버전 충돌·동시 요청 결과 | applied/conflict History가 있는 스냅샷을 투영해도 Task나 WorkLog를 추가하거나 상태를 바꾸지 않음. 실제 쓰기 경쟁 검증은 M2 범위 |
| 10. 부분 실패 | Link 실패·History 실패·응답 유실의 incomplete, 재실패 failed, running 및 미등록/누락 Run의 작업을 정상 집계에서 제외 |
| 11. completion 외 판단 | link/new_task/conflict/performer는 출력 reviews에서 제외. UI에 직접 섞어도 판단 UI·카운트·액션에서 제외 |

## §5 불변식 테스트 대응표

테스트 파일: `app/tests/adapter.test.cjs` 12개, `app/tests/adapter-ui.test.cjs` 5개.

| 불변식 | 테스트 이름 / 검사 |
|---|---|
| 1. 고유 WorkLog 수 | invariant 1 + scenarios 9,10. 중복 ID 제외, 정상 6개, 비정상 Run 제외 |
| 2. sourceId 해석 가능 | invariant 2 + broken/missing event evidence. 같은 프로젝트 files 조회, 실제 Source 없는 연결 제외 |
| 3. 주간 합계 | invariant 3 + UI exact/date/unknown. model.weekRecords 결과 5개, unknown 제외, 날짜 포함 |
| 4. rejected 제외 | invariant 4. rejected/suggested 근거로 Source 생성하지 않음, sourceId 없음 |
| 5. completion만 | invariant 5 + UI foreign Review. Task 유효성/open 상태 검사, 직접 주입한 conflict의 버튼/카운트/핸들러 차단 |
| 6. 미상 실행자 제외 | invariant 6 + UI unknown performer. owner 빈 값, 참여자 3명, 팀 5개/김지현 2개 |
| 7. 대표 선택 결정성 | invariant 7 + source deduplication. 배열 역순 입력 동일 출력, 대표 rejected 재선택, 시각/ID 동률과 프로젝트별 1행 |

## UI 변경 내용

- Subtask.sourceId 선택 값, performedAtPrecision 선택 필드. 자료가 없으면 artifactButton이 빈 문자열을 반환한다.
- clockTime은 잘못된 값·빈 값에 `시각 미상`, 날짜 문자열에 공란을 반환한다. 날짜는 에피소드의 날짜 제목에 표시한다. 미상 에피소드 제목은 `실행 시각 미상`이며 시각 칸에 `시각 미상` 전체를 표시한다.
- model.day는 잘못된 날짜에 빈 문자열을 반환한다. weekRecords는 explicit unknown 정밀도를 제외한다. 날짜만 있는 기록은 포함한다.
- 프로젝트 참여자와 주간 참여 인원에서 빈 owner를 제외한다. 기존 고정 담당자 탭·담당자별 집계에는 미상을 추가하지 않는다. 팀 합계는 유지한다.
- completionReviews를 모든 판단 카운트·태스크 양식·검토함·이동/답변 핸들러에 공통 적용한다. 기존 data.json의 kind 없는 Review는 호환을 위해 허용한다.
- unavailable 자료의 원본 행과 작업 내역 자료 버튼에 disabled를 적용한다. 상태 문구와 CSS는 추가하지 않는다.

## 설계 질의 및 보수적 해석

1. 지시문의 날짜 정밀도 설명 중 “주간 집계에서는 제외”는 설계 §3·§5와 다르게 읽힐 수 있다. 설계의 명시 규칙대로 date는 포함하고 unknown만 제외했다.
2. 현재 뷰 모델은 unknown 실행자 표현을 정하지 않았다. 빈 owner를 채택했다. Person 매핑이 없는 ID도 이름으로 추정하지 않는다.
3. 생성일이 없는 Source를 UI가 요구하는 createdAt에 어떻게 표시할지 미정이다. 빈 값(기존 날짜 포매터의 —)을 사용하며 collected_at이나 decided_at으로 대체하지 않았다.
4. 같은 엔터티 ID가 서로 다른 내용을 가진 중복 행인 경우의 스냅샷 형식은 미정이다. 어댑터는 정상 저장소의 ID별 현재 행을 전제한다. 테스트의 중복 WorkLog는 동일 내용이며, 충돌 해결·버전 선택을 어댑터에 넣지 않았다.
5. §5에 Review 상태별 투영 규칙이 없다. m1-02의 오래된 제안 재적용 방지 원칙에 따라 open만 투영했다. Task 외 subject의 completion도 제외한다.
6. 미완료 Run의 “확인 중” 별도 표시와 시각 미상 별도 카운트는 현재 뷰 스키마에 자리가 없다. 이번 승인 범위에서는 미완료 Run을 제외하고, 시각 미상은 작업 상세/에피소드에 표시한다. 별도 카운트 UI는 구현하지 않았다.
7. §7의 재수집·동시성·복구 시나리오는 저장 계층 계약이다. 이번 테스트는 합성 저장 결과의 투영만 검증하며 실제 멱등 쓰기·충돌 생성·Suppression의 증거로 간주하지 않는다.

## 검증 실제 출력

초기 RED: 어댑터 파일 부재로 계약 테스트 실패, UI 수정 전 신규 UI 테스트 실패를 확인했다. 로그는 `app/test-results/m1-red.log`, `m1-ui-red.log`이다.

첫 구현 검증에서 people 계산의 괄호 1개 초과로 TS1005가 발생했다. 괄호를 수정했다. 신규 UI 테스트가 ISO datetime 속성의 초 부분까지 00:00으로 오인해 표시 텍스트 검사로 좁혔다. 마지막 자체 점검에서 WorkLog의 run_id 누락도 제외하도록 보완했다. 수정·재검증은 2회로 제한 내 수행했다. 기존 26개 테스트 파일은 수정하지 않았다.

최종 실행 결과(원시 로그 `app/test-results/m1-*.log`):

```text
npm run typecheck
> tsc src/app.ts --target ES2022 --module none --lib ES2022,DOM --strict --skipLibCheck --noEmit
오류 출력 없음 (exit 0)

npm run build
> python build.py
Offline preview: C:\Users\EunjuJi\Projects\ax-project-manager\preview\AX_Project_Manager.html
(exit 0)

npm test
ℹ tests 43
ℹ suites 0
ℹ pass 43
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 1412.4081
```

Python은 기존 설치 경로를 해당 빌드 셸 PATH에만 추가했다. 패키지 설치·의존성 변경 없음.

브라우저 검증 결과와 최종 변경 목록은 아래에 기록한다.

```text
npm run test:navigation
{"checks":88,"failures":0,"errors":0}
(exit 0)

npm run test:visual
{"checks":54,"failures":0,"errors":0}
(exit 0)

기준 이미지 manifest SHA-256 검증
{"baselineFiles":54,"hashMismatches":0}
```

54개 비교 모두 baseline=0, offline=0이다. 기준 이미지 재생성은 하지 않았다. 기존 화면의 레이아웃·색·글꼴·간격·테마·문구는 유지됐다. 합성 운영 데이터의 신규 경계 조건은 Node VM 렌더링 테스트로 검증했고, 기존 데이터 화면은 실제 Chromium 개발/독립 HTML 비교로 검증했다. 합성 운영 데이터를 브라우저 앱에 연결하는 검증은 이번 범위가 아니다.

시작 시점 SHA-256 기록(`m1-start-hashes.json`)과 비교해 기존 앱 파일 중 달라진 것은 src/app.ts, src/model.js, app.js 세 개뿐이다. data.js, styles.css, data.json, assets, build.py는 동일하다. app.js는 승인된 build 명령으로 생성했다.

## 변경 파일 목록

- 추가: `app/src/adapter.js`
- 추가: `app/tests/fixtures/ops-synthetic.json`
- 추가: `app/tests/adapter.test.cjs`
- 추가: `app/tests/adapter-ui.test.cjs`
- 수정: `app/src/app.ts`, `app/src/model.js`, `app/app.js`
- 추가: `docs/migration/m1-05-06-report.md`
- 상태 갱신: `tasks/backlog.md`, `tasks/current-state.md`

`git diff --stat` 실제 출력(기존 M0·설계 변경 포함, 신규 untracked 파일은 기본 명령에서 제외):

```text
 .gitignore                  |  2 ++
 AGENTS.md                   | 77 +++++++++++++++++++++++++++++++++++++++++++++
 CLAUDE.md                   | 17 ++++++++++
 app/app.js                  | 68 +++++++++++++++++++++++----------------
 app/package.json            | 12 +++++--
 app/src/app.ts              | 70 ++++++++++++++++++++++++-----------------
 app/src/model.js            |  4 +--
 app/styles.css              |  3 ++
 docs/02-decisions-needed.md |  2 +-
 docs/decisions/README.md    |  4 ++-
 tasks/backlog.md            | 18 ++++++-----
 tasks/current-state.md      | 46 ++++++++++++++++++++++++++-
 12 files changed, 253 insertions(+), 70 deletions(-)
```

`git diff --check`는 기존 `CLAUDE.md:114: new blank line at EOF` 1건으로 exit 1이다. 이번 작업에서 CLAUDE.md를 수정하지 않았다. Git의 LF/CRLF 안내도 발생했다. 기존 26개 테스트 파일 수정 없음, 비밀키·외부 서비스 접근·새 npm 의존성 없음.

## 인계 상태

Builder 구현·검증 완료, Lead 완료 판정 및 독립 검토 대기. 이번 범위 내 미해결 실행 오류는 없다. 설계 질의와 저장 계층 검증 범위는 위에 명시했다. 자동 수정·재검증 2회 이내, Commit/Push 없음.
