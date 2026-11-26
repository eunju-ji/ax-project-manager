# UI 기준선 검증

`app/`에서 실행한다. Node, Python 3(`build.py` 실행용), npm 패키지와 Chromium 설치가 필요하다.

```sh
npm ci
npx playwright install chromium
npm run typecheck
npm run build
npm test
npm run test:visual
npm run test:navigation
```

Windows PowerShell에서 npm 스크립트 실행 정책이 제한되면 `npm.cmd`, `npx.cmd`를 사용한다. Python이 PATH에 없으면 설치된 Python 디렉터리를 현재 셸 PATH에 추가한다.

검증 도구는 자체 Node HTTP 서버로 개발 페이지를 `http://127.0.0.1:8765/`에 제공한다. 미리 켠 개발 서버는 종료한다(포트 충돌 시 실패). 독립 HTML은 build.py가 생성한 `preview/AX_Project_Manager.html`을 `file://`로 연다. 실제 계정이나 외부 서비스는 사용하지 않는다.

- `capture:visual`: 개발 페이지 PNG 45장을 `baseline/`에 생성/교체한다. 의도한 UI 변경을 검토하고 승인한 경우에만 사용한다.
- `test:visual`: 기준선을 수정하지 않고 현재 개발 페이지와 비교한다. 같은 상태의 독립 HTML도 메모리에서 픽셀 비교하고 폐기한다. pixelmatch 색상 임계값은 0.01, includeAA=true이며 임계값을 넘는 픽셀이 1개라도 있으면 실패한다. 누락된 기준선, 브라우저 오류, 이미지 decode 실패도 실패로 처리한다. 1단계 RGB 채널 반올림 오차를 허용하는 이유는 결과 보고서에 기록했다.
- `test:navigation`: 개발/독립 HTML의 키보드·탐색 동작을 자동 측정한다. 실패 시 0이 아닌 종료 코드를 반환한다. 전체 결과는 `test-results/navigation.json`에 저장한다.

기준 환경: Windows, Playwright 1.65.1(잠금 파일), Chromium 159.0.8154.6, DPR 1, ko-KR, Asia/Seoul, demoAsOf=2026-11-17, reducedMotion=reduce. 날짜는 픽스처와 실행 페이지 모두 assertion으로 고정한다. CSS 애니메이션·전환·커서는 캡처 시 비활성화한다. 각 상태는 새 브라우저 컨텍스트에서 UI 클릭으로 구성한다. 현재 화면 뷰포트를 캡처하며 전체 문서 캡처가 아니다. 폰트 및 OS가 달라지면 픽셀 차이가 생길 수 있으므로 같은 환경에서 비교한다.

뷰포트는 1440×900, 834×1112, 390×844. 기본 테마는 홈/펼친 프로젝트(주제별)/에피소드/자료 하단/빈 검색/검토 판단/설정/이미지 미리보기 각 1장, 다른 3개 테마는 홈/펼친 프로젝트 각 1장이다. 프로젝트는 목록의 첫 항목을 클릭한다. 자료 목록 하단은 scrollTop>0과 최댓값 도달을 검증한다.

원시 결과·실패 캡처는 무시되는 `test-results/`에 저장한다. M0-04의 V3 자동 점검은 양쪽 실행본에서 88개 항목을 검사한다. 기존 38개에 저장값 없음·무효·접근 불가, 모달의 건너뛰기 링크 차단·검색 단축키 격리·키보드 닫기·정확한 런처 복귀, summary·select·담당자 컨트롤 활성화 및 포커스 유지 검사를 더했다. 4개 테마 × 3개 뷰포트에서는 주간 내역과 첫 프로젝트·첫 태스크를 펼친 상태로 전체 Tab/Shift+Tab DOM 순서, 누락 없는 컨트롤 도달, 포커스 윤곽선과 뷰포트 교차를 검사한다. Chromium의 자동 스크롤 영역 포커스도 포함한다.

자동 검사는 모든 데이터 조합·모든 버튼의 상태 전이를 포괄하지 않는다. 시각적 순서의 자연스러움, 윤곽선의 대비·다른 요소에 의한 가림, 모바일 실기기·스크린리더 안내는 수동 확인이 남아 있다. M0-04에서 수정한 UI 결함과 시각 보존 결과는 `docs/migration/m0-baseline-report.md`에 기록한다. 비교 실행은 기준 PNG 및 비교 허용치를 변경하지 않는다.


m7: 테마는 Linear, Linear · Notion 색상, 2안 · 현황 → 이번 주, 3안 · 사람별 리소스 4개다. 삭제된 테마 기준 24장을 제거하고 새 두 테마의 홈·프로젝트(3개 폭) 12장을 포함한다. 네 테마 전환·삭제 저장값 복구·2안 카드에서 간트 이동·주간 표 및 리소스 카드 드로어·접힘 영역·주 이동·담당자 선택·모바일 넘침을 검사한다. 합성 real-mode API 응답으로 viewer 표시도 확인한다.
