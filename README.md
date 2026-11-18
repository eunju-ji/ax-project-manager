# AX 프로젝트 관리장 — Paseo 3-Agent Starter

## 구성
- `AX-Lead` (Claude Code): 기획·통합·조율, Medium 또는 High(복잡한 결정만).
- `AX-Builder` (Codex): 승인된 구현·테스트, Medium.
- `AX-Reviewer` (Codex): 읽기 전용 독립 검토, Medium.

별도 Architect/Planner 프로필 없음. Lead가 기획과 시스템 설계를 맡는다. 필요 시 Reviewer 의견 1회.

## 설정 (Paseo)
1. Claude Code/Codex CLI 로그인 확인: `claude --version`, `codex --version`.
2. Paseo Settings → host → Agents → Enable Paseo tools 활성화, **새 세션 시작 또는 reload**.
3. Settings → host → Agents → Agent profiles에 정확히 3개 프로필 생성 (설정은 `docs/07-agent-profiles.md`).
4. Orchestration skills에서 `/paseo-handoff`, `/paseo-advisor` 설치. `/paseo-committee`는 선택 사항. 또는 `npx skills add getpaseo/paseo`.
5. 프로젝트 폴더 열고 AX-Lead로 `prompts/01-first-prompt.md` 실행.
6. 기획 승인 후 `prompts/03-approved-build.md`; 새 세션은 `prompts/02-resume.md`.

## Context / Auto-compaction
- Auto-compaction은 Paseo Skills가 아닌 **Claude Code 및 Codex CLI의 내장 기능**이다.
- Claude Code: `/config`에서 Auto-compact ON 확인; `/context`로 사용량 확인; 필요 시 `/compact`.
- Codex: 자체 자동 압축 정책 적용, 모델/CLI 설정에 따름.
- 이 스타터는 압축을 대신 구현하지 않는다. 압축으로 소실될 수 있는 결정·진행상태는 `tasks/current-state.md`, `docs/decisions/`에 보존.
- 자동 압축 시 파일 저장 직전 이벤트가 보장되지는 않는다. 주요 단계 완료마다 상태를 기록.

## 첫 목표
실제 GWS에 접근하지 않고 제품 기획 초안 → 독립 검토 → 승인 필요 결정사항까지 작성.

## 주의
프로필은 기존 세션에 소급 적용되지 않으므로 새 세션에서 선택해야 한다. 회사 자료/API 접근 권한은 별도로 승인받는다.
