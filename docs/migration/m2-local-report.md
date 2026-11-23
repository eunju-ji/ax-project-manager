# M2-L 로컬 PoC 구현·검증 보고서

작성: AX-Builder, 2026-11-19. 게이트 G0. Lead 완료 판정과 독립 검토는 별도다.

## 3회차 수정 결과 (최종 수정 차수)

AX-Builder가 기존 브랜치에서 수정했다. 추가 위임·commit·push·외부 네트워크 접근·의존성 추가 없음. JSON 행 CAS와 여러 행 트랜잭션 부재를 유지했다. 이 절은 아래 이전 기록의 “complete + deciding 수동 복구”, “재개 UI 없음” 설명을 대체한다. 독립 Reviewer/Lead 완료 판정은 별도다.

| 항목 | 원인 분류 | 수정·자동 회귀 테스트 |
|---|---|---|
| 1. 버전 충돌 후 영구 예약 | 구현 결함. 예약이 필요한 배경은 저장소 제약 | `decisions.recoverDecision`이 Task conflict 확정 시 CAS 보정 Run으로 open 복원. B1: Task version=2/expected=1 실패 후 새 change ID/expected=2 성공. conflict History 보존. |
| 2. digest 신뢰·중복 입력 재사용 | 구현 결함 | `collector.normalize`는 digest를 항상 재계산한다. UTC·actor 정규화, 저장 메타데이터 제외. duplicate는 저장된 SourceEvent를 반환하고 기본 fakeLLM도 이 이벤트로 호출한다. B2: 빈 본문 수집 후 같은 주장 digest/TSK-1 본문 → Link 0·conflict 보존. 시드 생성기도 같은 정규화 함수를 쓴다. |
| 3. 미완료 억제 해제 | 구현 결함. 부분 저장은 저장소 제약 | `Matcher.blocked`가 released_at뿐 아니라 해제 Run complete를 검사. B3: 해제 행 저장 후 History 실패 시 차단 유지, 재개 후 해제. |
| 4. source Link 거절 | 구현 결함 | `Matcher.reject`가 evidence_type별 키 해석. source 범위는 source Link의 evidence_key 사용(B4). source Link는 원 이벤트를 알 수 없으므로 event 범위 거절은 불가. |
| 5. conflict 감사 누락 | 구현 결함 | `Writer.resume`이 actor_id·applied_at(clock)·reason·basis·before/after·conflict_cause 기록. B5는 version/role/permission/dependency 네 원인과 필드 단언. permission은 다른 미완료 Run이 소유한 행의 쓰기 금지이며 실제 사용자 인증은 아님. |
| 6. 재시작 후 복구 요청 소실 | 구현 결함. 내구성 있는 재개가 필요한 배경은 저장소 제약 | `GET /api/recovery`, `POST /api/recovery/:change_id`로 저장된 request/manifest 조회·재개. PoC 검토함에 기존 review-record/primary 스타일과 저장 문구로 복구 대상 표시. B6 API 및 실제 브라우저의 새로고침·서버 재시작 후 같은 요청 재개. 기본 모드 무변화. |
| 7. complete + deciding 복구 | 구현 결함. 보정 절차의 복잡성은 저장소 제약 | B7: Task 미적용 확정이면 예약 해제, applied 확정이면 원 최종 Review payload만 CAS 보충하고 Task version 불변. 보정 행 저장 후 History 실패도 복구 목록에 유지. |
| 8. 참조 무결성 검사 부족 | 구현 결함(검증 범위) | `dataset/references.cjs:validateReferences`, B8: Project 책임자·대리, 외부 계정→Person, 모든 표에 존재하는 run_id/created_run_id, 이벤트 계정, History 엔터티·before/after·basis, manifest payload 외래 키와 requires 검사. 역할·계정·Run·History·manifest·basis를 각각 깨뜨리는 음성 대조군 포함. manifest 신규 entity_id는 미적용 상태라 행이 없어도 정상. 선택 Run 필드를 필수화하지 않는다. |
| 9. 기존 소형 시드 잔류 | 구현 결함 | `createServer`의 metadata/seed에 데이터셋 이름·생성 시드·파일 hash 기록. 메타 없음/불일치/reset이면 런타임을 형제 backup 폴더로 옮기고 안내 후 재시드. 같은 데이터셋은 실제 저장 판단·Task version 보존(B9). 시작 로그에 이름·프로젝트 수 표시. PID 4712는 건드리지 않았다. |

### Task 적용 여부별 복구 절차

1. `/?data=local` 검토함에서 Review ID·answer·Run 상태를 확인하고 **다시 시도**한다. 서버의 저장된 요청 그대로 재개하므로 메모리 change ID나 재계산 version에 의존하지 않는다. API 직접 사용은 GET `/api/recovery` → POST `/api/recovery/:change_id`.
2. running/incomplete는 원 manifest를 재개한다. 행의 `_changes[change_id]`가 applied면 Task 재적용 없이 History만 보충한다. 적용이 불명확하면 새 판단을 차단한다.
3. complete + deciding에서 Task conflict가 확정됐으면 `원ID:repair` 보정 Run으로 예약 해제. Task version을 다시 조회해 **새 change ID**로 판단한다. 원 conflict History는 변경하지 않는다.
4. Task applied가 확정됐으면 Task는 그대로 두고 원 최종 Review payload만 보충한다. 현재 deciding과 예약 소유자를 확인하고 Review version CAS를 사용한다. 다른 결정으로 덮어쓰지 않는다.
5. 보정 Run 자체의 History 실패도 같은 `:repair` Run으로 재개한다. 보정 중인 원 요청은 계속 복구 목록에 남는다.
6. failed(복구 3회 소진), manifest/receipt 없음·모순 등 손상은 자동 해제하지 않는다. 런타임 사본을 보존하고 manifest·Task `_changes`·History·Review 예약을 대조해 Lead에 전달한다. failed를 running으로 바꾸는 코드나 예약을 수동 삭제하는 우회는 제공하지 않는다. Task 적용 증거 부재는 미적용 증명이 아니다.

### 저장소 제약 때문에 생긴 복잡성 목록

다음은 구현 결함과 별개인 **저장소 제약**이다. 여러 행 원자성이 있었다면 이 용도의 중간 상태와 보정 절차 상당수가 필요 없었을 것이다. 업무 판단·권한 검증·멱등성과 감사 기록 자체는 DB에서도 필요하다.

- `transitions.transition`, `decisions.decide`: 예약 → Task → 최종 Review manifest/ requires 연결, deciding/reserved_by/reserved_answer 중간 상태. Task·Review 동시 commit 불가 때문에 필요.
- `Writer.start/resume`: manifest 선기록, 행 `_changes`의 before/after 영수증, History 보충, recoveries/incomplete/failed. 업무 행과 History가 따로 실패하기 때문에 필요.
- `decisions.recoverDecision`: Task 적용 판별, `:repair` 보정 Run, 예약 해제/최종 판단 CAS 보충, 보정 도중 실패의 재재개.
- `Writer.resume`, `Matcher.updateSummary`, `server /api/view`, `adapter.adapt`: created_run_id 보존, 생성·수정 Run complete 검사, 미완료 행 후속 쓰기 차단·조회 격리. 부분 저장이 정상 데이터로 세탁되지 않도록 필요.
- `Matcher.blocked`: released_at이 먼저 저장돼도 해제 Run 종료까지 억제 유지. 억제·History 동시 확정 불가 때문에 필요.
- `recoveryRequests`, `/api/recovery`, `loadLocal/retryLocal`, 검토함 복구 목록: 정상 조회에서 숨겨진 부분 적용 요청을 찾는 별도 경로와 위 운영 절차.
- `Store.cas`: 단일 Node 프로세스의 동기 연산에 의존. 여러 프로세스의 행 잠금은 제공하지 않는다.

이 목록을 DB 원본 + Sheets 조회용 전환 판단의 입력으로 남긴다. 저장소는 교체하지 않았다. 다중 인스턴스·정전/fsync·디스크 고갈·손상 데이터 자동 복구는 미검증/미지원이다. 실제 운영 저장소 결정은 사용자·Lead에게 남긴다.

### 시드 전환과 초기화

`app`에서 `npm run poc`: metadata가 같으면 판단 보존, 소형/다른 데이터셋이면 백업 안내 후 synthetic-large(프로젝트 12개) 시드. `npm run poc:reset`: 강제 백업 후 재시드하고 서버 시작. 기존 서버 중지는 실행 담당자가 수행한다. 백업은 `.runtime.backup-<시각>-<UUID>`이며 자동 삭제하지 않고 Git에서 제외한다. 시작 로그 `Dataset: synthetic-large; projects=12` 확인. 테스트는 임시 디렉터리·임의 포트 사용.

### RED → GREEN 및 검증 실행 이력

로그: `app/test-results/m2-third-*.log`. `m2-third-red.log`에서 B1~B7·B9 신규 8건 모두 RED(기존 12건 통과), B8은 누락된 참조 검증 모듈을 요구하는 `m2-third-b8-red.log`에서 RED. GREEN은 위 테스트 이름별로 추적한다. B7은 적용/미적용/보정 실패를 별도 검사한다.

중간 실패도 기록한다. 초기 수정 검증은 문자열 basis 처리와 이미 복구된 상태를 legacy 상태로 재조작한 테스트 구성에서 실패했다. 이후 기존 시드 digest 생성 불일치를 수집기·생성기 일치로 해결했다. 기존 PoC 시나리오 7은 digest 주장만 바꾸는 테스트에서 실제 본문이 다른 재현으로 고쳤다. 입력 digest를 신뢰하지 않는 새 계약에 맞춘 변경이며 보호 대상 `app/tests/*.test.cjs`는 수정하지 않았다. PowerShell→Node 파이프의 한글 손상도 바로잡았다.

환경 실패: npm.ps1 실행 제한은 npm.cmd 사용, Python PATH 부재는 기존 Codex 런타임 경로를 현재 셸에만 추가해 해결. navigation·visual 최초 병렬 실행의 visual은 동일 8765 포트 EADDRINUSE로 실패해 navigation 종료 후 단독 재실행했다. 실행 실패를 통과로 세지 않았다. 기준 이미지 재생성 없음.

최종 실제 출력과 diff 통계는 이 절 말미의 검증 기록을 따른다.

항목 1~9 완료 시점(Phase C 착수 전) 실제 출력: typecheck/build exit 0; `npm test` tests 43/pass 43/fail 0; `npm run test:poc` tests 46/pass 46/fail 0 + browser tests 4/pass 4/fail 0, exit 0; navigation `{"checks":88,"failures":0,"errors":0}`; visual `{"checks":54,"failures":0,"errors":0}`. 기준 PNG 54개 manifest SHA-256 불일치 0. 보호 파일(data.json/data.js/assets/build.py 및 app/tests/*.test.cjs) git diff 없음. git diff --check는 기존 CLAUDE.md:114 EOF 빈 줄 경고만 남는다.

이번 수정 파일: `app/poc/{collector,matching,write-service,decisions,server,poc.test,regression.test,dataset.test,browser-test}.cjs`, `app/poc/dataset/{generate.cjs,references.cjs,synthetic-large.json}`, `app/src/app.ts`, 생성 `app/app.js`, `app/package.json`, `app/.gitignore`, 이 보고서와 `tasks/current-state.md`. 저장소 제약·미지원 운영 조건은 위 목록과 같으며, 요청된 재현 1~9에서 남은 실패 없음. 독립 재검토는 대기.
후속 독립 검토 판정은 **fail**이었다. 아래 최초 검증 출력은 당시 실행 이력이며, 미완료 Run 격리·Review 경쟁 판단·부분 실패 복구 전체를 입증한 결과가 아니다. 후속 수정 근거는 끝의 “검토 결함 수정 결과”를 따른다.
기존 `chore/ui-baseline-verification`의 M0·M1 미커밋 변경을 보존했다. 추가 위임, commit, push, PR, 외부 API·LLM·실데이터 접근 없음. npm 의존성 추가 없음.

## 구성과 실행

`app/poc/`에 Node 내장 모듈 기반 구현을 둔다.

| 파일 | 역할 |
|---|---|
| store.cjs | 행별 JSON 파일, 동기 CAS, 같은 행에 적용 영수증 저장, n번째 쓰기 실패·적용 후 응답 유실 주입 |
| write-service.cjs | 선기록 manifest, payload digest, 안정 ID, History 보충, conflict Review, Run 재개·3회 복구 실패 종료 |
| transitions.cjs | T1~T5 역할·상태·버전 검증, 적용 시 Project 역할 재확인, self_approved, superseded |
| collector.cjs | 합성 정규화 메타 입력의 GitHub commit·Drive 이벤트 키, actor 정렬, digest |
| matching.cjs | 중복/충돌 보존, 명시 ID Task Link, 수집 범위·Suppression, 해제, availability·시스템 요약 갱신 |
| fake-llm.cjs | 이벤트의 미리 지정된 제안만 반환하는 결정적 스텁 |
| decisions.cjs | completion Review 1회 적용, 같은 manifest 안의 Task·Review 쓰기, 종속 변경의 conflict 전파 |
| server.cjs | 127.0.0.1 HTTP, 합성 시드, 어댑터 조회·판단 API, 정적 파일 허용 목록, Host·Origin·JSON 크기 검사 |
| poc.test.cjs / browser-test.cjs | 저장소·규칙 통합 테스트 / 설치된 Chromium 브라우저 테스트 |

```powershell
cd app
# Python이 PATH에 없을 때 현재 셸에만 추가
$env:PATH = 'C:\Users\EunjuJi\.cache\codex-runtimes\codex-primary-runtime\dependencies\python;' + $env:PATH
npm.cmd run typecheck
npm.cmd run build
npm.cmd run poc
# http://127.0.0.1:8766/?data=local
```

종료는 Ctrl+C. 저장 파일은 `app/poc/.runtime/`에 남고 Git에서 제외된다. 서버 실행 시 기존 시드를 덮어쓰지 않는다. 초기화가 필요하면 서버를 종료한 뒤 해당 디렉터리를 별도로 보관하고 새 빈 디렉터리로 실행한다.

기본 URL은 기존 data.js/data.json 화면이다. `?data=local`에서만 API를 호출한다. 상단 상태는 기존 `demo-mark` 토큰을 사용하며 CSS는 이번 작업에서 수정하지 않았다. 판단 직후 저장 중, 응답 확인 후 저장됨, 실패 시 저장 실패·다시 시도를 표시한다. 성공 전 미확인 건수를 줄이지 않는다. 실패 시 같은 버튼으로 재시도하며 같은 change ID를 사용한다. 저장 결과를 새로고침 후 다시 불러온다.

## 자동 검증 시나리오

`npm.cmd run test:poc`는 서버 테스트 16개와 브라우저 테스트 1개를 실행한다. 기존 `npm test`에는 브라우저 테스트를 추가하지 않았다.

| 설계 §4 | 검증 결과 |
|---|---|
| 1 | 적용 후 응답 유실, Store를 새로 열고 재개: version 1, History 1건 |
| 2 | 같은 change_id의 다른 payload 거절, 별도 rejections 감사 행 보존 |
| 3 | 같은 버전 요청 2개: 1회 적용, conflict History·Review |
| 4 | WorkLog 적용·Link 실패 시 incomplete와 집계 제외, 재개 후 포함·중복 없음 |
| 5 | History 쓰기 실패 후 History만 보충, 업무 행 version 유지 |
| 6 | 최초 실패 후 복구 3회 실패: failed와 사람 확인 alert, 자동 재개 중단 |
| 7 | 재수집 SourceEvent 1건, 다른 digest는 eventConflicts에 원본과 함께 보존·Review |
| 8 | TSK ID의 Task Link만 자동, WorkLog 생성 없이 검토 |
| 9 | source 억제는 새 이벤트에도 적용, 해제 후 제안·연결 재개 |
| 10 | 억제된 명시 ID는 conflict Review |
| 11 | 외부 지시문·자동 범위 밖 제안은 업무 행 변경 없이 Review, 승인 scope 밖 자동 Link 금지 |
| 12 | M1-02 §5의 10개 시나리오를 한 테스트에서 검증. 추가 테스트로 manifest 계획 뒤 대리 해제·적용 시 conflict와 Review 미적용 확인 |
| 13 | Playwright: 판단→저장됨, 새로고침 유지, 쓰기 실패→실패 문구·미확인 건수 유지, 재시도 성공, 같은 Review 재적용 방지. pageerror 없음 |
| 14 | 수집 실패 시 기존 Task 불변, failed Run 기록 |

추가 검증: 수집 행위자 정렬·수집 시각 무관 중복 키, availability 삭제 상태 갱신, 사람 요약 덮어쓰기 금지·시스템 요약 갱신, 외부 Origin 거절.

## 실제 실행 출력

최종 원시 출력은 Git에서 제외되는 `app/test-results/m2-*.log`에 보존한다.

```text
npm run typecheck: tsc ... --strict --skipLibCheck --noEmit (오류 출력 없음)
npm run build: Offline preview: ...\preview\AX_Project_Manager.html

npm run test:poc (m2-poc-final.log)
ℹ tests 16
ℹ pass 16
ℹ fail 0
브라우저:
✔ 13 browser: saved/reload, failed save leaves count, retry, persistent review idempotency
ℹ tests 1
ℹ pass 1
ℹ fail 0

npm test (m2-existing-final.log)
ℹ tests 43
ℹ pass 43
ℹ fail 0
```

최종 탐색·시각 결과:

```text
npm run test:navigation (m2-navigation-final.log)
{"checks":88,"failures":0,"errors":0}
npm run test:visual (m2-visual-final.log)
{"checks":54,"failures":0,"errors":0}
기준 manifest SHA-256 대조: {"baselineFiles":54,"hashMismatches":0}
```

모든 시각 비교는 baselinePixels=0, offlinePixels=0이었다. 최종 검증 명령 실행 세션은 exit 0으로 종료했다.

최초 테스트는 구현 모듈 미존재로 실패했다. 구현 후 source suppression의 이벤트 조회 누락을 보완했다. UI 회귀 1차에서 VM에 URLSearchParams가 없던 문제와 새 브라우저 테스트의 태스크 펼침 누락을 확인했다. 2차에서 상태 문구 삽입이 적용되지 않은 것을 확인해 보완했다. 이후 최종 3차 검증. 기존 테스트 및 기준 PNG를 수정하거나 재생성하지 않았다.

## OD-09 저장소 필수 기능 목록 + G1 PoC 체크리스트

아래는 운영 저장소 선정 조건이다. 로컬 성공이 Sheets나 운영 적합성을 증명하지 않는다. G1은 사용자 승인 후 합성 데이터만으로 별도 실행한다.

| 필수 기능 | 로컬 근거 | Sheets + Apps Script에서 확인할 것 | 경량 백엔드에서 확인할 것 |
|---|---|---|---|
| 버전 비교·적용 단일 연산 | 동기 CAS로 요청 사이 끼어들기 방지 | 같은 공유 잠금을 모든 수정 경로에서 획득하고, 잠금 안에서 재조회·비교·쓰기. 직접 편집 우회 차단 | 조건부 UPDATE 또는 row lock, 모든 API 경로에 동일 적용 |
| 적용과 영수증의 원자성 | 행 JSON과 _changes를 함께 rename | 업무 필드와 receipt를 같은 보장 범위로 기록할 수 있는지; 중간 중단 시 확인 | 업무 값·idempotency receipt 동일 DB 트랜잭션/행 |
| 안정 ID·change ID 멱등 | manifest 선기록, 같은 ID 재사용 | 행 순서/삽입/정렬과 무관한 ID, 재시도 중복 방지 | unique constraint와 재시도 조회 |
| payload 일치 검증 | canonical digest 비교·rejections | 키 순서·빈 값·날짜 표기 일관성, 다른 payload 거절 | 표준 digest 및 원자적 idempotency 등록 |
| Run·History 내구 기록 | 별도 행, 누락 재생성 | Run/manifest/History 별도 시트 보호·한도·오류 시 기록 가능성 | 보존 정책·인덱스·백업·감사 권한 |
| 부분 실패 복구 | n번째 실패, History 보충, 3회 중단 | 각 쓰기 단계와 응답 유실에서 같은 manifest로 복구 | 프로세스 강제 종료·DB 오류·응답 유실 주입 |
| 미완료 Run 격리 | 기존 어댑터에서 제외 | 조회 중 부분 반영 노출 방지, complete 전 필터 | 일관된 read model·가시성 전환 |
| Review 1회 적용·종속성 | 결정된 Review 재요청 반환, 선행 conflict 시 후행 미적용 | 경쟁 확정·완료 이력·Review 행 복구, 사람 편집 경쟁 | 제약 및 트랜잭션/상태 머신 |
| 역할 재검증 | 적용 직전 project version·owner·deputy 확인 | 역할 변경과 완료 판단 사이 동일 잠금 범위 | Project·Task 경쟁을 포함한 트랜잭션 |
| 수집 키·교정 지속성 | SourceEvent/digest, Suppression 유지 | 중복 키 조회 한도, 억제 해제 이력과 scope 검증 | unique key, conflict variant 저장 및 검토 |
| 운영 동시성·장애 내구성 | 단일 프로세스에서만 검증 | 잠금 timeout/실행 시간·할당량/동시 실행·재개 trigger | 다중 인스턴스·프로세스 종료·스토리지 손실 검증 |
| 보안·접근 제어 | localhost·정적 경로 제한·합성 고정 사용자 | 승인 수집 범위, 최소 권한, 직접 시트 접근, 감사·내보내기 제어 | 인증·인가·권한 회수·민감정보 정책 |

G1 실행 체크리스트:
- [ ] 사용자 승인, 사용할 계정·합성 데이터·서비스 쓰기 범위 확정
- [ ] 같은 14개 시나리오를 양 후보에 적용하고 실제 출력 보존
- [ ] 두 실행 인스턴스 경쟁·중단·잠금 timeout·적용 후 응답 유실 검증
- [ ] 모든 변경 경로의 CAS/잠금 우회 불가능 확인; 보장 못 하면 후보 제외
- [ ] 실행 시간·쿼터·데이터량 증가·복구 횟수·운영 비용 측정
- [ ] 인증/권한/감사/보존/백업·복구 계획과 잔여 위험을 비교 후 OD-09 결정

## 설계 질의·보수적 해석

1. **실행 사용자·인증**: UI에 역할 선택 흐름이 없다. 로컬 시드는 담당자=책임자인 합성 P1을 고정한다. 실제 계정 권한 모델로 사용하면 안 된다. 역할별 전이는 서비스 테스트에서 검증했다.
2. **진행 중 버튼과 T5 사유**: 기존 폼에는 재개 사유 입력이 없다. '진행 중' 판단은 Review 결정만 저장하고 완료 Task를 사유 없이 재개하지 않는다. 재개는 transitions에서 사유를 받는다. 운영 UI는 별도 승인·설계 필요.
3. **확정 후 다시 선택**: 기존 기본 모드는 판단 변경을 허용하지만 M1 계약은 Review 1회 적용이다. PoC는 결정된 Review를 다시 적용하지 않고 기존 결과를 반환한다. 기본 모드는 그대로다. 폼의 기존 안내 문구와 차이가 남는다.
4. **불일치 payload 감사**: History는 change_id 1행을 보존해야 하므로 기존 성공 History를 덮어쓰지 않고 `rejections` 별도 행에 rejected_payload를 기록한다. 물리 스키마 확정 시 감사 조회 규칙 필요.
5. **digest 충돌 보존**: 정상 SourceEvent는 유지하고 다른 payload는 `eventConflicts` 별도 행에 보존한다. 원본 키를 바꾸거나 정상 집계로 자동 투영하지 않는다.
6. **단일 프로세스 CAS**: 동기 I/O와 rename을 사용하는 한 Node 프로세스에서만 비교·적용 배타성을 보장한다. 다른 프로세스가 같은 디렉터리를 수정하는 사용은 지원하지 않는다. 다중 프로세스 잠금/DB 선택은 OD-09에서 검증해야 한다.
7. **미확인 Run 표시**: 어댑터 계약대로 미완료 Run은 정상 집계에서 제외한다. 별도 '확인 중' 건수 UI는 기존 뷰 모델에 없어 추가하지 않았다(M1 보고서와 동일). Run API 내부 데이터로 확인할 수 있다.
8. **수집 경계**: 합성 정규화 이벤트를 입력받는다. Drive 다중 동작·대상을 분해하는 실제 API 어댑터, GitHub PR 동작 매핑, 계정 권한 검증은 포함하지 않는다. 공식 API 호출은 하지 않는다.

## 남은 위험과 상태

- 파일 rename의 프로세스 내 원자성과 주입 예외를 검증했다. fsync·정전·디스크 고갈·프로세스 강제 종료의 내구성은 미검증이다. 저장 오류가 Run 상태 기록 자체를 막을 수 있으며, 이 경우 디스크에 남은 manifest를 수동 확인해야 한다.
- JSON CAS는 다중 인스턴스 운영용이 아니다. receipt/History 증가에 따른 용량·성능, 대량 수집, 역할 변경의 다중 프로세스 경쟁은 G1 이후 과제다.
- local API는 실사용 인증 기능이 없고 합성 고정 사용자만 사용한다. 외부 노출·운영 배포 금지.
- 독립 AX-Reviewer 검토·Lead 완료 판정은 수행하지 않았다. Builder는 추가 위임하지 않았다.
- `git diff --check`에는 시작 전부터 있던 `CLAUDE.md:114: new blank line at EOF` 경고가 남는다. 기존 사용자 변경을 수정하지 않았다.

## 변경 파일과 diff

이번 변경: `app/poc/` 10개 파일 신규, `app/src/app.ts`, 생성된 `app/app.js`, `app/package.json`, `app/.gitignore`, 이 보고서, `tasks/current-state.md`.
`app/styles.css`의 기존 M0 변경은 보존했고 이번 추가 변경은 없다. `app/data.json`, `app/data.js`, `app/assets/`, `app/build.py`는 git diff 없음. 기존 tests 파일 수정 없음.

`git diff --stat`은 기존 M0·M1 변경까지 포함하고 untracked 신규 파일은 포함하지 않는다.

## 검토 결함 수정 결과

독립 검토 fail 이후 수정·재검증 작업이다. `m2-review-red.log`에서 추가 재현 10개 모두 실패, 최초 수정 후 23/26, Windows 파이프의 한글 인코딩 문제를 수정한 뒤 26/26 통과했다. 추가 입력 검증·manifest 응답 유실 테스트 2개도 통과했다. 기존 `app/tests/*.test.cjs`와 기준 이미지는 변경하지 않았다.

| 결함 | 원인과 수정 | 회귀 근거 |
|---|---|---|
| 1 | 수정 Run이 생성 Run을 덮어씀. `created_run_id` 보존, 생성·수정 Run 모두 complete여야 노출. 다른 미완료 Run 소유 행의 쓰기는 conflict, 요약 갱신은 rejected | A1: 미완료 WorkLog 후속 요약과 집계 차단 |
| 2 | API 보조 필드가 원본 snapshot 사용. decisions/taskStates를 포함한 전체 조회에 동일 Run 필터 적용 | A2: Review·Task 저장 뒤 History 실패 시 보조 필드 제외 |
| 3 | Task 적용 후 Review 경합. manifest에 Review CAS 예약을 첫 변경으로 기록. Task는 예약 History applied에 종속, 최종 Review는 Task에 종속 | A3 및 브라우저: 다른 판단 conflict, 원 요청 재개 후 Task·Review 일치 |
| 4 | manifest와 입력 메타데이터가 별도 쓰기. 최초 Run put에 input/request를 포함 | A4 두 경우와 decision manifest 응답 유실: 같은 입력 재개, 변경 입력 거절 |
| 5 | 수집 결과를 무시하고 match 지속. 신규·중복·충돌·미완료·실패 반환, 충돌·미완료는 conflict Review와 자동 처리 중단 | A5: digest 충돌에 명시 TSK ID가 있어도 Link 0 |
| 6 | change_id를 시각으로 사용하고 감사 근거 누락. 주입 clock과 reason/basis 보존 | A6: 정확한 ISO 시각, 판단 사유, Review 근거 단언 |
| 7 | 키만 시각 정규화. digest도 UTC 정규화 payload와 동일 키 사용 | A7: KST/UTC 동등 시각 digest 동일 |
| 8 | 재개·권한 실패 검증 부족. 이전 History 보존, 재개 상태·남은 Review superseded 단언, 입력 경로 permission 실패 추가 | 시나리오12·14 보강, A8, 브라우저 7개 장애 지점 |
| 9 | 초기화가 메모리만 삭제. PoC는 서버 재조회, 저장 판단 재조회 안내. 기본 모드 문구 유지 | A9 및 브라우저 초기화·새로고침 후 건수 유지 |

부분 실패 복구 규칙: `deciding` 예약에 판단자·answer·change_id를 고정한다. 해당 Run이 미완료인 동안 다른 판단은 conflict다. 같은 요청만 저장된 manifest로 미적용 변경과 History를 보충한다. 복구 3회 실패 시 failed로 잠금을 유지하고 사람 확인 대상으로 남긴다. 실패 확정은 자동 잠금 해제나 새 판단 허가가 아니다. 이미 적용된 Task를 상반된 판단으로 덮어쓰지 않도록 수동 복구가 필요하다. complete이지만 종속 변경이 conflict인 예약도 자동 재판단하지 않는다.

OD-09 필수 기능 및 G1 추가 체크리스트:

| 필수 기능 | G1 검증 |
|---|---|
| Review 예약 경쟁 | 같은 Review의 상반된 판단을 각 쓰기 경계에서 경쟁시켜 Task·Review 일치 및 실패 예약의 수동 복구 확인 |
| Run 간 후속 수정 | 미완료 생성·변경 행을 다른 Run이 수정해도 정상 집계로 세탁되지 않는지 확인 |
| API 보조 필드 가시성 | decisions/taskStates 및 조회별 우회 필드가 동일 complete 필터를 적용하는지 확인 |
| manifest 메타데이터 실패 | 최초 manifest·요청 저장 전후 장애·응답 유실에도 입력 검증과 재개가 가능한지 확인 |
| 충돌 이벤트 자동 처리 중단 | digest 충돌·미완료 수집의 명시 ID·LLM 제안이 Link/Task/WorkLog를 바꾸지 않는지 확인 |

### 최종 검증과 변경 범위

typecheck와 build exit 0, `m2-existing-final-review.log` 43/43, `m2-navigation-repair.log` 88/88, `m2-visual-repair.log` 54/54. 시각 차이 전부 0이며 기준 PNG manifest 해시 54개 모두 일치한다. Phase A 완료 뒤 Phase B를 시작했다. `app.js`는 최종 TypeScript에서 재생성했다. 대규모 데이터 추가 뒤 서비스·데이터셋 34/34, 브라우저 3/3을 확인했고, 최종 재실행 로그는 `m2-poc-verified.log`다. 데이터셋 세부 결과는 `m2-dataset-report.md` 참조.

이번 위임에서 변경한 파일 목록:

- `app/poc/{write-service,transitions,decisions,collector,matching,server}.cjs`
- `app/poc/{poc.test,browser-test,regression.test,dataset.test}.cjs`
- `app/poc/dataset/{generate.cjs,synthetic-large.json}`
- `app/src/{adapter.js,app.ts}`, 생성된 `app/app.js`, `app/package.json`
- `docs/migration/{m2-local-report,m2-dataset-report}.md`, `tasks/current-state.md`

기존 작업 트리의 다른 변경은 보존했다. `app/data.json`, `app/data.js`, `app/assets/`, `app/build.py`, 기존 `app/tests/*.test.cjs`의 git diff는 없다. `git diff --check`는 시작 전부터 있던 `CLAUDE.md:114` EOF 빈 줄 경고로 exit 1이며 이번 변경 파일의 공백 오류는 없다. 빌드·테스트 통과가 독립 Reviewer/Lead 판정이나 G1 승인을 대신하지 않는다. Git commit/push 하지 않았다.

```text
 .gitignore                  |   2 +
 AGENTS.md                   |  77 ++++++++++++++++++++++++++
 CLAUDE.md                   |  17 ++++++
 app/.gitignore              |   3 +
 app/app.js                  | 131 ++++++++++++++++++++++++++++++++++----------
 app/package.json            |  14 ++++-
 app/src/app.ts              | 108 +++++++++++++++++++++++++-----------
 app/src/model.js            |   4 +-
 app/styles.css              |   3 +
 docs/02-decisions-needed.md |   2 +-
 docs/decisions/README.md    |   4 +-
 tasks/backlog.md            |  19 ++++---
 tasks/current-state.md      |  62 ++++++++++++++++++++-
 13 files changed, 371 insertions(+), 75 deletions(-)
```

### Current worktree git diff --stat

Tracked changes include pre-existing work; new untracked PoC/dataset/report files are excluded by Git.

```text
 .gitignore                       |   2 +
 AGENTS.md                        |  77 ++++++++++++++++++++++
 CLAUDE.md                        |  17 +++++
 app/.gitignore                   |   3 +
 app/app.js                       | 135 ++++++++++++++++++++++++++++++---------
 app/package.json                 |  14 +++-
 app/src/app.ts                   | 109 ++++++++++++++++++++++---------
 app/src/model.js                 |   4 +-
 app/styles.css                   |   3 +
 docs/02-decisions-needed.md      |   2 +-
 docs/decisions/README.md         |   4 +-
 docs/migration/open-decisions.md |   5 ++
 tasks/backlog.md                 |  19 +++---
 tasks/current-state.md           |  77 +++++++++++++++++++++-
 14 files changed, 396 insertions(+), 75 deletions(-)
```

### Phase C 최종 검증

v2 전환 후 typecheck/build exit 0, 기존 `npm test` 43/43, navigation 88/88, visual 54/54(모든 비교 차이 0). PoC 브라우저 4/4에서 주간 담당자 선택지가 전체+김지현·박성진·이수민, 프로젝트 7개, 기본 예시의 모든 프로젝트명임을 확인했다. 봇 근거 WorkLog의 unknown 실행자 검사도 추가했다. metadata 없는 런타임→v2 전환, 같은 데이터셋 판단 보존, 명시 reset의 백업·재시드를 별도로 실행해 모두 pass였다(`m2-phase-c-reset.log`).

Phase C 변경 파일은 `app/poc/dataset/{generate.cjs,synthetic-large.json}`, `app/poc/{dataset.test,regression.test,browser-test}.cjs`, 기존 표현 필드를 보존하는 `app/src/adapter.js`, 이 보고서와 `tasks/current-state.md`다. 항목 1~9에서 바꾼 파일은 위 목록과 구분한다. 최종 복구 목록은 같은 Review의 새 요청이 예약 중일 때 이미 해제된 과거 요청을 다시 표시하지 않도록 예약 소유 ID도 확인한다. 보호 파일은 그대로이며, 미해결 테스트 실패 없음. 독립 검토·Lead 완료 판정 대기.

최종 실제 출력(`app/test-results/m2-final-poc.log`, exit 0):
```text
서비스·데이터셋: tests 48 / pass 48 / fail 0
브라우저: tests 4 / pass 4 / fail 0
npm test: tests 43 / pass 43 / fail 0
npm run typecheck: exit 0
npm run build: exit 0
navigation: {"checks":88,"failures":0,"errors":0}
visual: {"checks":54,"failures":0,"errors":0}
baseline_hashes=54 mismatches=0
missing_metadata_migration=pass same_dataset_preservation=pass explicit_reset_backup=pass
```
기준 이미지 재생성 없음. 보호 파일 `app/data.json`, `app/data.js`, `app/assets/`, `app/build.py`, 기존 `app/tests/*.test.cjs`의 git diff 없음. 심각한 미해결 재현 오류 없음. 기존 CLAUDE.md:114 EOF 빈 줄 경고만 남는다. 전원 장애·다중 프로세스·실사용 인증 한계는 그대로이며, 독립 검토/Lead 판정은 대기다. 기존 서버/런타임에는 적용하지 않았으므로 Lead가 서버를 재시작하면 새 시드 메타 규칙이 작동한다.

최종 작업 트리 git diff --stat (기존 미커밋 변경 포함, untracked PoC·데이터셋·보고서는 Git 통계에서 제외):
```text
 .gitignore                       |   2 +
 AGENTS.md                        |  77 ++++++++++++++++++
 CLAUDE.md                        |  17 ++++
 app/.gitignore                   |   5 ++
 app/app.js                       | 163 ++++++++++++++++++++++++++++++++-------
 app/package.json                 |  15 +++-
 app/src/app.ts                   | 124 +++++++++++++++++++++--------
 app/src/model.js                 |   4 +-
 app/styles.css                   |   3 +
 docs/02-decisions-needed.md      |   2 +-
 docs/decisions/README.md         |   4 +-
 docs/migration/open-decisions.md |   5 ++
 tasks/backlog.md                 |  19 +++--
 tasks/current-state.md           |  93 +++++++++++++++++++++-
 14 files changed, 458 insertions(+), 75 deletions(-)
```

