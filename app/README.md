# 현재 UI 소스

Workers 로컬 연결부는 [Workers README](workers/README.md)를 참고한다. 저장소 계약은 비동기 API이며 SQL은 SQLite·D1·PostgreSQL 공통 표준을 우선한다. D1과 실데이터 이전은 후속 3단계다.

공개 사이트 인증·권한·수집 연결과 컨테이너 준비는 [배포 절차서](../docs/runbooks/deploy.md)를 따른다. `AUTH_MODE=off`는 루프백 주소에서만 실행하고, `oidc`는 필수 환경 변수를 검증한 뒤 시작한다. 운영 데이터는 `DATA_DIR`에서 별도로 준비하며 예시 모드는 제공하지 않는다. 인증 테스트는 모의 IdP와 합성 데이터만 사용한다.

[서비스 목적](../docs/legacy-context/00_SERVICE_INTENT.md), [데이터 원칙](../docs/legacy-context/02_DATA_AND_EVIDENCE.md), [미해결 질문](../docs/legacy-context/03_OPEN_QUESTIONS.md)을 먼저 확인합니다. 이 앱은 서비스 전체가 아니라 현재 UI 프로토타입입니다.

실행은 [개발 서버](http://127.0.0.1:8765), 수정 위치와 명령은 [개발 안내](../docs/legacy-context/06_DEVELOPMENT.md), 화면 기준은 [UI 기준](../docs/legacy-context/05_UI_SPEC.md)을 따릅니다.

`data.json`에서 데이터·`src/app.ts`에서 동작·`styles.css`에서 디자인을 수정하고 빌드로 HTML을 갱신합니다. 생성된 `app.js`와 `data.js`는 개발용 실행에 필요하므로 포함합니다. `npm run build`를 실행하면 `preview/AX_Project_Manager.html`이 생성됩니다.
