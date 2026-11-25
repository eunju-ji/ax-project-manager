# 화면 수정 API

POST /api/correction (실제 모드는 ?data=real). 기존 세션·Origin·CSRF, member/admin 권한을 사용한다. 인증 off는 루프백에서만 실행하며 DEFAULT_USER_ID(없으면 합성 기본 담당자)를 이력 actor_id로 쓴다.

요청: {entity: task|worklog|review, op, id, version, task_version?, fields}. create는 id를 생략하고 version=0, 나머지는 조회한 엔티티 버전을 보낸다. GET /api/view의 correctionData가 사람 ID와 각 엔티티 버전을 제공한다.

- task: create/update/remove. fields: title, project_id, stage, owner(사람 ID), status(진행 중/완료), completed_at, start_date, due_date, description. 생성에는 제목·프로젝트·담당이 필요하다. 완료에는 완료일이 필요하다. merged_into로 참조받는 대상은 삭제·다른 프로젝트 이동을 400 merge_target_referenced로 거부한다.
- worklog: create/update/remove. fields: title, task_id, performed_at, owner. 생성 시 네 필드가 모두 필요하다. 날짜는 한국 날짜 YYYY-MM-DD로 저장한다. update에서 performed_at을 생략하면 기존 시각·precision을 보존하며, 화면도 날짜 입력을 실제로 바꾼 경우에만 전송한다.
- review: decide/reopen. decide fields: {decision: 완료|진행 중}, reopen fields: {}. review 요청에는 조회 당시 대상 태스크의 task_version도 필수로 보낸다. 누락하거나 현재 버전과 다르면 409이며 기존 완료 상태·완료일을 유지한다. 완료일은 Asia/Seoul 날짜로 기록하고, 태스크 상태 변경도 별도 사람 이력으로 남긴다.

응답 200: {ok:true,id,version}; 삭제는 version:null. 오류: 400 입력·허용 필드·길이·날짜, 401 세션, 403 권한·CSRF·Origin, 404 대상 없음, 409 버전 충돌·파일 잠금, 413 요청 크기, 415 JSON 형식. 제목 120자, 설명 200자. 원문 필드는 허용하지 않는다.

Node는 기존 delta 잠금을 공유하고 임시 JSON 파일을 만든 뒤 rename으로 교체한다. 최초 로컬 수정은 SQLite 현재 스냅샷에서 시작한다. Workers는 기존 메모리 저장소 큐에서 같은 규칙을 적용한다(기존과 같이 재시작 후 지속성은 없다). before/after·로그인 사용자 이력으로 자동 갱신을 차단하고 삭제한 태스크/작업과 원본 연결에는 suppression을 기록한다.

화면: 드로어에서 수정·작업 추가·옮기기·삭제, 프로젝트 펼침에서 태스크 추가, 처리한 확인 항목의 다시 판단. 예시 정적 모드와 viewer에는 수정 버튼을 숨긴다. 충돌 시 새로고침 안내를 표시한다.

검증은 합성 데이터만 사용한다. 실사용 데이터 경로에 접근하지 않는다.

검증: build.py·typecheck, UI 93/93, 서버 297/297, Workers 17/17, 시각 기준 갱신·재비교 54/54(픽셀 차이 0), 탐색 112/112 및 합성 수정 탐색 통과. 자동 수집으로 변경된 엔티티도 이전 폼 버전을 무효화한다. 삭제한 이벤트의 원본 자료로 다시 연결하는 시도도 거부한다.

Reviewer 후속 검증: build.py·typecheck, UI 93/93, 서버 305/305, Workers 21/21, 탐색 112/112 및 한국 날짜·시각 보존을 포함한 합성 수정 탐색 통과.
