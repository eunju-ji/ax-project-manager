# M4 실데이터 파일럿: 공유 드라이브 AX-TF 연동

> 작성: AX-Lead, 2026-11-19 · 상태: **승인**(ADR-015). 인증·DB 예외·저장 범위 확정, 팀원은 3명이 아님, 별도 고지 없음 · 게이트: G1·G2(ADR-010)
> 사용자 지시: M3 로컬 DB 테스트가 끝나면 바로 Google Workspace 연동을 시작하고 실제 데이터로 시작한다. Drive는 공유 드라이브 **AX-TF**만 대상.

## 1. DB가 계속 필요한 이유
Drive는 "파일과 그 파일에서 일어난 일"만 가지고 있다. 이 서비스가 만드는 정보는 Drive에 없다.
| 정보 | Drive에 있는가 | 우리 DB가 필요한 이유 |
|---|---|---|
| 파일·편집 기록 | 있음 | 원본은 Drive. 우리는 최소 메타와 이벤트 키만 저장 |
| 이 편집이 어느 프로젝트·태스크·작업 내역인가 | 없음 | Link·WorkLog |
| 사람의 판단(맞아요·완료, 연결 거절) | 없음 | Review·Suppression·change_log |
| 어디까지 수집했는가 | 없음 | connector_cursors |
| 같은 이벤트를 두 번 받았는가 | 없음 | event_key 중복 방지 |
| 파일이 지워진 뒤에도 남아야 할 업무 이력 | 없음(삭제되면 사라짐) | WorkLog·SourceEvent 보존 |
→ DB 없이 Drive만 읽으면 매번 처음부터 판단해야 하고, 사람이 고친 연결이 다음 수집에서 사라진다.

## 2. 연동 범위 (최소 권한)
| 항목 | 내용 |
|---|---|
| 대상 | 공유 드라이브 AX-TF 하나 (`driveId` 고정) |
| 읽는 것 | 파일 메타데이터(이름·종류·생성/수정 시각·작성자·위치), 활동 기록(누가·언제·무슨 동작) |
| 읽지 않는 것 | 파일 **내용**, 다른 공유 드라이브, 개인 내 드라이브, Gmail·Calendar·Chat |
| 쓰기 | Drive에는 **아무것도 쓰지 않는다** |
| 권한 범위(스코프) | `drive.metadata.readonly`, `drive.activity.readonly` (둘 다 Restricted. 사내 전용 앱이면 Google 검증 불필요) |
| 저장 위치 | 이 PC의 로컬 SQLite (Git 제외 폴더). 외부 서버·클라우드 전송 없음 |

### 사용하는 API (공식 문서)
- 변경 감지: `changes.getStartPageToken` / `changes.list`에 `driveId`, `supportsAllDrives`, `includeItemsFromAllDrives` 지정 → AX-TF 안의 변경만. — [Implement shared drive support](https://developers.google.com/workspace/drive/api/guides/enable-shareddrives), [changes.list](https://developers.google.com/workspace/drive/api/reference/rest/v3/changes/list)
- 활동 기록: `activity.query`에 `ancestorName = items/<AX-TF 드라이브 ID>` → 드라이브 전체 하위 활동. 행위자는 `knownUser.personName`(`people/…`)으로 온다. — [Make requests in the Drive Activity API](https://developers.google.com/workspace/drive/activity/v2/requests), [activity.query](https://developers.google.com/drive/activity/v2/reference/rest/v2/activity/query)
- 행위자 이름: Drive Activity의 `people/…` ID와 Drive 메타데이터의 사용자 정보(이름·이메일·permissionId)를 대조해 매핑한다. 실제 팀원은 3명이 아니므로 수동 매핑 대신 자동 대조 + 확인. 대조가 안 되면 디렉터리 조회 스코프 추가를 별도 검토. 매핑 안 된 행위자는 "실행자 미상".
- 사내 전용 앱 검증 면제: [Configure the OAuth consent screen](https://developers.google.com/workspace/guides/configure-oauth-consent), [When is verification not needed](https://support.google.com/cloud/answer/13464323?hl=en)

## 3. 인증 방식
| | (권고) 사내 전용 OAuth — 팀원 1명 계정 | 서비스 계정을 AX-TF 멤버로 추가 |
|---|---|---|
| 방식 | AX-TF 멤버인 팀원이 브라우저에서 1회 동의, 읽기 전용 토큰을 이 PC에 저장 | 서비스 계정 이메일을 공유 드라이브 멤버(뷰어)로 추가 |
| 필요한 것 | 조직 소유 GCP 프로젝트, 동의 화면 Internal, OAuth 클라이언트 | 조직 소유 GCP 프로젝트, 서비스 계정 키, 외부 도메인 멤버 허용 정책 |
| 장점 | 설정 단순, 그 사람이 볼 수 있는 범위만 보임 | 개인 계정과 분리 |
| 주의 | 동의한 사람이 AX-TF에서 빠지면 수집 중단 | 조직이 `gserviceaccount.com` 멤버 추가를 막는 경우가 많음. 키 파일 관리 부담 |

## 4. 비밀값 처리
- OAuth 클라이언트 파일과 토큰은 **채팅으로 받지 않는다.** 사용자가 직접 `app/.secrets/`(Git 제외)에 넣고, 동의 명령을 직접 실행한다.
- 토큰은 읽기 전용 권한만 가진다. 파일럿 종료 시 토큰 폐기 절차를 문서로 남긴다.

## 5. 데이터 보호 최소 결정 (ADR-007 세부 중 파일럿에 필요한 것)
| 항목 | 권고 기본값 |
|---|---|
| 저장하는 것 | 파일 ID·이름·종류·위치 경로·생성/수정 시각, 활동(행위자 ID·동작 종류·시각) |
| 저장 안 하는 것 | 파일 내용, 댓글 본문, 공유 대상 목록 |
| 볼 수 있는 사람 | 이 PC 화면을 쓰는 AX팀 3명 |
| 보존 | 파일럿 기간 동안 보존, 종료 시 로컬 DB 백업 후 삭제 여부 결정 |
| 팀원 고지 | 3명에게 수집 범위·목적(리소스 파악, 성과 평가 아님)을 알리고 동의 확인 |

## 6. DB 관련 예외
- M3 설계는 "G2 전 PostgreSQL 이관 연습 완료"를 필수로 뒀다. 파일럿을 로컬 SQLite로 시작하려면 이 조건에 대한 예외가 필요하다.
- 예외 근거: 파일럿 데이터는 **Drive에서 다시 수집할 수 있다**(파일 메타·활동 기록). 사람 판단 기록만 옮기면 되므로 나중에 이관할 때 위험이 작다. 대상이 3명·드라이브 1개로 작다.
- 조건: 판단 기록 내보내기·가져오기 스크립트를 파일럿 시작 전에 준비한다. PostgreSQL 이관(M3-03)은 파일럿 중 병행한다.

## 7. 진행 순서
1. M3 로컬 DB 테스트 완료·검토
2. (G0) Drive 커넥터 구현: 공식 API 응답 형태의 **가짜 응답**으로 수집·정규화·이벤트 분해·커서·중복 방지 테스트
3. (사용자) GCP 설정과 동의 — §8 체크리스트
4. (G2) 최초 수집: 최근 기간부터 소량(예: 최근 2주) → 결과를 사용자와 함께 확인 → 범위 확대
5. 팀원 `people/…` ID 매핑, 기존 프로젝트·태스크와 연결 제안 검토

## 8. 사용자 준비 체크리스트
- [ ] 조직(회사 Workspace) 소유 GCP 프로젝트 생성 또는 사용할 프로젝트 지정
- [ ] Google Drive API, Drive Activity API 사용 설정
- [ ] OAuth 동의 화면 유형 **Internal**, 스코프 `drive.metadata.readonly`, `drive.activity.readonly`
- [ ] OAuth 클라이언트(데스크톱 앱) 생성 → JSON 파일을 `app/.secrets/oauth-client.json`에 저장
- [ ] 동의할 팀원 계정이 AX-TF 멤버인지 확인
- [ ] 조직 관리자 승인이 필요한 경우 승인 요청
- [ ] 팀원 3명 수집 범위·목적 고지
