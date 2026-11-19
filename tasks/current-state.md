# 2026-11-19 ADR-016 자동 판별 AX-Builder 인계 (최신)

- 현재 작업 트리에서 `drive:auto-classify` extract/apply/dry-run/revert 구현. 판별은 AX-Lead가 수행하며 코드는 입력 최소화·결과 검증·반영만 담당한다. 첫 extract에서 자동 판별 모드 전환, 이후 수집 전건 검토 없음. confidence 기본 0.8, 근거·상충·사람 교정·완료 변경·오래된 입력 검증. 병합·분리·작업 내역·연결 생성/수정·감사·되돌리기·지표 구현.
- 검증: 신규 합성 8/8, npm.cmd test 43/43, test:server 최종 60/60, navigation 88/88, visual 54/54(픽셀 차이 모두 0), typecheck exit 0. build는 python PATH 없음/샌드박스 trampoline 권한 오류 후 같은 build.py를 설치된 python3.15.exe로 샌드박스 밖 실행해 exit 0. 기준 이미지 재생성 없음.
- 보호 파일 편집·새 의존성·추가 위임·Git commit/push·실제 Google 호출·실데이터/자격 증명 접근 없음. 기존 미커밋 변경 보존.
- 보고서 및 이번 변경 파일 목록: `docs/migration/m4-auto-classify-report.md`. CLI/package, classify 3모듈, DriveStore, Service projection, 신규 서버 테스트, 보고서·이 상태 문서.
- 한계: 첫 extract 전에는 기존 CSV/제안 경로 호환 유지. 공통 context 자체가 8 MiB를 넘으면 실패. revert는 결과 묶음 전체를 보존하는 보수적 충돌 정책. human_reverted는 자동 변경 후 사람의 교정도 포함. unknown 실행자의 집계 영향 판단은 AX-Lead가 needs_review로 명시한다. 전용 사람 편집 화면은 추가하지 않음.
- 다음: AX-Lead/독립 Reviewer의 완료 검토. Builder는 실수집/운영 시작을 판정하지 않음. 미해결 테스트 실패 없음.

# 2026-11-19 F2~F6 AX-Builder 인계 (이전)

- F1 유지. F2~F6 회귀 6개 통과, 소켓 제외 서버 42/42, OAuth 실제 소켓 단독 1/1, 단위 43/43, navigation 88/88, visual 54/54, typecheck 통과. 보호 파일 74개 SHA-256 변경 없음.
- **미완료/중단**: 수정·재검증 3회 도달. pilot-decision 테스트 after hook이 DB/서버 종료 전에 Temp 디렉터리 rmSync → EPERM, 전체 test:server 종료 불가로 중단. build는 python 미설치 PATH 및 python3.15 trampoline permission denied. 추가 코드 수정하지 않음.
- 실제 Google 호출/실데이터·자격 증명 접근/추가 위임/commit/push 없음. 실수집 시작 판정 보류.
- 다음: Lead가 테스트 정리 순서 후속 수정 범위·Python 실행 환경을 해결하고 전체 서버/build 검증 후 Reviewer 마지막 검토. 상세·로그·파일 목록은 docs/migration/m4-drive-connector-report.md 보안 검토 대응 절.

# 현재 상태 (세션 간 인수인계)

## 2026-11-19 M4 게이트 1·4 / 보안 Part C — AX-Builder 최신 인계

- 현재 작업 트리 사용. 추가 에이전트·Git commit/push·실제 Google 데이터 API 호출·실데이터 접근 없음.
- 게이트 1: 빈 DB 수집 → UTF-8 BOM CSV 초안 → 사용자 수정 → 키 기준 import + folder mapping + 재판별 → 검토함 → metrics 구현. 프로젝트/태스크 키·필수 열·업무 유형 검증, 없는 폴더/담당자 경고, 사람 Link 불변, tx 전체 롤백. 신규 테스트 4/4 통과.
- 게이트 4: metadata 없는 removed는 기존 source unknown+checked_at, 미등록 무시. trashed 별도 상태와 STRICT CHECK migration. 기존 이벤트·WorkLog·Link 보존 및 복구 테스트 통과.
- Part C: fields 경로 수정·독립 REST 부분 스키마 검증, action.target/actor 우선, Activity 저장 직전 files.get 소속 확인, 외부 이동/접근 상실 상태 및 화면 제목·경로 숨김, ACL 준비/확인 CLI, export .pilot 제한, OAuth 1회 소비·timeout·refresh, corrected task_id 검증·고정 오류 코드, 로컬/DB drive ID pin 구현.
- **미완료/중단**: Part C 수정·재검증 3회 도달. 최종 server 35/36, ACL 실제 적용 테스트에서 icacls /setowner 현재 SID가 exit 5(접근 거부). ACL 이후 토큰 temp/WAL/SHM/감사 대기열/백업 통합 검증에 도달 못함. 정상 사용자 실행에서 환경 권한 문제인지 확인 필요. OAuth malformed URL·중복 callback 경쟁 및 pilot-decision endpoint 전용 재현 테스트는 미완료. 전체 AC 미충족, 완료·실수집 시작 판정 보류.
- 검증: npm test 43/43, typecheck exit 0, navigation 88/88, visual 54/54(모든 baseline/offline 픽셀 차이 0). build는 python PATH 미설정 실패 후 설치된 python3.15.exe로 같은 build.py를 샌드박스 밖 실행해 exit 0. 기준 이미지 재생성 없음.
- 보호 파일 직접 편집·새 npm 의존성·디자인 변경 없음. 기존 작업 트리 변경 보존. git diff --check는 기존 CLAUDE.md EOF 경고만 남음.
- 상세: docs/migration/m4-drive-connector-report.md의 사용자 준비 절차·게이트 1/4·보안 검토 대응 절. 다음: Lead/Reviewer 검토 및 미완료 검증의 후속 차수 범위 결정. Builder는 추가 수정하지 않음.

## 재개 요약 (2026-11-19 최신, 먼저 읽을 것)
- **기획 변경 (2026-11-19, ADR-017)**: 핵심 가치 = Drive·Gmail·Chat·GitHub 통합 취합. 내용은 읽고 원문은 저장 안 함, 핵심(요약·명칭·참조·사람·날짜)만 보호 정보 표에 저장해 다음 판별 기준으로 사용. 수집은 gws-work `workspace_action` 읽기 액션 허용 목록만. 다음: m5 핵심 추출·교차 소스 연결 설계
- gws-work 진단: `workspace_action` drive.read_text는 성공(Claude Code). 앞선 실패는 `artiws_gws_read`의 비공개 입력 형식 문제였음(권한 문제 아님). Drive 활동 기록 액션은 workspace_action에 없음
- gws-work OAuth 메타데이터: 동적 클라이언트 등록(/register), authorization_code+refresh_token, PKCE S256 지원 → 웹 사이트가 사용자별 OAuth 클라이언트가 되는 것이 기술적으로 가능(외부 redirect 허용 여부·운영 정책 미확인, 등록 시도 안 함)
- 단계: M4 실데이터 파일럿(공유 드라이브 AX-TF). 브랜치 `chore/ui-baseline-verification`, **git commit/push 금지**. 파일 수정 등 일반 작업은 승인 없이 진행·보고
- 확정 결정: `docs/decisions/` ADR-001~013, 015, 016 (ADR-008은 016으로 대체, ADR-014 운영 DB 제품은 예정)
  - ADR-013 DB 원본·Sheets 읽기 전용 / ADR-015 AX-TF 파일럿(메타데이터·활동만, 로컬 SQLite, 실제 팀원 3명 아님, 고지 없음) + 변경: 첫 확인은 Apps Script 내보내기 / ADR-016 자동 판별 우선(확신도 0.8 이상 자동 반영, 충돌·미달·사람 결정 재변경만 검토, 파일럿 판별자는 이 Claude Code 세션)
- 코드: `app/server/`(SQLite 4층, connectors/drive: oauth·client·collect·store·structure·import·classify·security·apps-script/), `app/poc/`(비교용), UI 기본 화면 불변
- 검증(app/): typecheck, build, `npm test` 43, `test:server` 60, `test:navigation` 88, `test:visual` 54(기준 이미지 재생성 금지)
- 보안: 실수집 경로 보안 재검토 3회 + Apps Script 한정 검토 pass-with-changes(Lead가 medium 3건 수정). 엔드포인트·스코프 불일치 없음
- 실행 흐름: Apps Script(README `app/server/connectors/drive/apps-script/README.md`) 내보내기 → `.pilot/imports/` → drive:secure-dirs → drive:import → drive:auto-classify extract → **AX-Lead 판별 result.json** → apply --dry-run → apply → `?data=pilot` 확인 → drive:metrics
- **gws-work MCP 시도 (2026-11-19, 중단)**
  - 대상: Codex에 연결한 `gws-work`(ARTIWS, Cloud Run 호스팅, 운영 주체 미확인). Gmail 발송, 공유 변경, 삭제 같은 쓰기 기능도 들어 있다.
  - 공유 드라이브: 실제 이름은 `AX_TF`(ID `0APlC9…`)이고 공유 드라이브는 이것 하나다.
  - 성공: `artiws_gws_read` drive.drives.list(input `{}`)
  - 실패: drive.files.list는 Google API 원형, `{driveId}`, `{driveId,limit}` 모두 INVALID_INPUT이었다. capabilities에도 입력 스키마가 없다.
  - 호출 6회, 쓰기 없음, 저장 없음
  - Claude Code 직접 연결 후 재시도(같은 날)
    - 성공
      - drives.list `{}`
      - files.get `{fileId}`: DTO 필드는 fileId, name, mimeType, parentIds, driveId, modifiedAt
    - 실패(모두 INVALID_INPUT)
      - files.list: `{}`, `{query}`, `{q,driveId,corpora}`, `{connectionId,driveId}`, `{folderId}`, `{parentId}`, `{driveId,pageSize}`, `{scope}`
      - activity.query: `{ancestorName}`, `{itemId}`
      - inventory.list: `{driveId}`
    - 결론: 입력 스키마가 비공개라 담당자 문서가 필요하다
  - 재개 조건: 운영자에게서 files.list와 activity.query 입력 형식을 받을 것
- 사용자 확인 대기: (1) gws-work 운영 주체와 입력 형식 문서, (2) 완료 판단(ADR-006) 유지/자동, (3) Apps Script 실행 결과
- 실제 .pilot으로 연습 금지(가짜 드라이브 ID가 고정됨)

## 2026-11-19 legacy 선별 이관
- 완료한 일/확인 근거:
  - `선별이관패키지.zip`(31개 항목, sha256 2b8ede11…) 경로 탈출·심볼릭 링크 검사 후 임시 폴더에 해제하고 덮어쓰기 없이 복사
    - `app/` 전체, `docs/legacy-context/` 00~06 + README + `HANDOFF_START_HERE.md`, `prompts/00-handoff-import.md`
    - CLAUDE.md, AGENTS.md, .claude/, .agents/, .codex/, paseo.json, 기존 prompts 01~03은 그대로
  - legacy 00~06과 신규 초안 docs/01~06 비교 → `docs/migration/` 3개 문서 작성
  - UI 테스트 `node --test tests/*.test.cjs` 26/26 통과 (Node v26.13.0)
- 열린 이슈:
  - typecheck/build 미실행 (TypeScript 미설치, npm install은 네트워크가 필요해 승인 후 진행)
  - 시각·키보드 검증 미완 (ui-reuse-plan V1~V3)
  - 신규 초안과 legacy 충돌: 계층(OD-03), 공수/건수(OD-02), 저장소(OD-04/09), 입력 방식(OD-10)
- 수정한 파일: docs/migration/{planning-baseline,ui-reuse-plan,open-decisions}.md, tasks/current-state.md (app/ 코드는 변경 없음)
- AX-Reviewer 독립 검토 1회 완료 (agent 320f7d86): pass-with-changes, high 3·medium 7·low 1 → 11건 모두 반영 (D-10 게이트 OD-13 복원, SourceEvent 이벤트 보존, 다대다 투영 한계, 충돌 표현 완화, OD-02 성공 기준 변경 목록, OD-07 단일안, OD-14·15 추가, M0~M4 순서 조정, OD-08 보호 범위 확대, V1~V3 구체화, 참조 수정)
- 다음 실행 태스크: 사용자 승인 → 승인된 OD를 docs/decisions/ADR로 기록 → M0 기준선 확보(Builder)
- 승인 요청: OD-01, 02, 03, 04(방향), 06, 07, 08(원칙), 10, 12, 13 / docs/02의 D-01~D-10은 OD로 통합해 관리

## 2026-11-19 승인 반영
- 사용자가 OD-01·02·03·04(방향)·06·07·08(원칙)·10·12·13을 전체 승인함 → `docs/decisions/ADR-001~010`
- `docs/02-decisions-needed.md` 상태 갱신, `tasks/backlog.md`를 M0~M2 중심으로 재작성, `.gitignore`에 `preview/` 추가
- 미결정 유지: OD-05, 09, 11, 14, 15
- 확인 필요: `AGENTS.md` §1·§3의 공수·Activity 기술이 ADR-002·003과 표현이 다름. 정책 파일이라 수정하지 않았음
- 커밋: `docs/legacy-migration-baseline`에 a78f015, 8fc5f24 push 완료. PR은 미생성(gh 없음, GitHub MCP 인증 오류)
- M0-01~03: AX-Builder에 위임해 진행 중(agent df5adebf, 브랜치 `chore/ui-baseline-verification`)
- 사용자 지시(2026-11-19): 이후 작업은 **git commit 없이** 진행(push·PR도 하지 않음). 변경은 작업 트리에 남겨 둠

## 2026-11-19 M0 기준선 검증 — AX-Builder
- 단계: M0-01~03 결과 인계, Lead 완료 검토 대기. Commit/Push 없음.
- V1: typecheck/build 성공, 빌드 후 및 최종 Node 테스트 26/26 통과. app.js/data.js는 원본 백업과 바이트 동일.
- V2: Chromium 159.0.8154.6, 3개 뷰포트·6개 테마 기준 PNG 54장 확보. 읽기 전용 재비교 54/54 통과, 개발/독립 HTML 차이 0픽셀(색상 임계값 0.01, 차이 개수 허용 0).
- V3: 개발/독립 HTML 자동 점검 38건 중 30 통과·8 실패. 양쪽 모두 테마 선택 진입/복귀/배경 차단, 테마 새로고침 유지 실패. UI 수정 없이 기록. 전체 Tab 순서 등 수동 범위는 미검증.
- 변경: 검증 스크립트·패키지·잠금 파일·기준 이미지·ignore·보고서. UI 소스/스타일/데이터/생성물 내용 diff 없음.
- 보고서: `docs/migration/m0-baseline-report.md`, 재실행 안내: `app/tests/visual/README.md`.
- 다음: Lead 검토, V3 결함 및 수동 점검의 후속 범위 결정. 전체 UI 회귀 게이트 통과로 처리하지 않음.
- Lead 완료 검토(2026-11-19): typecheck 통과, `npm test` 26/26, `npm run test:visual` 54/54 직접 재실행 확인. 보호 대상 UI 파일 diff 없음. 미커밋(사용자 지시).
  - V3 결함 원인 추정: `app/src/app.ts:376`이 `data-initial-theme`를 localStorage `ax_theme`보다 우선 → 새로고침 시 저장 테마 무시. 테마 선택 창 포커스 관리(진입·복귀·배경 차단) 누락.
  - 결함 수정은 UI 변경이라 사용자 승인 필요(백로그 M0-04로 등록).

## 2026-11-19 M0-04 · M1 착수
- 사용자 승인: 디자인을 바꾸지 않는 범위의 UI 결함 수정 전부, M1 즉시 진행. 커밋 없이 진행
- M0-04: AX-Builder 수정·검증 완료(agent 6d8c7857), Lead 검토 대기. typecheck/build 성공, 기존 테스트 26/26, 탐색 88/88, 시각 54/54(양쪽 실행본 차이 0픽셀). 기준 이미지 재생성 없음
- M1-01~03 설계안: `docs/design/m1-01-logical-model.md`, `m1-02-completion-state.md`, `m1-03-matching-and-automation.md`
- M1-04 연동 조사: `docs/research/m1-04-integration-research.md` → 파일럿 소스 Drive + GitHub 권고(OD-05 승인 필요)
- AX-Reviewer M1 설계 검토 1회 완료(agent 7fc52e8e): pass-with-changes, high 8·medium 3, blocker 없음 → 11건 모두 반영(설계안 v2). 주요: Run manifest·ID 선할당, 비교·적용 단일 연산, 서비스별 SourceEvent 키·정규화, 명시적 ID는 Task Link까지만 자동, Suppression(source 범위)·해제 경로, 미상 값·Review 종류 투영 규칙, T4는 자기 승인으로 제한, Drive Restricted 스코프·webhook 서명 검증
- 신규 태스크: M1-06 UI 최소 동작 변경(m1-01 §6: sourceId 선택, 시각 미상·날짜만, 실행자 미상 집계 제외, completion 외 Review 방어). 디자인 불변, 사용자 승인 범위 내
- 다음: M1-05(픽스처·어댑터 계약 테스트) Builder 위임(M0-04 끝난 뒤) → 승인 요청(OD-05, SourceEvent 분리안)

- 사용자 승인(2026-11-19): OD-05 파일럿 소스 Drive + GitHub → ADR-011. SourceEvent 분리안 승인 → ADR-012

## 2026-11-19 M0-04 수정·검증 — AX-Builder
- 범위: 사용자가 승인한 디자인 불변 V3 결함 수정. 기존 브랜치 유지, 추가 에이전트·Commit·Push 없음.
- 변경: 저장 테마 우선 및 기본값 방어, 테마 선택 모달 포커스 진입·순환·복귀, 모든 모달의 건너뛰기 링크 차단·검색 단축키 격리, 자료 런처의 정확한 복귀, 담당자/Airtable 컨트롤의 재렌더 후 포커스 유지.
- CSS 예외: 기존 검색 입력의 outline:0을 Tab·/ 탐색 중에만 보완하는 규칙 1개. 마우스 입력 시 해제. 최종 시각 비교 54개 모두 baselinePixels=0/offlinePixels=0. 데이터·에셋·기존 테스트·기준 PNG 보존.
- 검증: 소스 수정·재검증 3회 이내. 최종 typecheck/build exit 0, npm test tests 26/pass 26/fail 0, test:navigation checks 88/failures 0/errors 0, test:visual checks 54/failures 0/errors 0. 기준 PNG 54개 manifest 해시 불일치 0.
- 근거: `docs/migration/m0-baseline-report.md`의 M0-04 수정 결과, `app/test-results/{navigation,visual}.json` 및 `m0-04-*-final.log`(Git 제외).
- 남은 확인: 시각적 Tab 순서 판단·포커스 대비/가림·모든 데이터/상태 조합·모바일 실기기·스크린리더 안내는 미검증. 검증 범위 내 미해결 오류 없음.
- 다음: AX-Lead 완료 검토 후 M1-05. main 병합 및 외부 서비스 작업 없음.

- M0-04 Lead 완료 검토(2026-11-19): typecheck 통과, npm test 26/26, test:navigation 88/88, test:visual 54/54 직접 재실행. CSS 변경은 키보드 탐색 중 검색창 포커스 표시 1줄(기본 화면 무변화). 완료(미커밋)
- M1-05 + M1-06: AX-Builder 위임(agent 75c319c6), 어댑터는 앱에 아직 연결하지 않음

- M1-05·06 Lead 완료 검토(2026-11-19): typecheck 통과, npm test 43/43(기존 26 + 신규 17), test:navigation 88/88, test:visual 54/54 직접 재실행. styles.css·data.json·data.js·assets·build.py 이번 변경 없음. 완료(미커밋)
  - 설계 질의 7건(`docs/migration/m1-05-06-report.md`): 모두 보수적 해석으로 처리. 후속 결정 필요: 미완료 Run "확인 중"·시각 미상 별도 카운트 UI(뷰 스키마에 자리 없음, 디자인 추가 필요)
- M1 완료. 다음: M2 실행 환경 PoC(OD-09) 범위 확정 — G0 로컬 우선, Sheets 등 외부 쓰기는 G1 승인 필요

## 2026-11-19 M2-L 로컬 PoC
- 사용자 승인: M2를 로컬(G0)로만 진행. 외부 Sheets 비교(G1)는 로컬 결과 후 결정
- 설계: `docs/design/m2-local-poc.md`(JSON 표 저장소, 행 단위 조건부 쓰기만 원자적, 가짜 LLM, 127.0.0.1 API, UI PoC 모드는 URL 옵션으로만)
- AX-Builder 구현 완료(agent 10fda66a): `app/poc/` 10개, 보고서 `docs/migration/m2-local-report.md`
- Lead 검증: typecheck 통과, npm test 43/43, test:poc 16/16 + 브라우저 1/1, test:navigation 88/88, test:visual 54/54 직접 재실행. 서버는 127.0.0.1 바인딩, Origin 검사. data.json·assets·build.py·기존 테스트 변경 없음
- AX-Reviewer 코드 검토 1회 완료(agent bac73046): **fail**. high 5(미완료 Run WorkLog 노출, API 보조 필드 필터 우회, Review 경쟁 판단 모순, manifest 메타데이터 실패 미복구, digest 충돌 후 자동 연결), medium 3(감사 정보, 시각 정규화 거짓 충돌, 시나리오 12~14 단언 약함), low 1(PoC 초기화)
- 사용자 요청: 더 많고 다양한 합성 데이터 → 사양 `docs/design/m2-synthetic-dataset.md`(8명·12프로젝트·태스크 90·작업 내역 600·이벤트 1,500 등, 로컬 모드 전용, data.json 불변)
- AX-Builder 위임(agent e3d326d5): Phase A 결함 수정(1회차/최대 3) → Phase B 데이터셋. 완료 후 Lead 검증, 수정 결과 재검토 필요 여부 판단

- 1회차 수정 + 데이터셋 완료(agent e3d326d5). Lead 검증: typecheck 통과, npm test 43/43, test:poc 34/34 + 브라우저 3/3, test:navigation 88/88, test:visual 54/54. data.json·assets·build.py·기존 테스트 변경 없음. 데이터셋 `app/poc/dataset/synthetic-large.json` 1.2MB, 비-example.invalid URL 0건
  - 잔여: 실패한 Review 예약(`deciding`)은 수동 복구 필요 → 여러 행 원자적 저장 불가에서 오는 저장소 제약 후보
- AX-Reviewer 재검증 2회차 진행 중(agent 626cf20a), 원인 분류(저장소 제약/구현 결함) 포함
- 2회차 재검증(agent 626cf20a): fail. 기존 9건 중 6 해결·3 부분, 새 high 3(오래된 버전으로 Review 영구 예약, 입력 digest 신뢰, 미완료 Suppression 해제 신뢰). 원인 분류: 부분 저장 복구만 저장소 제약, 나머지 대부분 구현 결함
- 3회차(최종) 수정 AX-Builder 진행 중(agent d59f2af3): 항목 1~8 + 9(시드가 기존 런타임 때문에 대규모 데이터 미적재 — 사용자 보고) + Phase C(데이터셋 v2)
- 사용자 피드백(데이터): 실제 프로젝트처럼, 규모 축소, UI 예시 7개 프로젝트에 태스크 추가, 팀원 3명 → 사양 v2 `docs/design/m2-synthetic-dataset.md`
- 확인용 서버: 127.0.0.1:8767(빈 임시 저장소, Lead가 띄움). 사용자 8766 서버(PID 4712)는 옛 런타임 데이터 — 종료는 권한 차단되어 건드리지 않음
- 3회차 수정 완료(agent d59f2af3). Lead 검증: typecheck 통과, npm test 43/43, test:poc 48/48 + 브라우저 4/4, navigation 88/88, visual 54/54. 데이터셋 v2: 프로젝트 7·팀원 3·태스크 50·작업 내역 201
  - Lead 확인 문제: 작업 내역 제목이 "태스크명 · 1차 초안 작성" 틀 반복, 시각이 23:59:59/00:00:01뿐, 자료 생성일 모두 10/01 → 실제 업무 느낌 부족
  - Lead가 문구 카탈로그 작성: `app/poc/dataset/work-catalogue.json`(기존 23개 태스크 준비 단계 2개씩 + 새 27개 태스크 3~4단계, 약 144건)
- 진행 중: AX-Builder 데이터 현실화(agent 8a1c25ce, 로직 파일 수정 금지) ∥ AX-Reviewer 3회차 최종 재검증(agent fc17fbc9, 저장소 전환 권고 포함)
- 확인용 서버 127.0.0.1:8767 재기동(v2 데이터, 빈 임시 저장소). 데이터 현실화 후 다시 띄울 예정
- **3회차 최종 재검증(agent fc17fbc9): fail — 수정·재검증 한도(3회) 도달, 추가 차수 자동 시작 안 함**
  - 9건 중 6 해결, 6·7·8 부분. 새 high 1("진행 중" 판단 잔류 예약 복구 누락), medium 2(복구 결과를 "저장됨"으로 오표시, 참조 검사 범위)
  - 원인: 직접 원인은 구현 결함. 결함이 반복된 영역은 여러 행 원자성 부재를 메우는 예약·보정·격리 코드. Reviewer 권고: DB 원본 + Sheets 조회용 우선 검토
  - 저장소 방향 검토 문서 `docs/design/m2-storage-direction.md` 작성, (B) 권고. **사용자 승인 대기**(AGENTS §9 중요 아키텍처 변경)
  - G1 보류
- 데이터 현실화 완료(agent 8a1c25ce): 카탈로그 144건 반영, 작업 내역 191·원본 206. 원본 목표를 130→200으로 사양·테스트 조정(생성 데이터 바이트 동일 확인). Lead 검증: npm test 43/43, test:poc 54/54 + 브라우저 4/4, navigation 88/88, visual 54/54
- **사용자 승인(2026-11-19): B안** → ADR-013(DB 원본, Sheets 읽기 전용 사본). 사용자 요청: 실연동·프로젝트 누적·서버 이관·보수 편의 관점의 구조와 DB 적합성 검토
  - 설계안 `docs/design/m3-data-architecture.md`: SQLite로 시작·목표 PostgreSQL, 이식성 규칙, 현재 상태 표/추가만 하는 기록 표 분리, workspace_id, UUIDv7, 번호 마이그레이션, 저장소 어댑터 분리. G2 전 PostgreSQL 권장
  - 환경: Docker·PostgreSQL 없음, node:sqlite 3.54 사용 가능
  - AX-Reviewer 설계 검토 1회 완료(agent 363fbe8b): pass-with-changes, high 8·medium 3 → 설계안 v2로 전부 반영(원자적 업무 연산·잠금 순서, 이벤트 변형·키 대응·거절 시도 표, 복합 참조·Link FK+CHECK, STRICT·타입 매핑·시각 정밀도, node:sqlite는 RC·동기 API·연결 독점, 커서 페이지 단위·처리 대기열, 보호 내용 표 분리, 분할 보류, 온라인 백업, service 계층). G2 전 PostgreSQL 계약 테스트·이관 연습 필수
  - M3 로컬 DB PoC AX-Builder 위임(`app/server/`, 기존 `app/poc/`는 비교용 보존)
- M3 로컬 DB PoC(agent 9795ca1f): Builder 3회 한도 도달, 새 서버 17/18. 원인은 작은 시드의 category 누락(PowerShell 한글 치환 실패) → Lead가 `app/server/api/server.cjs` small()에 category·created_at 추가 → **test:server 18/18**. 미완료: 대리·자동 연결 두 연결 경쟁 테스트, 성능 측정, 일부 운영 서비스(조회 실패 Run, inbound, alias, 비자동 후보 Review 흐름, 읽기 인가 인터페이스)
- **사용자 승인 ADR-015**: 공유 드라이브 AX-TF 실데이터 파일럿, 사내 OAuth(팀원 1명), 로컬 SQLite 예외, 메타데이터·활동만 저장, 실제 팀원은 3명 아님, 별도 고지 없음. 내용 미저장 시 계층 판별 가능성은 첫 2주 측정 후 판단(부족하면 drive.readonly로 일시 읽기 — 별도 승인)
- M4 Drive 커넥터 + M3 잔여 보강 AX-Builder 위임(agent 4441ec25). 가짜 응답으로만 테스트, 실제 Google 호출 0건. 자격 증명은 사용자가 `app/.secrets/`에 직접 배치 후 drive:auth → drive:check → drive:collect(기본 최근 14일)
- M4-01 완료(agent 4441ec25). Lead 검증: typecheck 통과, npm test 43/43, test:server 26/26, `.secrets` Git 제외 확인, 스코프 2개 고정. 성능 조회 p95 0.25~1.13ms. 실제 Google 호출 0건
  - 실수집 게이트 미해결: (1) 파일럿 DB에 실제 프로젝트·태스크 없음 → Lead 결정: 수집 후 AX-TF 폴더 트리로 기준 정보 초안 CSV 생성 → 사용자 수정 → 가져오기 → 재판별, (4) 메타 없는 삭제 항목 처리. 3·5·7(reset 경합, 폴더명 변경 재계산, fsync)은 파일럿 규모에서 후속
- 진행 중: AX-Builder 게이트 1·4 구현(agent 8ce5d0ad) ∥ AX-Reviewer 커넥터 보안·데이터 최소화 검토(agent 6ae4ef16)
- **사용자 지시(2026-11-19) — 진행 방식**: 파일 수정 등 일반 작업은 승인 없이 진행하고 결과만 보고. AGENTS §9 승인 대상(실데이터, 외부 쓰기, 유료 인프라, 배포, 중대 범위 변경)과 git commit 금지는 유지
- **사용자 지시(2026-11-19) — 저장소 전환 기준**: M2-L 결함 수정이 3회차에도 Sheets식 제약(여러 행 원자적 저장 불가 등) 때문에 실패하면 Sheets 운영을 고집하지 않고 다른 운영 방식을 검토한다. 실패 원인을 "Sheets 제약 때문" / "구현 결함"으로 분류해 판단한다. 대안 후보: OD-09 (B) Sheets는 조회·공유용, 트랜잭션 DB가 원본 / (C) DB + 웹앱

## 갱신 형식

## 2026-11-19 M2 검토 결함 수정·합성 데이터 — AX-Builder
- 현재 작업: Phase A 9건 수정 및 Phase B 대규모 데이터셋 구현. 추가 에이전트·외부 서비스·commit/push 없음.
- Phase A: 재현 10건 RED 확인 후 GREEN. Review CAS 예약, 최초 Run 입력 원자 기록, 생성 Run 보존·후속 수정 차단, API 보조 필드 필터, 수집 결과 분기, 감사 시각·근거, 시각 정규화, 테스트 보강, PoC 재조회 초기화.
- Phase B: 8명/12프로젝트/90태스크/600내역/300자료/1500이벤트/1200연결/80검토/140실행. JSON 1,200,001 bytes. 기본 data.json·assets·build.py·기존 tests 및 기준 이미지 불변.
- 최종 검증: typecheck/build exit 0, npm test 43/43, navigation 88/88, visual 54/54. `m2-poc-verified.log` 전체 재실행 서비스·데이터셋 34/34 + browser 3/3, exit 0. 기준 이미지 54장 해시 불일치 0. 별도 데이터셋 복구 검증 6/6.
- 문서: docs/migration/m2-local-report.md, m2-dataset-report.md. 사양 충돌 예외: 신규 프로젝트는 태스크 2개·유형 2종. 공유 Source는 최소 10%보다 많은 100%.
- 남은 제한: 단일 프로세스 JSON, 실패 Review 예약은 수동 복구 필요, 신규 5명 개별 UI 필터는 기존 고정 목록 한계. 실데이터·운영 배포 미검증.
- 다음: AX-Lead 완료 검증 및 필요 시 독립 Reviewer 재검토. Builder의 완료 보고는 Lead 판정을 대신하지 않음.
- 시각/단계:
- 완료한 일/확인 근거:
- 열린 이슈:
- 수정한 파일/테스트 결과:
- 다음 실행 태스크:
- 승인 요청:

## 2026-11-19 M1-05·M1-06 — AX-Builder
- 범위: 합성 운영 스냅샷 어댑터와 계약 테스트, 자료 없는 작업·날짜/시각 미상·실행자 미상·completion 외 Review의 UI 방어. 앱에 어댑터 연결은 M2로 유지.
- 검증: typecheck/build exit 0, 기존 26개 + 신규 17개 Node 테스트 43/43. test:navigation 88/88, test:visual 54/54(모든 baseline/offline 픽셀 차이 0). 기준 이미지 54개 해시 불일치 0. docs/migration/m1-05-06-report.md 참조.
- 기존 파일 중 이번 변경: app/src/{adapter.js,app.ts,model.js}, app/app.js. 추가: tests/fixtures/ops-synthetic.json, tests/{adapter,adapter-ui}.test.cjs, 보고서. data.js·CSS·data.json·assets·build.py는 시작 시점 해시와 동일.
- 미해결: 설계 질의 7개를 보고서에 기록. 저장 계층의 재수집/동시성/복구·Suppression 검증은 범위 밖. 기존 CLAUDE.md EOF 공백 경고 1건 유지.
- 다음: AX-Lead 완료 검증 및 필요 시 읽기 전용 독립 검토. 이번 Builder는 추가 위임·Commit·Push 없음.

## 2026-11-19 M2-L 구현·검증 — AX-Builder
- 범위: G0 로컬 JSON 저장소/CAS·manifest 복구·상태 전이·Suppression·가짜 LLM·127.0.0.1 API·URL 선택 PoC UI. 추가 위임/외부 호출/Commit/Push 없음.
- 검증: 최종 test:poc 서버 16/16 + 브라우저 1/1, 기존 npm test 43/43. typecheck/build 성공. test:navigation 88/88, test:visual 54/54, 모든 비교 픽셀 차이 0, 기준 이미지 해시 불일치 0. 최종 검증 실행 세션 exit 0.
- 보고서: docs/migration/m2-local-report.md. 저장소 필수 기능과 G1 후보별 체크리스트 포함.
- 미해결: 단일 프로세스/정전 내구성 미검증, 고정 합성 사용자, 재개 사유 UI 없음, 미완료 Run 별도 건수 UI 없음. 운영 저장소 선정 근거로 확대 해석하지 않는다.
- 다음: AX-Lead 완료 판정과 독립 Reviewer 읽기 전용 검토. G1은 별도 사용자 승인 후 진행. Builder 구현·검증 완료, Lead 승인 전 최종 완료 판정은 대기.

## 2026-11-19 M2-L 3회차 최종 수정 및 Phase C — AX-Builder
- 항목 1~9 수정 후 typecheck/build exit 0, 기존 43/43, PoC 46/46 + browser 4/4, navigation 88/88, visual 54/54 확인. RED·중간 실패·GREEN과 원인 분류는 m2-local-report.md의 3회차 절에 기록.
- 이후 Lead의 Phase C 지시로 v2 사양 전체를 읽고 재생성: 기존 7개 프로젝트/23개 태스크/47개 기록/68개 자료 유지, 추가 27태스크. 팀원 3, 태스크50/기록201/자료130/이벤트450/연결350/검토25/Run45. 정상 노출 기록199.
- Phase C 첫 검증: v2 RED 5건 확인 후 데이터셋7 + 회귀23=30/30 GREEN. typecheck/build exit0, 기존43/43. PoC 전체 및 브라우저/탐색/시각 최종 확인 중.
- 보호 대상 data.json/assets/build.py 및 기존 app/tests/*.test.cjs 변경 없음. 기준 재생성·추가 에이전트·네트워크·commit/push 없음. 8766 기존 PID4712와 런타임은 Lead 담당, Builder 미접근.
- 문서: docs/migration/m2-{local,dataset}-report.md. 미지원: 다중 프로세스 잠금, 정전 내구성, 손상 데이터 자동 복구, 실사용 인증. 다음: 최종 검증 출력 기록 후 Lead/독립 Reviewer 재검토.
- Phase C 최종: typecheck/build exit0, 기존43/43, navigation88/88, visual54/54. PoC browser4/4에서 팀원3명·프로젝트7개·기존 프로젝트명 확인. bot WorkLog unknown, metadata 없음 전환·동일 데이터셋 판단 보존·강제 reset 백업 검증 pass. 마지막 복구 목록 소유 ID 회귀 추가 후 PoC 전체 최종 로그 확인 중.
- 최종 완료 근거: `m2-final-poc.log` 서비스·데이터셋48/48 + browser4/4, exit0. typecheck/build0, 기존43/43, navigation88/88, visual54/54. baseline SHA-256 54개 불일치0. 보호 파일 diff없음. git diff --check는 기존 CLAUDE.md:114 EOF 경고만 남음. 요청 범위의 미해결 재현 실패 없음. 다음: AX-Lead 완료 판정·Reviewer 독립 재검토, 운영 저장소 전환 여부 사용자 판단. commit/push/PR/기존 서버 재시작 수행 안 함.

## 2026-11-19 M3 로컬 SQLite DB PoC — AX-Builder 미완료 인계
- 현재 브랜치 유지, 추가 에이전트/commit/push/외부 데이터 접근 없음.
- app/server에 STRICT 스키마 26개 표 + schema_migrations, UUIDv7, 원자적 판단·요청 replay·실패 audit, 수집 페이지·queue lease, suppression, 보호 내용 purge, 온라인 backup 검증을 구현.
- app/package.json의 poc/poc:reset은 새 서버, test:server 추가. app/poc는 보존. 로컬 large 조회 7 프로젝트·50 태스크·189 작업 내역·팀원 3명 확인.
- 검증: typecheck/build 성공, 기존 43/43, navigation 88/88, visual 54/54(기준 재생성 없음). 최종 새 서버 18개 중 17 통과/작은 브라우저 1 실패.
- 수정·재검증 3회 한도 도달로 중단. 작은 시드 category/created_at 누락으로 .task-toggle이 안 나오며, 마지막 문자열 치환은 실제 반영되지 않았음. 추가 수정하지 않음.
- 5년 확장 benchmark는 이벤트 600,000 진행 로그 후 중지(exit 1). 측정 완료 결과 없음. 생성 DB는 ignored .benchmark에 보존.
- 전체 완료 조건 미충족: 두 연결의 대리/Link 경쟁, 기존 시나리오 전체 이전, basis 관계 시드/감사, self_approved·시각, 읽기 역할 제한, 시스템 요약 갱신, 운영 Run/alias/inbound 전체 흐름 등 미완료. 보고서의 설계 차이 목록 참조.
- 보고서: docs/migration/m3-db-poc-report.md. 다음: Lead 검토와 후속 차수 결정. 자동 수정·재검증 추가 시작 금지.

## 2026-11-19 M3 보강 / M4 Drive — AX-Builder 인계

- 현재 작업 트리 사용. 추가 위임·commit·push·Google API 요청·실데이터 접근 없음. 공식 문서 조회와 로컬 가짜 HTTP만 사용.
- 신규 Drive 계층에 허용 필드·actions×targets·고정 driveId 방어·두 커서·재동기화·429/5xx 재시도·OAuth loopback PKCE·4 CLI·제안 Review·지표 구현. `.secrets` 및 별도 `.pilot` DB Git 제외, `?data=pilot`에서 기존 검토함 스타일 사용.
- M3: 2연결 대리 해제/판단·거절/자동 Link 경쟁, 403 실패 Run, JSONL export/import 대조, seed digest/활성 lease 보호, busy 감사 대기열/재기록 보강.
- 검증: npm test 43/43, server 26/26, navigation 88/88, visual 54/54(차이 0, 기준 재생성 없음), typecheck/build exit 0. Chromium 가짜 API smoke(파일럿 출처·검토함·판단 불가 저장) 통과.
- **완료 판정 보류**: 실제 프로젝트/태스크 기준 정보 입력 경로 없음, reset prepare→open 경합·비협력 연결·비정상 종료 복구, 메타 없는 removed source 표시, 전체 파일럿 DB/API 브라우저·OAuth 성공 흐름 검증 부족. 행위자 permissionId 대응은 첫 실수집 검증 대상이다.
- 수정·재검증 3회 이내 후 추가 구현 수정 중단. 보고서 `docs/migration/m4-drive-connector-report.md`에 준비 절차·필드·검증·한계·변경 파일 기록. 성능 1회 결과는 보고서 추가 기록 참조.
- 다음: Lead가 미해결 게이트를 검토하고 후속 범위를 정한다. 자격 증명만 넣으면 실수집 준비가 완료된 상태로 취급하지 않는다.
## 2026-11-19 Apps Script 경로 / F3 잔여 — AX-Builder 인계

- 현재 작업 트리에서 Apps Script REST 내보내기·설치 README·drive:import 오프라인 재생 구현. ADR-015 변경 승인 범위. 실제 Google 호출/실데이터/자격 증명 접근/추가 위임/commit/push 없음.
- F3 판단 이력과 이동 후 하위 CSV 경로 누출을 RED→GREEN으로 수정. 현재 부모 체인과 공통 이름 마스킹 함수로 출력하고 원본 signals 보존.
- 검증: 기본 43/43, 전체 서버 52/52, navigation 88/88, visual 54/54(픽셀 차이 0), typecheck 통과. build는 python PATH·샌드박스 trampoline 차단 후 설치된 Python으로 권한 검토 실행해 exit 0. 시각 검사는 navigation 포트 충돌 후 단독 실행 통과. 기준 이미지 재생성·보호 파일 직접 편집·새 의존성 없음.
- 보고서: docs/migration/m4-drive-connector-report.md의 Apps Script 경로/F3 잔여 수정 절. 사용자 절차: app/server/connectors/drive/apps-script/README.md.
- 미검증: 실제 Apps Script 배포·회사 정책·API 활성 상태. 이어받기 조각은 전체 파일 목록 없이 활동이 제외될 수 있어 합치기 필요. 현재 경로는 마지막 가져온 메타데이터 기준.
- 다음: Lead 완료 검증·Reviewer 독립 보안 검토 후 사용자 본인 배포·실행. 자동 수정/전체 재검증 3회 종료, Builder 추가 수정 없음.

