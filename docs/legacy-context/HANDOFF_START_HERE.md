# AX 프로젝트 관리장 — 선별 인수인계 패키지

이 패키지는 **기존에 설정한 새 Paseo 3-agent 프로젝트 루트에 덮어쓰기 없이 추가**하도록 제작했습니다.

## 추가되는 항목
- `docs/legacy-context/00_SERVICE_INTENT.md` ~ `04_IMPLEMENTATION_STATUS.md`: **첫 실행에서 순서대로 읽는** 기획 기준 5개
- `docs/legacy-context/05_UI_SPEC.md`, `06_DEVELOPMENT.md`: **UI 이전 또는 실행 시에만 읽는** 참고 2개
- `app/`: UI 원본 소스, 정적 예제 데이터, SVG/이미지 자산, 실행용 생성 JS, 빌드 도구, 테스트 포함. 기존 UI를 보존하기 위해 통째로 이관
- `prompts/00-handoff-import.md`: 첫 세션에서 사용할 인수인계용 프롬프트

## 포함하지 않은 항목
- 과거 프로젝트 루트 `AGENTS.md`, 5-agent 운영 설정, MCP/Skills 설정: **새 프로젝트의 설정과 충돌 방지**
- `.21st/`, `references/`, `FILE_MANIFEST.json`: 최초 이관에 필수 아님
- `preview/AX_Project_Manager.html`: 원본 UI의 중복 생성본. 필요한 경우 `app/`에서 빌드로 재생성
- 원본 `README_FIRST.md`, `docs/07_SERVICE_SCENARIOS.md`, `08_PACKAGE_VALIDATION.md`: 최초 인계에 필수 아님. 필요하면 원본 ZIP을 별도로 참조

## 적용
1. **기존 프로젝트에 이미 같은 경로의 `app/` 또는 `docs/legacy-context/`가 있는지 확인**합니다. 있으면 무작정 덮어쓰지 마세요.
2. 이 ZIP의 **내용물**을 `ax-project-manager/` 루트에 압축 해제합니다. `CLAUDE.md`, `AGENTS.md`, `.claude/`, `.agents/`는 포함하지 않으므로 유지됩니다.
3. Paseo에서 `AX-Lead`(Claude Code)와 `ax-project-manager` 작업 경로를 선택합니다.
4. `prompts/00-handoff-import.md` 내용을 첫 메시지로 사용하세요. 기존 `prompts/01-first-prompt.md`보다 **먼저** 실행합니다.
5. 기획·이전 계획을 승인한 후에만 Builder가 실제 UI를 수정하거나 이관·연동을 진행합니다.

## UI 구동 참고
- 소스 변경 시 `app/src/app.ts`, `app/styles.css`, `app/data.json`, `app/src/model.js` 등을 사용합니다.
- `app/`에서 `npm install`, `npm run typecheck`, `npm test`, `npm run build`를 사용할 수 있습니다(네트워크·Node.js·Python 필요).
- UI 파일은 원본 ZIP에서 그대로 추출했습니다. 단 `app/README.md`의 문서 링크만 새 위치에 맞춰 갱신했습니다.
- 동작 검증 결과는 예전 패키지의 시점에 관한 것이므로 새 환경에서 재검증해야 합니다.
