# 소스·실행·빌드

## 설치 없이 현재 UI 보기

[preview/AX_Project_Manager.html](../preview/AX_Project_Manager.html)을 Chrome 또는 Edge에서 엽니다. CSS·데이터·스크립트·이미지가 포함되어 있습니다. 기본 화면은 Linear 구조 + Notion 색상이며 내부에서 6개 테마를 선택할 수 있습니다.

## 수정 위치

| 파일 | 역할 |
|---|---|
| `app/src/app.ts` | 화면·문구·동작·검토 메모리 상태 |
| `app/styles.css` | 글씨·간격·테마·스크롤·반응형 |
| `app/src/model.js` | 주간·월간 계산·정렬·집계 |
| `app/src/icons.ts` | 자체 SVG 아이콘 |
| `app/data.json` | 원본 예시 데이터 |
| `app/assets/` | 예시 PNG 7개 |
| `app/index.html` | 개발용 진입 페이지 |
| `app/app.js`, `app/data.js` | 브라우저 실행에 필요한 생성 파일 |
| `app/build.py` | 컴파일·데이터 동기화·독립 HTML 생성 |
| `app/tests/` | Node 내장 테스트 |

## 개발 환경

Node.js 20 이상, Python 3, TypeScript가 필요합니다. `app/`에서 실행합니다.

```sh
npm install
npm run typecheck
npm test
npm run build
```

`npm install`에는 네트워크가 필요합니다. 기존 실행본을 보는 데는 설치가 필요 없습니다. 별도 컴파일러는 `python build.py --typescript PATH_TO_TYPESCRIPT_LIB_TSC_JS`로 지정할 수 있습니다.

CSS만 수정하고 app.js가 이미 최신일 때는 `python build.py --skip-compile`로 패키징할 수 있습니다. TypeScript 변경 시에는 컴파일을 생략하지 않습니다.

`npm run dev`는 `http://127.0.0.1:8765`에 개발 서버를 엽니다. 외부 데이터 연동 서버를 뜻하지 않습니다.

이 패키지의 빌드는 `preview/AX_Project_Manager.html` 한 개를 생성합니다. 원래 PC의 외부 폴더·개인 npm 캐시·Temp 파일에 의존하지 않습니다.
