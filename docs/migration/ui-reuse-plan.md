# 기존 UI 재사용·보존 계획

> 작성: AX-Lead, 2026-11-19 · 상태: **검토용 초안**(사용자 승인 전) · 이번 단계에서 `app/` 코드는 변경하지 않음
> 화면 기준: `docs/legacy-context/05_UI_SPEC.md` · 실행: `06_DEVELOPMENT.md`

## 1. 원칙
1. **새 UI를 만들지 않는다.** `app/`의 TypeScript·CSS·데이터·테스트·빌드를 그대로 기준선으로 쓴다.
2. 화면 데이터 형태(`data.json`의 `projects[].tasks[].subtasks[]`, `files[]`, `reviews[]`)는 **화면용 뷰 모델**로만 취급한다. 운영 저장 스키마는 별도로 설계하고, 둘 사이를 **어댑터**로 잇는다(OD-04 결정 후).
3. 가상 인물·정적 지표·샘플 설명 문장을 실데이터나 LLM 결과로 표현하지 않는다. 실데이터로 바꿀 때까지 `demoNotice`와 "연동 예정" 문구를 유지한다.
4. UI 변경은 승인된 태스크 단위로만, Builder가 수행하고 회귀 테스트를 통과해야 한다.

## 2. 구조 요약 (필요 범위만 조사)
| 경로 | 역할 | 보존 메모 |
|---|---|---|
| `app/src/app.ts` (~46KB) | 렌더링·문구·상호작용·검토 메모리 상태 | 동작 기준 원본 |
| `app/src/model.js` | 주(월~일, Asia/Seoul)·월 계산, 정렬, 집계 | 순수 함수. 운영 데이터 어댑터 뒤에서도 재사용 가능 |
| `app/src/icons.ts` | 자체 SVG 아이콘 | 유지 |
| `app/styles.css` (~90KB) | 6개 테마·반응형·스크롤 높이 | 테마 토큰·레이아웃 비율(22:43:35, 자료 목록 400px) 보존 |
| `app/data.json` | 가상 예시 데이터(뷰 모델 형태) | 테스트 픽스처로 계속 사용 |
| `app/app.js`, `app/data.js` | 생성물(브라우저 실행용) | 소스 수정 시 반드시 재생성 |
| `app/build.py` | tsc 컴파일 → data.js → `../preview/AX_Project_Manager.html` | 출력이 `app/` 밖(`preview/`)에 생김 → Git 추적 여부 결정 필요 |
| `app/tests/*.test.cjs` | Node 내장 테스트 26개 | UI 회귀 기준선 |

- 외부 네트워크 호출 없음(fetch/XHR 미사용). localStorage는 테마 저장에만 사용.
- 빌드 전제: Node 20+, Python 3, TypeScript(`npm install` 필요, 네트워크 필요).

## 3. 보존해야 할 화면·동작 (L05 §유지할 동작 + 테스트 매핑)
| 보존 대상 | 기존 테스트 |
|---|---|
| 기본 테마 Linear 구조+Notion 색상, 6개 테마 전환 | "Linear with Notion palette…", "all five theme renderers…" |
| 주간 요약: 팀/개인 선택, 주 드롭다운·화살표, 월~일 KST | "Korean week…", "team summary has separate person selection…", "week change updates totals…" |
| 주간 시각화 = 업무 유형별·담당자별 **건수**(시간 아님) | "weekly visual distribution reconciles…" |
| 프로젝트 정렬 = 최근 **태스크 생성일** | "sort uses task creation…", "creation order respects… offsets" |
| 프로젝트 목록 내 펼침, 주제별/에피소드 보기, 에피소드 최신순 | "project opens inside list…", "episodes order…", "execution episodes share…" |
| 관련 자료: 주제별·최신순, 400px 스크롤, 보기 전환 시 위치 유지 | "source sorting…", "…source list persists across tabs" |
| 월 타임라인: 오늘선(demoAsOf), 월 경계 이전 시작 표시, 주간과 독립 | "timeline month…", "monthly timeline is independent…", "long-running example…" |
| 검토: 해당 태스크 판단 영역 이동, 완료/진행 중 재선택, 세션 한정 | "project review opens the exact work item…", "…review is session-only" |
| 설정: 연동 준비만, 연결된 척 하지 않음 | "settings exposes integration preparation…" |
| 프로젝트 유형·진척률·lifecycle 컨트롤 없음 | "no exclusive project phase…" |
| HTML 이스케이프 | "Airtable field and grouping controls render; HTML strings are escaped" |

**테스트로 검증되지 않는 것**: 실제 레이아웃·스크롤·반응형(데스크톱/태블릿/모바일 높이), `/` 검색·Esc·모달 포커스·브라우저 뒤로 가기의 실제 브라우저 동작, 테마 시각 품질.

## 4. UI 보존 검증 계획 (구현 단계 진입 시 Builder에 위임)
> 테스트 한계(`app/tests/ui.test.cjs`): DOM 이벤트를 등록하지 않는 VM에서 생성물 `app.js`·`data.js`를 실행한다. "자료 목록 유지"는 개수만 확인하고 실제 스크롤 위치는 확인하지 않는다. HTML 이스케이프는 `esc()` 한 사례만 확인한다.

1. **빌드 재현성 확인 (V1)**: `npm install` → `npm run typecheck` → `npm run build` → **빌드 후 26개 테스트 재실행**. 재컴파일한 `app.js`와 재생성 `data.js`가 이관본과 동등한지 diff. 차이가 있으면 어느 쪽이 기준인지 먼저 보고.
2. **기준 스냅샷 확보 (V2)**: 변경 전, 브라우저(Chromium 고정)·뷰포트 폭과 높이(1440×900, 834×1112, 390×844)·`demoAsOf`를 고정하고 6개 테마별로 캡처한다. 상태: 홈, 펼친 프로젝트(주제별/에피소드), 자료 목록 하단까지 스크롤, 빈 검색 결과, 검토 판단 영역, 설정, 이미지 미리보기. `http://127.0.0.1:8765`(개발 페이지)와 독립 HTML(`preview/`) **양쪽**에서 수집한다.
3. **키보드·탐색 체크리스트 (V3)**: `/` 검색, Esc 닫기, Tab/Shift+Tab 순서, Enter/Space 활성화, 주제 탭 화살표 이동, 각 대화상자의 진입 포커스·닫은 뒤 복귀·배경 포커스 차단, 브라우저 뒤로 가기, 보기 전환 시 자료 스크롤 위치 유지, 테마 변경 후 새로고침 유지. 개발 페이지와 독립 HTML 양쪽에서 확인.
4. **회귀 게이트**: 모든 UI 관련 PR은 26개 기존 테스트 통과 + V2 스냅샷 비교(의도한 변경만) + V3 체크리스트를 통과해야 병합 대상.
5. **데이터 교체 시**: 어댑터 출력이 `data.json`과 같은 형태를 만족하는지 계약 테스트 추가. 기존 픽스처 테스트는 그대로 유지.

### 뷰 모델 투영의 한계 (어댑터 계약에 반드시 포함)
현재 `Subtask.sourceId`는 **단일 문자열**, `SourceFile.taskId`는 **단일 태스크**다(`app/src/app.ts`). 운영 모델의 다대다(한 작업 내역에 여러 자료, 한 자료가 여러 업무를 지원)를 그대로 투영하면 누락되거나 복제된다. 복제가 집계에 섞이면 작업 건수가 부풀려진다.
- 작업 내역 건수는 **고유 WorkLog ID 기준**으로만 집계한다.
- 계약에 정할 표시 규칙: 여러 자료가 붙은 작업 내역, 여러 업무에 공유된 자료, 미연결 자료, 접근 불가·삭제 자료.
- 기존 UI로 표현할 수 없는 관계가 있으면 UI의 **최소 변경**(예: `sourceIds[]`) 여부를 별도로 결정한다(OD-04 하위).

## 5. 예상 변경 지점 (승인 후, 지금은 계획만)
| 변경 | 위치 | 보존 위험 |
|---|---|---|
| 데이터 소스 주입(정적 `AX_DATA` → 어댑터) | `app.ts` 초기화부, 신규 어댑터 모듈 | **중간**: 다대다 투영·집계 중복 위험(위 계약 필요) |
| `demoAsOf` → 실제 날짜(운영 모드에서만) | `app.ts`, `model.js` 호출부 | 테스트는 고정 날짜 유지 필요 |
| 검토 판단 영속화·"저장 성공/실패" 표시 구분 | 검토 영역 | 문구·상태 표시 추가, 판단 UX 유지 |
| 원본 상태(접근 불가·삭제) 배지 | 관련 자료 행 | 행 레이아웃 400px 목록 유지 |
| 공수 표시(OD-02 승인 시에만) | 주간 요약 오른쪽 | 기존 "건수" 의미와 혼동 금지 |

## 6. 결정 필요 (open-decisions.md 참조)
- OD-09 실행/배포 환경(독립 HTML 유지 / Apps Script·Sites / 별도 웹앱)
- OD-12 `preview/` 생성물과 `app.js`·`data.js` 생성물의 Git 추적 방식
