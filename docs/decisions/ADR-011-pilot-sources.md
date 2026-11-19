# ADR-011 파일럿 연동 소스: Drive + GitHub

- 상태: 승인 (2026-11-19) · 출처: OD-05, D-05 · 근거: `docs/research/m1-04-integration-research.md`
- 결정: 파일럿 연동 소스는 Google Drive와 GitHub 두 가지로 한다. Calendar는 3순위 후보로 두고, Chat은 후속으로 미룬다.
- 이유: 문서 활동과 개발 활동이라는 서로 다른 근거를 시험할 수 있고, GitHub의 명시적 태스크 ID 참조로 판별 규칙(M1-03)을 검증하기 좋다. 파일럿 목표인 "소스 2개 이상"(N05)을 충족한다.
- 핵심 PoC 위험: Drive 활동의 이벤트 분해·정규화, GitHub author·committer·pusher·봇의 실행자 해석.
- 제약:
  - Drive 후보 권한(`drive.metadata.readonly`, `drive.activity.readonly`)은 Restricted 스코프다. 앱 검증 적용 조건을 G1 전에 확인한다.
  - GitHub webhook은 서명 검증과 delivery 중복 방지를 필수로 한다.
  - 이 결정은 실제 앱 등록·OAuth 동의·저장소 연결 승인(G1·G2)을 포함하지 않는다(ADR-010).


> 2026-11-19 ADR-017로 일부 변경: 소스를 Drive·Gmail·Chat·GitHub로 넓히고, 내용은 읽되 원문 대신 핵심(digest)만 저장한다. 해당 항목은 ADR-017이 우선한다.
