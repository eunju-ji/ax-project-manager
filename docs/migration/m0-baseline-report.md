# M0 UI 기준선 검증 결과

- 일자/역할: 2026-11-19, AX-Builder
- 브랜치: `chore/ui-baseline-verification`
- 범위: M0-01~03, 기존 UI 보존. 검증 도구·패키지 잠금·개발 페이지 기준 PNG 54장·문서만 추가. Commit/Push 없음.
- 판정: V1·V2 통과. V3는 기존 실패 4종을 개발/독립 HTML 양쪽에서 확인했다. UI 회귀 게이트 전체 통과로 판정하지 않는다. Lead의 완료 검토와 실패 처리 결정이 남아 있다.

## 실행 환경 및 명령

Windows / Node v26.13.0 / npm 11.20.0 / TypeScript 5.9.3 / Playwright 1.65.1 / Chromium 159.0.8154.6. 설치 버전은 `app/package-lock.json`으로 고정한다. 브라우저는 Playwright 전용 프로필이며 실제 계정·실데이터 접근은 하지 않았다.

`app/`에서 다음 명령을 실행했다. 현재 Windows 셸은 npm.ps1 실행 정책 때문에 `npm.cmd`를 사용한다.

```powershell
# Python은 PATH에 없어 기존 Codex 런타임 디렉터리를 현재 셸에서만 추가
$env:PATH = 'C:\Users\EunjuJi\.cache\codex-runtimes\codex-primary-runtime\dependencies\python;' + $env:PATH
npm.cmd install
npm.cmd run typecheck
npm.cmd run build
npm.cmd test
npm.cmd install --save-dev --save-exact @playwright/test pngjs pixelmatch
npx.cmd playwright install chromium
npm.cmd run capture:visual
npm.cmd run test:visual
npm.cmd run test:navigation
```

처음 sandbox 내 npm 설치는 EACCES로 실패했다. 네트워크 설치 권한으로 npm.cmd를 사용한 후 성공했다. 패키지 설치 출력은 `added 1 package`, 이후 `added 5 packages`, `found 0 vulnerabilities`였다. Python은 새로 설치하지 않았다. 앱 실행용 외부 서비스는 사용하지 않았다.

## V1 — M0-01 빌드 재현

| 명령 | 실제 결과 |
|---|---|
| `npm.cmd run typecheck` | 오류 출력 없이 성공 |
| `npm.cmd run build` | 성공, `Offline preview: ...\preview\AX_Project_Manager.html` 생성 |
| 빌드 후 `npm.cmd test` | tests 26 / pass 26 / fail 0 / skipped 0 |

빌드 전 `app.js`, `data.js`를 무시되는 `.cache/m0/`에 바이트 그대로 백업했다. 재생성본과 Buffer 비교 및 CRLF→LF 정규화 비교를 각각 수행했다.

| 생성물 | 원본/재생성 크기 | 바이트 동일 | 줄바꿈 정규화 동일 | SHA-256 |
|---|---:|---|---|---|
| app.js | 45,922 / 45,922 | 예 | 예 | `70a9e43ef3b58cc1334e95755c67bed57b801502a9214a0f6bcdd10bb5af6ad8` |
| data.js | 45,913 / 45,913 | 예 | 예 | `a4964dd72b72a4c3e7826fbd5945ee722e8cd91e38aa4daf00ec2e7ae1efc379` |

내용 차이와 줄바꿈 차이 모두 없다. 원본을 대체하는 내용 변경이 없으며 ADR-009 생성물 동기 조건을 충족한다.

## V2 — M0-02 시각 기준선

개발 페이지는 도구가 소유한 로컬 HTTP 서버 `http://127.0.0.1:8765/`, 독립 HTML은 `file:///.../preview/AX_Project_Manager.html`에서 비교했다. 기존 Python dev 서버와 동일한 파일을 제공하며 실행 시 Python은 필요하지 않다. 포트 충돌은 즉시 실패한다. 독립 HTML 캡처는 메모리에서 비교하고 저장하지 않는다.

고정 조건: DPR 1 / ko-KR / Asia/Seoul / demoAsOf=2026-11-17(assertion) / reducedMotion=reduce / CSS animation·transition 비활성화 / caret 숨김. 폰트와 이미지 decode 및 두 프레임을 기다린 후 캡처한다. 테마·프로젝트·상태는 실제 UI 클릭으로 구성하고 각 캡처마다 새 컨텍스트를 만든다. 외부 HTTP 요청은 차단한다.

기준 이미지 경로: `app/tests/visual/baseline/{theme}-{width}x{height}-{state}.png`. 전체 54개 파일명과 SHA-256은 같은 폴더 `manifest.json`에 기록했다.

| 테마 | 상태 | 뷰포트 | 장수 |
|---|---|---|---:|
| linear-notion | home, project(주제별), episode, sources-bottom, empty, review, settings, image | 1440×900 / 834×1112 / 390×844 | 24 |
| linear | home, project | 동일 3종 | 6 |
| notion | home, project | 동일 3종 | 6 |
| attio | home, project | 동일 3종 | 6 |
| airtable | home, project | 동일 3종 | 6 |
| clickup | home, project | 동일 3종 | 6 |

프로젝트는 정렬된 목록의 첫 프로젝트(AX 프로젝트 관리장)를 사용한다. 자료 하단은 `scrollTop>0` 및 `scrollHeight-clientHeight` 도달을 검사한다. 검토 화면은 검토함의 첫 요청에서 해당 태스크 판단 영역으로 이동한다. 캡처는 문서 전체가 아닌 고정 뷰포트다.

- 최초 생성: `checks:54, failures:0, errors:0`. 개발/독립 HTML 54쌍 모두 색상 임계값 0에서 차이 0픽셀이었다.
- 최초 읽기 전용 재비교: 53쌍 통과, Notion 태블릿 홈에서 2픽셀 색상 반올림 차이로 실패. 좌표 (418,863): RGB (245,244,243)→(245,245,243), (419,863): (245,244,244)→(244,244,243). 레이아웃 차이는 아니다.
- 이 증거를 바탕으로 pixelmatch 색상 임계값을 0.01로 설정했다. includeAA=true이며 차이 픽셀 개수 허용량은 0이다. 기준 PNG는 재생성하지 않았다. 임계값은 비지각 수준의 채널 반올림을 허용하며 작은 색상 변화는 검출되지 않을 수 있다.
- 최종 `test:visual` 재비교: 54/54 완료, `errors:[]`. 모든 이미지의 baselinePixels=0 / offlinePixels=0. 결과 JSON을 별도 명령으로도 검증해 종료 코드 0을 확인했다.

수동 이미지 확인은 데스크톱 펼친 프로젝트, 모바일 홈, 태블릿 설정, 모바일 이미지 미리보기 4장에 한정했다. 54장 전체의 디자인 품질을 수동 승인한 것은 아니다. 모바일 홈에서는 고정 테마 선택 버튼이 하단 요약 영역 일부를 덮는 기존 배치가 보인다. 후속 디자인 검토 대상으로 남긴다.

## V3 — M0-03 키보드·탐색

`npm.cmd run test:navigation` 실제 출력: `checks:38, failures:8, errors:0`, 종료 코드 1. 1440×900 Chromium에서 자동 점검했으며 개발 페이지와 독립 HTML 각각 19개 시나리오다. 아래 통과는 명시한 시험 범위에 한정한다. 전체 화면의 모든 컨트롤에 대한 접근성 인증을 의미하지 않는다.

| 자동 점검 | 개발 | 독립 HTML | 근거/범위 |
|---|---|---|---|
| `/` 검색 포커스 | 통과 | 통과 | #homeSearch가 activeElement |
| Tab/Shift+Tab 홈 순서 | 통과 | 통과 | 브랜드→검토함→설정→Shift+Tab 검토함 |
| Enter/Space 활성화 | 통과 | 통과 | 설정 버튼에 Enter, Esc 후 Space로 재개방 |
| 설정 진입 포커스 | 통과 | 통과 | 대화상자 내부에 포커스 |
| 설정 Esc·복귀 | 통과 | 통과 | 닫힘 및 설정 버튼 포커스 |
| 설정 배경 차단·Tab 순환 | 통과 | 통과 | 배경 브랜드에 focus 불가, 마지막→첫 버튼 Tab 및 역방향 |
| 검토함 진입 포커스 | 통과 | 통과 | 대화상자 내부에 포커스 |
| 검토함 Esc·복귀 | 통과 | 통과 | 닫힘 및 검토 버튼 포커스 |
| 검토함 배경 차단·Tab 순환 | 통과 | 통과 | 배경 focus 불가, 양방향 순환 |
| 이미지 진입 포커스 | 통과 | 통과 | 대화상자 내부에 포커스 |
| 이미지 Esc·복귀 | 통과 | 통과 | 닫힘 및 원래 첫 자료 버튼 포커스 |
| 이미지 배경 차단·Tab 순환 | 통과 | 통과 | 배경 focus 불가, 양방향 순환 |
| 테마 선택 진입 포커스 | 실패 | 실패 | role=dialog 내부로 이동하지 않고 런처에 남음 |
| 테마 선택 Esc·복귀 | 실패 | 실패 | 창은 닫히지만 런처에 포커스 복귀 안 됨 |
| 테마 선택 배경 차단·Tab 순환 | 실패 | 실패 | 배경 브랜드 버튼 focus 가능; 첫 assertion 실패로 이후 순환 검사는 미실행 |
| 주제 탭 좌/우 화살표 | 통과 | 통과 | 우측 에피소드 탭 포커스·내용, 좌측 주제 탭 복귀 |
| 브라우저 뒤로 가기 | 통과 | 통과 | 홈→프로젝트 펼침→goBack 후 상세 닫힘 |
| 보기 전환 시 자료 스크롤 유지 | 통과 | 통과 | scrollTop=1670, 에피소드→주제별 모두 동일 |
| 테마 변경 후 새로고침 유지 | 실패 | 실패 | notion 선택 및 ax_theme=notion 저장 확인, reload 후 body data-theme=linear로 복귀 |

원인 분석(읽기 전용): `src/app.ts` init에서 `data-initial-theme || localStorage.getItem('ax_theme')` 순서로 읽는다. 두 HTML 모두 data-initial-theme=linear-notion이 있어 저장된 값을 덮는다. 테마 선택창은 role=dialog지만 aria-modal이 없고, render의 inert 처리·Tab trap 대상은 settings/reviews/file뿐이다. 테마 런처는 returnFocus를 설정하지 않는다. 모달로 바꿀지 비모달 선택기로 유지할지는 후속 UI 범위에서 결정해야 한다. 이 태스크에서는 소스를 수정하지 않았다.

수동 체크리스트(자동 결과와 구분):

| 수동 항목 | 개발 | 독립 HTML | 후속 확인 방법 |
|---|---|---|---|
| 전체 화면 Tab/Shift+Tab 순서의 시각적 자연스러움 | 미검증 | 미검증 | 필터·타임라인·자료·태스크 전체를 키보드 순회 |
| 모든 버튼·select·summary의 Enter/Space 동작 | 미검증 | 미검증 | 자동 점검은 설정 버튼만 포함, 나머지 컨트롤 순회 |
| 6개 테마·모바일/태블릿에서 포커스 가시성·순서 | 미검증 | 미검증 | 각 뷰포트/테마에서 키보드 탐색 |
| 화면낭독기 대화상자·탭 안내 | 미검증 | 미검증 | NVDA 등으로 별도 확인 |

## 보존 확인·남은 문제·인계

`git diff --stat -- app/src/ app/styles.css app/data.json app/index.html app/assets/` 출력 없음. `app/app.js`, `app/data.js`도 내용 diff가 없다. 기존 테스트 파일 및 build.py 변경 없음. `npm test`는 기존 Node 테스트만 실행하며 브라우저 의존성을 요구하지 않는다.

추가/변경 파일: `.gitignore`, `app/package.json`, `app/package-lock.json`, `app/tests/visual/run.mjs`, `app/tests/visual/README.md`, `app/tests/visual/baseline/` PNG 54장 및 manifest, 이 보고서, `tasks/current-state.md`의 M0 결과 항목. node_modules·preview·test-results·playwright-report·.cache는 Git 제외다.

작업 시작 전부터 있던 AGENTS.md·CLAUDE.md·paseo.json 변경과 Lead의 병행 상태 갱신은 보존했다. 전체 `git diff --check`는 기존 CLAUDE.md EOF 빈 줄을 보고하며, 이 태스크 변경 파일의 whitespace 점검은 통과했다.

남은 문제: 테마 선택 포커스 3종·새로고침 유지 1종, 수동 체크리스트, 다른 OS/폰트에서 픽셀 재현성. 검증 도구 색상 임계값 변경 후 재시도는 1회이며 UI 수정·재시도는 0회다. 다음은 AX-Lead의 결과 검토 및 별도 결함 수정 범위 결정이다. M0 기준선 확보와 V3 결함 수정 완료를 구분해야 한다.

## M0-04 수정 결과

2026-11-19, AX-Builder. 위 M0-01~03 절은 수정 전 기록이다. 사용자 승인 범위는 디자인을 바꾸지 않는 V3 동작·접근성 결함 수정이다. 동일 브랜치 `chore/ui-baseline-verification`에서 작업했으며 Commit·Push·추가 에이전트 호출·외부 서비스·실데이터 접근은 없었다. Builder 검증 완료이며 Lead의 완료 검토는 별도다.

### 원인과 변경

| 결함/원인 | 수정 |
|---|---|
| HTML의 initialTheme가 저장값을 가림 | 유효한 ax_theme를 우선 사용. 값이 없거나 무효이거나 저장소 접근이 실패하면 linear-notion 기본값 유지 |
| 테마 선택 창이 기존 모달의 포커스 처리에서 누락 | aria-modal 지정, 첫 선택지 포커스, 공통 Tab/Shift+Tab 순환 및 Esc 닫기 재사용. 선택·Esc·창 바깥 클릭으로 닫을 때 런처 복귀 |
| 모달 배경 차단에 건너뛰기 링크가 빠짐 | 기존 inert 처리를 건너뛰기 링크까지 확장. 테마 창에서도 헤더·본문·런처를 inert 처리. 기존 overlay-open 여부는 유지하여 스크롤바·레이아웃 보존 |
| 모달 중 / 검색 단축키가 배경 검색을 시도 | 모달/테마 창이 열려 있으면 검색 단축키를 적용하지 않음 |
| 이미지 닫기 시 action/id만으로 첫 자료 버튼에 복귀 | 원래 버튼의 태그·클래스·data 속성을 일치시켜 두 번째 자료 등 정확한 런처로 복귀 |
| 담당자 필터·Airtable 보기/필드/그룹 동작이 전체 재렌더 후 포커스를 잃음 | 해당 컨트롤에 포커스 복원 |
| 검색 입력의 outline:0이 공통 키보드 포커스 윤곽선을 덮음 | Tab 또는 / 입력 시에만 적용하는 검색 focus-visible 규칙 1개 추가, pointerdown 시 표시 모드 해제 |

CSS 변경은 마지막 결함에 한정한 예외다. 레이아웃·색상 토큰·글꼴·간격·문구·테마 팔레트는 변경하지 않았다. 포커스 윤곽선은 기존 accent/2px 규칙을 재사용하며 일반 마우스 화면에는 나타나지 않는다. `app/data.json`, `app/data.js`, `app/assets/`, `app/index.html`, 기존 26개 테스트, 기준 PNG/manifest 및 픽셀 비교 임계값은 변경하지 않았다. `app.js`와 독립 HTML은 최종 소스로 빌드했다.

### 자동 검사 확장과 실제 결과

기존 38개에 50개를 추가하여 양쪽 실행본 합계 88개다. 저장값 없음·무효·저장소 접근 불가, 네 종류 모달의 건너뛰기 링크 차단·검색 단축키 격리·Enter로 열기·Space로 닫기/선택·정확한 복귀, summary/select/담당자 및 Airtable 컨트롤의 활성화·포커스 유지를 검사했다. `/` 진입 시 검색 포커스 윤곽선과 마우스 입력 후 키보드 표시 모드 해제도 확인했다.

6개 테마 × 3개 뷰포트 × 양쪽 실행본에서는 주간 내역과 첫 프로젝트·첫 태스크를 펼친 상태로 전체 Tab/Shift+Tab을 순회했다. 테마에 따라 95~103개 명시적 컨트롤의 누락 없는 도달, DOM 정·역순, 윤곽선과 뷰포트 교차를 검사했다. Chromium이 tabindex 없이 자동 포커스하는 스크롤 영역도 순서에 포함한다. 초기 확장 테스트가 이 브라우저 동작을 누락한 부분은 기대 순서를 보완했다.

수정 전 재현 출력은 `checks:38, failures:8, errors:0`, exit 1이었다. 소스 수정·재검증은 3회 이내로 마쳤다. 1차 수정 후 확장 순회에서 검색 포커스 표시 결함을 발견했고, 2차에서 88/88 통과, 3차에서 / 진입과 마우스 전환까지 보강해 최종 빌드로 아래 명령을 다시 확인했다.

| 명령 | 최종 실제 출력 | 종료 코드 |
|---|---|---:|
| npm.cmd run typecheck | tsc 오류 출력 없음 | 0 |
| npm.cmd run build | Offline preview: C:\Users\EunjuJi\Projects\ax-project-manager\preview\AX_Project_Manager.html | 0 |
| npm.cmd test | tests 26 / suites 0 / pass 26 / fail 0 / cancelled 0 / skipped 0 / todo 0 | 0 |
| npm.cmd run test:navigation | {"checks":88,"failures":0,"errors":0} | 0 |
| npm.cmd run test:visual | {"checks":54,"failures":0,"errors":0} | 0 |

시각 비교 54개 모두 `baselinePixels=0`, `offlinePixels=0`이다. 기준선 재생성 명령은 실행하지 않았으며 기준 PNG 54개의 manifest SHA-256 불일치도 0이다. 최종 JSON은 `app/test-results/navigation.json`, `visual.json`, 실제 브라우저 검사 stdout은 같은 폴더 `m0-04-navigation-final.log`, `m0-04-visual-final.log`에 보존했다(Git 제외).

### 변경 파일과 남은 확인

이번 수정 파일은 `app/src/app.ts`, 생성물 `app/app.js`, `app/styles.css`, `app/tests/visual/run.mjs`, `app/tests/visual/README.md`, 이 보고서, `tasks/current-state.md`, `tasks/backlog.md`의 M0-04 행이다. 기존 미커밋 변경과 Lead의 병행 문서 작업은 보존했다.

마지막 확인 시 전체 `git diff --stat` 출력은 아래와 같다. 기존 변경·병행 작업을 포함한 작업 트리 스냅샷이며, Git 미추적 상태인 탐색 도구·보고서·기준 이미지 등은 이 출력에 포함되지 않는다.

```text
 .gitignore                  |  2 ++
 AGENTS.md                   | 77 +++++++++++++++++++++++++++++++++++++++++++++
 CLAUDE.md                   | 17 ++++++++++
 app/app.js                  | 37 +++++++++++++---------
 app/package.json            | 12 +++++--
 app/src/app.ts              | 37 +++++++++++++---------
 app/styles.css              |  3 ++
 docs/02-decisions-needed.md |  2 +-
 docs/decisions/README.md    |  4 ++-
 tasks/backlog.md            | 16 +++++-----
 tasks/current-state.md      | 36 ++++++++++++++++++++-
 11 files changed, 203 insertions(+), 40 deletions(-)
```

수정 소스·생성물·CSS·작업 상태 문서의 `git diff --check`는 통과했다. `app/data.json`, `app/data.js`, `app/assets/` 및 기존 테스트의 diff는 없다.

검증 범위 내 미해결 오류는 없다. 자동 DOM 순서 검사는 시각적 순서의 자연스러움·윤곽선 대비·다른 요소에 의한 가림을 판정하지 않는다. 모든 버튼의 모든 데이터/상태 조합, 모바일 실기기·보조기기, NVDA 등의 실제 안내는 미검증이다. 앞 절의 수동 체크리스트를 전부 통과 처리하지 않는다. 다음 작업은 Lead 검토 후 M1-05다.
