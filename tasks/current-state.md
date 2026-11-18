# 현재 상태 (세션 간 인수인계)

- Phase: Design/Build 착수: ADR-001~010 승인 완료, M0(UI 기준선) 진행, 게이트 G0
- 데이터 접근: 승인 전 실제 GWS/개인 대화 접근 금지
- 브랜치: `docs/legacy-migration-baseline` (이관 + 기획 기준선 + ADR)

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
- 다음: M0-01~03을 AX-Builder에 위임(브랜치 `chore/ui-baseline-verification`)

## 갱신 형식
- 시각/단계:
- 완료한 일/확인 근거:
- 열린 이슈:
- 수정한 파일/테스트 결과:
- 다음 실행 태스크:
- 승인 요청:
