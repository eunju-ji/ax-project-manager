---
name: ax-review-gate
description: 변경 결과 검증: acceptance criteria, 테스트, 보안, 범위 변경, 문서 상태를 확인하고 pass/fail/blocker를 반환한다.
---

# ax-review-gate

변경 결과 검증: acceptance criteria, 테스트, 보안, 범위 변경, 문서 상태를 확인하고 pass/fail/blocker를 반환한다.

1. 해당 태스크와 관련된 소수 문서만 읽는다.
2. 확인된 근거와 가정을 구분한다.
3. 결과는 요약/근거/리스크/결정 요청 순으로 기록한다.
4. 다른 에이전트에게 자동 재위임하지 않는다.
