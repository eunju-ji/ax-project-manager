# 업무 색인 수집기

`collect-github.cjs`와 `collect-ai-chats.cjs`는 제목·시각·링크 등의 색인만 생성한다. 본문·diff·댓글은 출력하지 않는다. 사용 명령과 설정은 `docs/runbooks/real-delta-format.md`를 참고한다.

AI 내보내기는 압축 해제한 `<imports>/claude/conversations.json` 및 `<imports>/chatgpt/conversations.json`만 지원한다. ZIP 파일을 직접 읽지 않는다. Claude Code는 `--claude-code-dir`로 지정한 디렉터리만 탐색하며, 생략 시 `~/.claude/projects`를 사용한다.

테스트는 임시 디렉터리의 합성 세션과 주입한 fetch를 사용한다. 실제 계정·개인 기록은 승인 없이 읽지 않는다.
