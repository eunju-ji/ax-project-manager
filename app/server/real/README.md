# 업무 색인 수집기

`collect-github.cjs`와 `collect-ai-chats.cjs`는 제목·시각·링크 등의 색인만 생성한다. 본문·diff·댓글은 출력하지 않는다. 사용 명령과 설정은 `docs/runbooks/real-delta-format.md`를 참고한다.

AI 내보내기는 압축 해제한 `<imports>/claude/conversations.json` 및 `<imports>/chatgpt/conversations.json`만 지원한다. ZIP 파일을 직접 읽지 않는다. Claude Code는 `--claude-code-dir`로 지정한 디렉터리만 탐색하며, 생략 시 `~/.claude/projects`를 사용한다.

테스트는 임시 디렉터리의 합성 세션과 주입한 fetch를 사용한다. 실제 계정·개인 기록은 승인 없이 읽지 않는다.

Codex는 `--codex-dir <세션 폴더>`로 지정하며 기본값은 `~/.codex/sessions`다. 연/월/일 하위 `*.jsonl`을 재귀 탐색하고 손상된 줄은 건너뛴다. `--project-filter <부분 문자열,...>`는 Claude Code의 프로젝트 폴더명과 Codex의 cwd에 적용한다. 두 소스 모두 `work_dir`는 cwd의 마지막 폴더명이다. Codex는 세션 ID·작업 폴더·시작/종료 시각·한국 시간 활동일·사용자 메시지 수·최대 20개 수정 파일 상대경로만 남긴다. 메시지 본문·명령 출력·패치 내용은 저장하지 않고, 파일 경로는 apply_patch 입력의 헤더에서만 추출한다. 사용자 메시지 이벤트와 응답이 중복되면 응답 기록 수를 사용한다. 알 수 없는 필드 형식은 추측하여 저장하지 않는다.

```sh
node server/real/collect-ai-chats.cjs --claude-code-dir <claude-projects> --codex-dir <codex-sessions> --project-filter <workspace,...> --out <index.json> --since <ISO>
node server/real/collect-local-git.cjs --repos <path,...> --out <index.json> --since <ISO> --author <email-or-name>
```

로컬 Git 수집기는 지정한 저장소만 execFile로 읽는다(셸·네트워크 호출 없음). `--since`·`--author`는 선택 사항이다. 모든 브랜치에서 병합 커밋을 제외하고 SHA·첫 줄 제목(160자)·시각·변경 파일 수를 남긴다. `branch`는 커밋을 포함하는 현재 브랜치 중 하나이며 당시 작업 브랜치를 보장하지 않는다. 원격이 있으면 origin을 우선 사용하며 `remote`는 호스트/경로만 남겨 사용자 정보·쿼리·프래그먼트를 제거한다. 로컬 파일 원격 경로는 남기지 않는다. 파일 목록·diff·명령 출력은 저장하지 않고 오류는 코드만 기록한다. 결과는 `{collected_at, items, errors}`이며 오류가 있으면 CLI 종료 코드는 1이다.

판별은 ADR-021을 따른다. 작업 폴더와 저장소는 작업 공간 신호이며 프로젝트 자체가 아니다. 같은 목표의 공간은 `state.projects_map`으로 같은 프로젝트에 대응시킨다. 전용 공간·목표 문서·여러 날의 작업·회의 과제·계획 문서 중 두 가지 이상이 같은 목표를 가리키면 WBS가 없어도 새 프로젝트로 판별한다. 수집기는 색인만 생성하며 프로젝트·태스크 완료·공수를 자동 확정하지 않는다.
