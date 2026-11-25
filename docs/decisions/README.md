# 확정 의사결정 (ADR)

승인일 2026-11-19, 승인자: 프로젝트 사용자(전체 승인). 근거 상세: `docs/migration/open-decisions.md`.

| ADR | 결정 | 원 쟁점 |
|---|---|---|
| [ADR-001](ADR-001-pilot-scope.md) | AX팀 파일럿, 확장 가능한 모델 | OD-01 / D-01 |
| [ADR-002](ADR-002-resource-unit.md) | MVP는 작업 내역 건수, 공수는 후속 | OD-02 / D-02, D-08 |
| [ADR-003](ADR-003-work-hierarchy.md) | 프로젝트>태스크>작업 내역 + 업무 유형 5종 | OD-03 / D-03 |
| [ADR-004](ADR-004-logical-data-model.md) | 논리 엔터티 방향, 이벤트 보존 계약 | OD-04 |
| [ADR-005](ADR-005-ai-conversations.md) | AI 대화 원문 자동 수집 제외 (색인·요약 연결은 ADR-020) | OD-06 / D-06 |
| [ADR-006](ADR-006-completion-approval.md) | ~~담당자 판단 + 책임자 확정~~ → ADR-016 5항(근거 분명 시 자동 완료)으로 대체 | OD-07 / D-04 |
| [ADR-007](ADR-007-protection-principles.md) | 원문 외 정보 보호·접근 감사·목적 제한 | OD-08 / D-07 |
| [ADR-008](ADR-008-input-flow.md) | ~~자동 제안 + 사람 교정 기본~~ → ADR-016으로 대체 | OD-10 |
| [ADR-009](ADR-009-generated-files.md) | 생성물 Git 추적 방식 | OD-12 |
| [ADR-010](ADR-010-approval-gates.md) | G0~G3 단계별 승인 게이트 | OD-13 / D-10 |
| [ADR-011](ADR-011-pilot-sources.md) | ~~파일럿 연동 소스 Drive + GitHub~~ → ADR-017로 확대 | OD-05 / D-05 |
| [ADR-012](ADR-012-source-event-separation.md) | 원본과 발생 이벤트 분리 저장 | ADR-004 하위 |
| [ADR-013](ADR-013-db-source-of-truth.md) | 데이터 원본은 트랜잭션 DB, Sheets는 읽기 전용 사본 | OD-09 |
| [ADR-016](ADR-016-auto-judgment-first.md) | 자동 판별 우선: 시스템이 판별·수정, 어려운 것만 사람 (ADR-008 대체) | 사용자 지시 |
| [ADR-017](ADR-017-cross-source-content-digest.md) | 여러 소스 통합 취합 우선: 내용은 읽고 원문 대신 핵심만 저장 (ADR-011 확대, ADR-015 §4·ADR-016 내용 제외 변경) | 사용자 지시 |
| [ADR-018](ADR-018-wbs-tasks-progress-heatmap.md) | WBS 행을 태스크로 들임(태스크 여부는 WBS로 가르지 않음), 진척률 = 완료 ÷ 전체 태스크, 산출물 기반 자동 완료·완료일 규칙, 지연/확인 필요, 참고 기록 구분, 히트맵 = 하루 (사람,태스크) 수 | 사용자 지시 |
| [ADR-020](ADR-020-github-ai-chat-sources.md) | GitHub(API, 커밋·PR·이슈 색인)와 AI 대화(Claude Code 세션, claude.ai·ChatGPT 내보내기) 연결, 원문 없이 색인·요약만. 수집 제외 목록과 내용까지 지우는 purge | 사용자 지시 |
| [ADR-021](ADR-021-project-detection.md) | 프로젝트 판별: WBS가 없어도 작업 공간·목표 문서·여러 날 작업 등 신호 두 가지 이상이면 프로젝트. 작업 공간→프로젝트 대응 유지 | 사용자 지시 |
| [ADR-023](ADR-023-meeting-1124-screen-direction.md) | 화면 방향(11/24 회의): 진행·다음 단계·이슈 중심, 핵심 프로젝트와 AX팀 운영 분리, 번호 대신 단계, 배치안 2~3개 후 상세 개발 | 팀 회의 |
| [ADR-024](ADR-024-schedule-progress-criteria.md) | 일정·진척 값 정의(계획 기간·실제 작업 기간·완료·기한 준수·진척률·계획 진도·단계 진행), 완료 후 작업 규칙(보완·재작업·새 태스크), 태스크 간소화 기준 | 팀장·본부장 피드백 |
| [ADR-025](ADR-025-deploy-and-team-collection.md) | (제안·검증 대기) 배포는 ChatGPT Sites 우선·Workers 대안, 우리 GCP 없이 로그인, 팀원별 gws-work 연결 + 수집 도우미로 하루 1회 이상 수집, 판별은 한 곳에서 | 사용자 조건 |
| [ADR-022](ADR-022-public-site-auth.md) | 공개 사이트: Google 로그인(회사 도메인·초대제), 관리자·구성원·보기 권한, 세션·CSRF·접근 감사, 수집 토큰 업로드. 배포 대상은 결정 대기 | 사용자 지시 |
| [ADR-015](ADR-015-ax-tf-drive-pilot.md) | 실데이터 파일럿: 공유 드라이브 AX-TF, 사내 OAuth, 로컬 SQLite | G2 범위 |

미결정 유지: OD-09 중 운영 DB 제품·배치(ADR-014 예정), OD-14 중 여러 계정·소스 팀 단위 판별(ADR-019 제안, 사용자 결정 대기). 해소: OD-11 갱신 실행 → Paseo 정기 수집(real-collect 절차서), OD-15 자동/검토 경계 → ADR-016·ADR-018.
