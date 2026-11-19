# M4 Drive 커넥터 구현 및 검증

작성: AX-Builder · 2026-11-19. 실제 Google API 요청 0건, 실데이터 접근 0건. 추가 에이전트·commit·push 없음. **구현 초안 검증 통과, 실수집 시작 게이트는 미완료**다. 아래 미해결 항목을 Lead가 검토하기 전에는 자격 증명만 넣으면 모든 요구사항이 충족된다고 해석하지 않는다.

## 구조와 데이터 흐름

- `app/server/connectors/drive/model.cjs`: 허용 메타데이터만 복사, actions × targets 분해, 기존 normalize의 UTC·행위자 집합·key_version=1 적용.
- `client.cjs`: Drive/Activity HTTP, 고정 driveId, 최소 fields, 네트워크 timeout, 429/5xx 지수 대기(최대 4회 요청). 테스트에서는 base URL과 fetch를 로컬로 주입한다.
- `collect.cjs`: startPageToken 확보 → 파일 목록 페이지 → Changes → 기간 제한 Activity. Changes와 Activity 커서는 별도 connector 행이다. 400/410은 Changes 전체 메타 재조회 또는 동일 Activity 기간 첫 페이지 재조회 1회로 복구한다. 외부 HTTP·폴더 부모 조회는 DB tx 밖이다.
- `store.cjs`: 기존 Collector의 페이지 tx 안에서 sources·계정 후보·events·variants·queue·Review·cursor·Run을 저장한다. Task 자동 Link/WorkLog 생성 없음. 폴더·이름에서 기존 태스크 ID/제목을 찾고 후보가 정확히 하나일 때 제안, 그 외 판단 불가 Review. 신원 불일치는 performer Review.
- `oauth.cjs`: 설치형 loopback `127.0.0.1` 임의 포트, state, PKCE S256, refresh, 정확히 두 스코프 검증. 브라우저 consent URL을 터미널에 출력하지 않는다. 토큰/클라이언트/서버 오류 본문은 오류 메시지에 포함하지 않는다.
- `cli.cjs`: auth/check/collect/metrics. `AX_DRIVE_ID` 필수, 접근 확인 결과 id 일치와 이름 AX-TF 확인. DB는 `app/server/.pilot/pilot.sqlite`이며 합성 `.runtime/local.sqlite`과 분리했다.
- API와 UI: `?data=pilot`에서 별도 파일럿 DB를 읽고 출처를 “AX-TF 공유 드라이브 기록”으로 표시한다. 기존 검토함 카드/버튼 스타일로 연결 제안 확정·태스크 변경·판단 불가를 기록한다. 합성 기본 화면 CSS는 변경하지 않았다.

## 사용자 준비 절차 (이번 작업에서는 실행하지 않음)

1. 조직 GCP 프로젝트에서 Google Drive API와 Drive Activity API를 활성화한다.
2. OAuth 동의 화면을 Internal로 설정하고 데스크톱 앱 클라이언트를 만든다. 요청 스코프는 `https://www.googleapis.com/auth/drive.metadata.readonly`, `https://www.googleapis.com/auth/drive.activity.readonly` 두 개만 사용한다.
3. 다운로드한 파일을 로컬 `app/.secrets/oauth-client.json`에 저장한다. 채팅으로 공유하지 않는다. Windows 사용자 폴더 접근 권한을 점검한다(mode 0600은 Windows ACL을 대신하지 않는다).
4. app PowerShell에서 `npm.cmd run drive:secure-dirs` → `npm.cmd run drive:check-dirs`로 `.secrets`·`.pilot`의 현재 사용자 전용 ACL을 준비·확인한다. **현재 자동 검증 환경에서 소유자 변경 접근 거부가 발생하므로 이 단계는 미해결 게이트다.** `$env:AX_DRIVE_ID='<AX-TF ID>'`를 설정한 뒤 `npm.cmd run drive:auth` 실행, 열린 브라우저에서 AX-TF 멤버 계정으로 동의한다. 결과는 `.secrets/token.json`에 저장된다. 최초 ID는 `.pilot/drive-config.json` 및 파일럿 DB workspace metadata에 고정되며 다른 ID로 재사용하지 않는다.
5. `npm.cmd run drive:check`: 스코프·인증·드라이브 접근 확인. 수집 DB는 생성하지 않는다. 만료 토큰은 갱신해 로컬 토큰 파일에 저장할 수 있다.
6. 나머지 실수집 게이트 해결 뒤 `npm.cmd run drive:collect -- --since 2026-11-05`처럼 제한된 기간을 지정한다. 태스크 없는 빈 DB에서도 수집한다. 날짜 생략 시 최근 14일, 폴더 구조용 메타 목록은 드라이브 전체다.
7. `npm.cmd run drive:structure-draft`: `server/.pilot/structure-draft.csv`를 UTF-8 BOM으로 생성한다(Git 제외). 기존 초안이 있으면 덮어쓰지 않으므로 보관·이름 변경 후 다시 생성한다. 최상위 폴더는 프로젝트 후보, 그 아래 모든 폴더는 태스크 후보이며, 루트 바로 아래 파일은 include=N인 미분류 행이다. file_count는 하위 파일 수, last_activity_at·active_people_count는 수집된 하위 파일 이벤트와 외부 계정 기준이다.
8. Excel 등에서 CSV를 수정한다. include=Y/N으로 선택하고 프로젝트·태스크 키와 이름을 확정한다. 포함할 task 행은 category를 기획·설계/조사·분석/제작·구현/검증/운영·지원 중 하나로 채운다. assignee_email은 선택이다. 여러 폴더를 같은 프로젝트/태스크로 묶으려면 같은 키·같은 속성으로 서로 다른 folder_id 행을 둔다. 같은 키의 이름·태스크 속성이 다르거나 같은 folder_id가 반복되면 거부한다. 폴더 없는 태스크는 folder_id를 비운 새 task 행으로 추가한다. 직접 파일의 미분류 행은 제외한다. CSV의 수식 시작 문자는 앞에 apostrophe를 붙여 출력하고 가져올 때 되돌린다.
9. `npm.cmd run drive:structure-import -- server/.pilot/structure-draft.csv`: 필수 열·키·유형 검증 후 기준 정보·폴더 매핑·감사·재판별을 한 트랜잭션으로 저장한다. 없는 폴더와 일치하지 않거나 모호한 이메일은 경고하며 해당 매핑/담당자는 비운다. 같은 키는 갱신하므로 엔터티가 중복되지 않는다. import 실패 시 기준 정보와 제안까지 모두 롤백한다. `npm.cmd run drive:rematch`로 별도 재판별도 가능하다. 매핑은 엔터티 metadata에 드라이브 범위·folder ID 목록으로 저장한다.
10. `npm.cmd run poc`, `http://127.0.0.1:8766/?data=pilot`에서 검토함을 확인한다. 폴더 매핑은 가장 가까운 하위 태스크 매핑을 우선하며 자동 Link·WorkLog 생성은 하지 않는다. 사람 확정 Link·결정된 Review·Suppression은 유지한다. `npm.cmd run drive:metrics`로 decided를 분모로 accepted/corrected/unable 비율과 미결 수를 확인한다. 표본이 없으면 비율은 null이다.
11. 종료 시 Google 계정의 앱 연결을 해제하고 `.secrets/token.json`을 삭제한다. 파일럿 DB·CSV·JSONL·보관본 보존/삭제는 ADR-015 종료 결정에 따른다.

## 저장 필드와 제외 필드

저장: 파일 id·driveId·name·mimeType·parents·folderPath·createdTime·modifiedTime·trashed, lastModifyingUser의 displayName·emailAddress·permissionId. source의 URI·확인 시각·가용 상태. 활동의 actor personName·동작 종류·대상 파일 ID·timestamp 또는 timeRange·정규화 키와 digest. 사람 후보는 고정 팀원 목록 없이 메타데이터 permissionId에서 만든다. 판단/감사/커서는 별도 DB 표에 저장한다.

저장 안 함: 파일 내용, 댓글 본문, 공유 대상 목록, 설명, 사진 링크, OAuth 값. 파일 fields에는 이 필드를 넣지 않는다. Activity detail은 동작 유형 식별에 필요한 하위 필드만 요청하고 원 응답 전체는 저장하지 않는다. 댓글은 동작 종류만 정규화한다. 다른 driveId 파일은 버리고 Activity 대상도 파일 메타 driveId를 재확인한다.

## M3 보강

- `transfer.cjs`: JSONL export/import, manifest 건수·checksum·열린 Review·활성 Suppression 대조. 사람 판단뿐 아니라 FK 참조에 필요한 모든 기준/활동 표를 포함한 **전체 의존성 묶음**이다. 새 빈 DB만 허용하며 이미 시드된 DB 위 병합 도구는 아니다. 개인정보를 포함하므로 파일럿 보호 디렉터리 안에 저장한다.
- 사용: app에서 `npm.cmd run judgments:export -- server/.pilot/pilot.sqlite server/.pilot/judgments.jsonl`, `npm.cmd run judgments:import -- server/.pilot/restored.sqlite server/.pilot/judgments.jsonl`. checksum 대조와 FK 검사는 import tx 안/직전에 수행한다.
- `service/audit-spool.cjs`: 실패 감사 DB 쓰기도 busy면 DB 옆 `.audit-pending/`에 최소 JSON을 보존한다. drain은 display_key로 중복을 막으며 DB 커밋 후 파일 삭제 전에 중단돼도 재실행 가능하다. 수집 CLI가 시작 시 drain한다. 일반 PoC 서버 자동 drain은 아직 연결하지 않았다.
- `repo/sqlite/{lifecycle,seed-file}.cjs`: 런타임 lease, seed digest 비교, digest 변경 시 이전 DB 보관. 정상 종료 후 WAL checkpoint를 확인해 보관한다. 활성 런타임이 있으면 reset/자동 재시드를 거부한다.
- 같은 파일 2연결에서 대리 해제와 판단, 거절과 자동 Link 경쟁 검증. 403 수집 실패 시 Run failed와 기존 source 불변 검증.

## 검증

- 테스트는 공식 응답 형태의 로컬 HTTP 서버를 사용했다. fetch 주입 함수는 요청 origin이 로컬 서버와 같지 않으면 거부한다. OAuth 오류 테스트도 가짜 fetch만 사용했다. Google endpoint 요청은 실행하지 않았다. 공식 개발자 문서 조회만 수행했다.
- 정상·파일/활동 페이지네이션·410 재동기화·429 재시도·다른 driveId 혼입·활동 재수신·분해·timeRange·미상 실행자·후보 생성·필드 제외·비밀값 오류 마스킹·Git 제외·JSONL 대조·실제 외부 프로세스 잠금 감사 대기열·seed 변경/lease·2연결 경쟁을 검증했다.
- 기존 Collector 테스트에서 동일 key/digest 변형 격리와 cursor 실패 전체 롤백을 재검증했다. Drive 전용 변형/원자성 주입 테스트, Activity 400, 5xx, OAuth 성공 callback/refresh 통합 시나리오는 이번 신규 테스트에 별도로 포함하지 못했다.
- `npm.cmd test`: 43/43 통과. `npm.cmd run test:server`: 26/26 통과(기존 18 + 신규 8). `npm.cmd run typecheck`, `npm.cmd run build`: exit 0.
- navigation/visual 및 성능 최종 결과는 아래 추가 기록에 남긴다. 시각 기준 이미지 재생성 없음.
- 구현 후 수정·재검증은 3회 이내로 제한했다. 1차: 로컬 activity URL의 colon이 URL scheme으로 해석되는 결함과 테스트 정리 순서/다른 태스크 Link 집계 오류. 2차: 재수집의 이동된 시간 창을 허용하지 않는 가짜 서버 assertion 교정. 3차 전체 서버 검증 26/26 통과. 이후 구현 수정은 하지 않았다.

## 첫 실수집에서 확인할 항목

1. `people/<suffix>`와 메타데이터 permissionId의 동일성: 현재는 동등 ID를 후보로만 만든다. 실제로 맞는지 검증 전 사람 확정으로 해석하지 않는다. 이름만 같은 사람을 합치지 않는다. 매핑 실패는 실행자 미상이다.
2. Drive Activity 보존 기간, 계정이 볼 수 있는 과거 기록, 시각 범위·통합 none의 실제 응답 형태와 fields 마스크 수용 여부.
3. 폴더 구조/파일 이름이 기존 프로젝트·태스크와 대응하는지, 태스크 후보가 없는 비율, 사람 수정·판단 불가 비율. 행위자/시각은 근거로 남지만 현재 후보 점수에는 사용하지 않는다.

## 미해결 위험 / 실수집 전 게이트

1. **구현·가짜 응답 검증 완료(Lead 판정 대기)**: collect → structure-draft → 사용자 CSV 수정 → structure-import(재판별 포함) → 검토함 → metrics 경로 추가. 합성 기준 정보 혼합 없음. CSV·폴더 집계·담당자 대조·키 기준 갱신·사람 Link 불변·실패 전체 롤백 테스트 통과. 실수집은 아래 보안 게이트 해결 후 별도 진행한다.
2. 파일럿 출처·검토함·판단 불가 저장은 가짜 API를 주입한 Chromium smoke에서 통과했다(`app/server/.runtime/pilot-smoke.cjs`, Git 제외). 실제 파일럿 DB/API 전체 브라우저 통합 검증은 미완료다. performer Review는 판단 불가 기록만 가능하고 사람 후보 확정 UI는 없다.
3. reset은 협력하는 런타임 lease를 검사한다. prepare 종료와 후속 open 사이의 경합, lease를 쓰지 않는 외부 SQLite 도구, gate 파일을 보유한 프로세스의 비정상 종료 복구는 별도 보강이 필요하다. open 초기화 실패 시 lease 해제도 아직 보장하지 않는다.
4. **구현·가짜 응답 검증 완료(Lead 판정 대기)**: metadata 없는 removed 항목은 기존 source만 unknown+checked_at 갱신, 미등록 source 무시. trashed는 deleted와 다른 trashed 상태이며 복구 시 available. 이벤트·WorkLog·Link 불변 테스트 통과. STRICT sources에 availability CHECK를 추가하는 0002 migration 포함. 기존 페이지 커밋 뒤 다음 조회 실패 시 기존 커밋 보존·Run failed 정책은 유지한다.
5. 폴더명 변경 시 cache된 하위 경로 재계산, Activity 중간 실패 기간 중복/동시 실행, 이벤트 없는 활동 상세 유형 및 모든 token 오류 분류의 추가 테스트가 필요하다. cursor version은 동시 커밋 충돌을 막지만 전체 수집 lease는 없다.
6. JSONL은 판단만 선택해 기존 DB에 병합하는 기능이 아니라 전체 참조 스냅샷 복원이다. 민감 자료 보존 기간/백업 만료/팀별 사용자 인증은 기존 M3 한계와 동일하다. 로컬 파일럿 사용자 표시는 시스템 라벨이며 실제 사용자 인증이 아니다.
7. 감사 대기열 파일은 로컬 쓰기 완료를 사용하며 fsync 기반 전원 장애 내구성 보장은 없다. 디스크 오류 시 enqueue도 실패할 수 있다. 현재 자동 drain은 수집 CLI에만 있다.
8. 공식 API fields 마스크와 OAuth 성공 흐름은 가짜 응답 테스트만으로 실서비스 적합성을 보증할 수 없다. 실제 Google 호출은 사용자 준비와 Lead 검토 뒤 별도 실행한다.

## 공식 근거

- [공유 드라이브 지원](https://developers.google.com/workspace/drive/api/guides/enable-shareddrives), [changes.list](https://developers.google.com/workspace/drive/api/reference/rest/v3/changes/list)
- [Drive Activity 요청](https://developers.google.com/workspace/drive/activity/v2/requests), [activity.query](https://developers.google.com/drive/activity/v2/reference/rest/v2/activity/query), [데이터 모델](https://developers.google.com/workspace/drive/activity/v2/datamodel)
- [Desktop OAuth/PKCE/loopback](https://developers.google.com/identity/protocols/oauth2/native-app)

## 보안 검토 대응 (Part C, 2026-11-19)

**일부 구현·검증 완료, 전체 완료 아님.** 실제 Google API 호출·실데이터 접근·Git commit/push·추가 위임은 하지 않았다. 보안 Part C 수정·재검증은 3회로 중단했다. 1차 신규 테스트 8/9(내보내기 제한 미구현 재현), 2차 전체 34/35(기존 JSONL 테스트의 임시 경로가 새 정책 위반), 3차 전체 **35/36**(Windows ACL 소유자 변경 접근 거부). 이후 구현 수정하지 않았다.

1. fields: 잘못된 `move(addedParents(name),removedParents(name))`를 `move(addedParents(driveItem(name)),removedParents(driveItem(name)))`로 수정했다. 독립 REST 스키마 부분집합 fixture로 Activity/Action/ActionDetail/Target/TargetReference/Actor/TimeRange와 Files get/list·Changes를 검사한다. 잘못된 fields 경로에 400을 반환하는 가짜 fetch 테스트 통과. 이 테스트는 REST 페이지에서 옮긴 부분 스키마이며 전체 Discovery 문서 자동 대조는 아니다.
2. 캐시: Changes 페이지 수신 시 캐시를 비우고 removed/외부 drive 항목을 무효화한다. Activity는 저장 직전 대상과 부모를 files.get으로 재확인하여 캐시만으로 소속을 신뢰하지 않는다. 외부 이동은 moved, 403은 access_denied, 404/metadata 없는 removed는 unknown. 기존 source의 상태·확인 시각만 바꾸며 이벤트는 보존한다. UI 투영에서 unavailable Drive 제목·retained_meta를 제거하고 pilot Review signals도 상태만 노출한다. 원 protected_contents는 감사·복구를 위해 보존하며 화면 응답에 그대로 전달하지 않는다. 가짜 응답 재현 통과.
3. Action.target/actor가 있으면 우선하고, 없으면 활동 전체 target/actors/time을 상속한다. 별도 timestamp가 있으면 활동 timeRange를 섞지 않는다. A→F1 편집·B→F2 이름 변경은 정확히 두 이벤트. 기존 pilot 테스트도 이 기대값으로 교정했다.
4. ACL **미완료 게이트**: `security.cjs`, `drive:secure-dirs`, `drive:check-dirs` 추가. icacls reset·setowner·현재 SID 전용 grant·상속 제거, 하위 파일 재설정 후 소유자·허용 SID·루트 상속 차단 확인. auth/collect/CSV 쓰기 전에 검사하며 과도하면 중단한다. 가짜 ACL 거부 테스트는 통과했다. 실제 임시 폴더 테스트는 `icacls ... /setowner *<현재 SID> /T /Q`에서 exit 5(접근 거부). 이 때문에 토큰 temp·WAL/SHM·감사 대기열·백업을 함께 보호하는 통합 테스트는 그 이후 단계까지 도달하지 못했다. 정상 Windows 사용자 세션에서 ACL 준비/확인이 성공하는지 추가 검증 필요. 현재 환경 제한인지 구현 권한 선택 문제인지 분리 확인 전 완료 처리하지 않는다.
5. JSONL export 경로는 `.pilot` 안의 실제 경로로 제한했다. 경로 이탈·파일 symlink 거부, 기존 왕복 테스트를 `.pilot` 하위 합성 임시 폴더로 옮겨 통과했다. 스냅샷 전체 복원 의미는 유지한다.
6. OAuth callback은 state가 유효한 첫 요청에서 소비 표시·timer 해제·listener close 후 exchange한다. URL 파싱 오류는 400. 잘못된 state 후 정상 callback·성공·timeout·refresh 성공/실패 마스킹 테스트 통과. 별도 중복 callback 경쟁과 malformed URL socket 테스트는 아직 추가하지 못했다.
7. pilot-decision corrected에는 형식이 유효한 task_id를 요구한다. 존재 여부는 기존 service lookup에서 검사한다. pilot 판단 실패는 고정 `pilot_decision_failed`, 바깥 서버 예외는 `request_failed`만 응답한다. 별도 endpoint 재현 자동 테스트는 미완료다.
8. 최초 환경 ID를 `.pilot/drive-config.json`에 저장하고 DB workspace metadata에도 고정한다. ID 변경 거부 테스트 통과. pin 파일은 로컬 최초 설정 기준이며 별도 서명 저장소는 아니다.

공식 대조 근거: [DriveActivity](https://developers.google.com/workspace/drive/activity/v2/reference/rest/v2/activity/driveactivity), [Action의 상속 규칙](https://developers.google.com/workspace/drive/activity/v2/reference/rest/v2/activity/action), [ActionDetail](https://developers.google.com/workspace/drive/activity/v2/reference/rest/v2/activity/actiondetail), [Target](https://developers.google.com/workspace/drive/activity/v2/reference/rest/v2/activity/target), [TargetReference](https://developers.google.com/workspace/drive/activity/v2/reference/rest/v2/activity/targetreference), [Actor](https://developers.google.com/workspace/drive/activity/v2/reference/rest/v2/activity/actor), [TimeRange](https://developers.google.com/workspace/drive/activity/v2/reference/rest/v2/activity/timerange), [File](https://developers.google.com/workspace/drive/api/reference/rest/v3/files). 문서 조회만 했으며 Google 데이터 API는 호출하지 않았다.

이번 차수 변경: `app/server/connectors/drive/{structure,security}.cjs`, `app/server/db/migrations/0002_source_availability.sqlite.sql`, `app/server/tests/{drive-structure,drive-security}.test.cjs` 신규. 수정: `app/server/connectors/drive/{collect,store,model,client,oauth,cli}.cjs`, `app/server/{transfer,service/index,api/server}.cjs`, `app/server/tests/pilot.test.cjs`, `app/package.json`, 이 보고서, `tasks/current-state.md`. 새 의존성·디자인 변경 없음. 보호 경로 tracked diff 비어 있음(미추적 보호 데이터의 이전 SHA 비교는 하지 않았으며 직접 편집 없음). git diff --check는 기존 CLAUDE.md EOF 경고만 남았다.

현재 차수 검증: `npm.cmd test` 43/43, `npm.cmd run test:server` **35/36(ACL 1실패)**, `npm.cmd run typecheck` exit 0, navigation 88/88, visual 54/54(모든 baseline/offline 픽셀 차이 0, 기준 이미지 재생성 없음), 각 UI 검증 exit 0. `npm.cmd run build`는 PATH에 python이 없어 exit 1이었고, 설치된 `C:/Users/EunjuJi/.local/bin/python3.15.exe build.py`는 샌드박스 밖 실행으로 exit 0(같은 build.py, 파일 변경 없음). 샌드박스 안 trampoline은 permission denied였다. ACL 자동 승격 재실행은 하지 않았으며 실패를 감추거나 skip하지 않았다. 전체 AC는 충족하지 못했으므로 실수집 시작·완료 판정은 보류한다.


### F1~F6 재검토 대응 결과 (AX-Builder, 2026-11-19)

**완료 판정 보류.** 수정·재검증 3회 제한에 도달하여 추가 코드 수정은 중단했다. 실수집을 시작하지 않는다. 실제 Google 호출 0건, 실데이터/자격 증명 접근 없음, commit/push 없음.

- F1: Lead의 소유자 검사 및 기존 회귀 테스트를 변경하지 않았다. 기존 ACL 테스트 통과.
- F2: 성공한 전체 목록 재조회 후 기존 Drive source ID와 대조하고 누락 항목을 files.get(테스트에서는 가짜 client.file)으로 재확인한다. 404/네트워크 실패는 unknown, 403은 access_denied, 다른 driveId는 moved, 휴지통은 trashed. 이벤트·WorkLog·Link·Review를 변경하지 않는다. 410 재현 및 5종 결과 테스트 통과.
- F3: 공용 hiddenAncestor 검사로 접근 불가·삭제·외부 이동·미상·휴지통 조상의 이름/경로가 CSV에 나오는 행을 제외한다. Service view와 pilot review signals에도 같은 검사를 적용한다. retained metadata 자체는 보존한다. 5종 상태의 CSV/view 비노출 테스트 통과.
- F4: 내보내기는 .pilot/exports/ 아래 .jsonl만 허용하며 쓰기 전에 checkDirs([PILOT_DIR])를 실행하고 flag wx로 기존 파일 덮어쓰기를 거부한다. ACL 실패 시 미생성, DB 경로·확장자 거부, 기존 바이트 보존 테스트 통과. 전용 exports 디렉터리를 먼저 준비해야 한다.
- F5: 원래 아포스트로피도 한 개를 덧붙여 인코딩하여 수식 방지용 아포스트로피와 구분한다. =, +, -, @, 탭, CR, 일반 값 및 원래 아포스트로피의 왕복 테스트 통과. CLI CSV 입력은 assertPilotPath로 .pilot 내부로 제한하고 TextDecoder fatal UTF-8로 잘못된 바이트를 거부한다.
- F6: domain/display-key.cjs의 ^[A-Za-z0-9_-]{1,64}$를 CSV, API, DB records.insert에서 사용한다. CSV 위반은 CSV row N과 key 오류를 반환한다. 공백·콜론·65자 키 거부 테스트 통과.

RED → GREEN 기록: app/test-results/f2-f6-red.log는 최초 6개 실패(이 중 F2는 처음 테스트 fixture의 필수 DB 열 누락 실패). fixture를 보완한 F2는 production 파일을 바꾸지 않고 reconciliation만 제거한 메모리 컴파일 collector로 재현했으며 f2-corrected-red.log에 available != unknown을 확인했다. 최종 final-server-3.log 및 final-server-excluding-socket.log에 F2~F6 6개 모두 통과가 남아 있다. 1·2차 focused 실행의 fixture 필수 열 누락도 로그에 남겼고 성공으로 계산하지 않았다.

실제 최종 출력:

```text
npm.cmd test: tests 43 / pass 43 / fail 0
npm.cmd run typecheck: exit 0
npm.cmd run test:navigation: {"checks":88,"failures":0,"errors":0}
npm.cmd run test:visual (포트 충돌 해소 후 순차 실행): {"checks":54,"failures":0,"errors":0}
server (drive-socket-security.test.cjs 제외): tests 42 / pass 42 / fail 0
OAuth 소켓 단독 진단: tests 1 / pass 1 / fail 0
pilot-decision 단독 진단: tests 1 / pass 0 / fail 1
  EPERM, Permission denied: .../Temp/ax-api-... (test after hook rmSync)
npm.cmd run build: 'python' is not recognized
python3.15.exe build.py: uv trampoline failed to spawn Python child process; permission denied (os error 5)
보호 파일 SHA-256 비교: protectedFiles 74 / changed []
git diff --check: 기존 CLAUDE.md:114 new blank line at EOF
```

로그는 app/test-results/final-*-3.log, final-visual-sequential.log, final-server-excluding-socket.log, final-oauth-diagnostic.log, final-pilot-diagnostic.log, final-build-direct.log에 보관한다. 기존 시각 기준 이미지를 재생성하지 않았고 새 npm 의존성은 없다.

미해결: 새 pilot-decision 테스트는 정상 correction, 잘못된 task_id, 없는 task, 고정 오류 응답을 실제 HTTP로 검사하지만 Windows after hook에서 서버/DB를 닫기 전에 임시 디렉터리를 지우는 순서로 EPERM이 발생한다. 이로 인해 일반 전체 test:server 실행도 종료되지 않아 수동 중단했다. --test-force-exit 진단으로 오류를 확인했으나 이를 정상 통과로 계산하지 않는다. OAuth 소켓 테스트는 단독 실행 통과(동시 callback 200/400, exchange 1회, malformed URL 400). build도 환경 차단으로 미완료다. 다음 Lead 작업은 테스트 정리 순서 수정 허용 여부와 Python 실행 환경 해결 후 전체 검증 및 최종 Reviewer 재검토다.

이번 변경 파일: app/server/connectors/drive/{collect,store,structure,cli,visibility,oauth}.cjs, app/server/domain/display-key.cjs, app/server/repo/sqlite/records.cjs, app/server/service/index.cjs, app/server/api/server.cjs, app/server/transfer.cjs, app/server/tests/{drive-final-security,drive-socket-security,pilot}.test.cjs, ADR-015, 본 보고서, tasks/current-state.md. F1 security.cjs와 drive-security.test.cjs는 변경하지 않았다.

## 변경 파일

신규: `app/server/connectors/drive/{model,client,collect,store,oauth,cli}.cjs`, `app/server/service/audit-spool.cjs`, `app/server/repo/sqlite/{lifecycle,seed-file}.cjs`, `app/server/transfer.cjs`, `app/server/tests/pilot.test.cjs`, 이 보고서.
수정: `app/server/{api/server,service/index,service/collector,repo/sqlite/index}.cjs`, `app/package.json`, `app/.gitignore`, `app/src/app.ts`, 생성 `app/app.js`, M3 보고서, `tasks/current-state.md`.

보호 파일 `app/data.json`, `app/assets/`, `app/build.py`, 기존 `app/tests/*.test.cjs`, `app/poc/dataset/synthetic-large.json`에 직접 편집 없음. 새 npm 의존성 없음. 작업 트리에는 이전 차수의 변경도 있으며 Git diff --stat은 미추적 server 파일을 포함하지 않는다.

## 최종 실행 결과와 성능 (1회)

- navigation: 88 checks / failures 0 / errors 0, exit 0.
- visual: 54 checks / failures 0 / errors 0, 모든 baseline/offline 차이 0, exit 0. 처음 navigation과 동시 실행한 visual은 8765 포트 충돌로 시작하지 못했고 navigation 종료 후 단독 실행했다. 기준 이미지 재생성 없음.
- `node server/benchmark.cjs`: exit 0. Node v26.13.0 / SQLite 3.54.0 / Intel Core i7-9750H 2.60GHz / RAM 31.77GiB.
- 생성: events 1,500,000 / worklogs 200,000 / change_log 1,250,000 (기존 합성 시드에 추가한 수). 총 실행 828,072.54ms. DB 본체 1,769,005,056 bytes. 산출물 `app/server/.benchmark/results.json`, Git 제외.
- 조회 p95: weekly 1.1304ms, projects 0.2517ms, reviews 0.2984ms. 이벤트 SQL 1,000행 삽입 p95 377.9125ms. 이벤트 루프 지연 max 24.3794ms / p95 20.9060ms.
- **한계**: 페이지 삽입은 기존 benchmark의 SQL 배치이고 sources/cursor/Run/queue 포함 Collector 전체가 아니다. 루프 지연은 생성 단계 전체가 아니라 조회 단계 측정이다. 실제 Drive 성능·전체 snapshot UI 확장성을 입증하지 않는다.
- `git diff --check`는 기존 `CLAUDE.md:114` EOF 빈 줄 경고만 남았다. 보호 tracked 경로 diff는 비어 있다. 기존 미추적 synthetic-large.json을 포함한 파일을 Git 기준선으로 불변 입증했다고 과장하지 않는다.

아래는 현재 **전체 작업 트리**의 `git diff --stat`이며 이번 차수만의 통계가 아니다. 미추적 서버·문서는 포함하지 않는다.

```text
 .gitignore                       |   2 +
 AGENTS.md                        |  77 ++++++++++++++++++
 CLAUDE.md                        |  17 ++++
 app/.gitignore                   |  10 +++
 app/app.js                       | 169 ++++++++++++++++++++++++++++++++-------
 app/package.json                 |  22 ++++-
 app/src/app.ts                   | 130 +++++++++++++++++++++++-------
 app/src/model.js                 |   4 +-
 app/styles.css                   |   3 +
 docs/02-decisions-needed.md      |   4 +-
 docs/decisions/README.md         |   6 +-
 docs/migration/open-decisions.md |   5 ++
 tasks/backlog.md                 |  25 ++++--
 tasks/current-state.md           | 133 +++++++++++++++++++++++++++++-
 14 files changed, 531 insertions(+), 76 deletions(-)
```
# Apps Script 경로 (2026-11-19 AX-Builder)

ADR-015 변경 절에 따라 `apps-script/Code.gs`와 매니페스트, 한국어 설치 안내를 추가했다. 고급 서비스 없이 UrlFetchApp과 실행자 OAuth 토큰으로 REST를 호출한다. 스코프는 metadata.readonly·activity.readonly·script.external_request 세 개, 배포는 USER_DEPLOYING/MYSELF다. AX-TF 이름·ID를 확인하고 파일(폴더 포함)·활동 페이지 전체와 시작 변경 토큰을 JSON으로 반환한다. 기본 14일, 최대 90일이며 429/5xx 백오프와 5분 이후 다음 요청 중단·이어받기 토큰을 구현했다. fields 마스크는 Node vm 테스트에서 기존 client.cjs/model.cjs와 문자 단위로 비교한다.

사용자 절차: script.google.com 새 프로젝트 → Code.gs 붙여 넣기 → 프로젝트 설정의 appsscript.json 표시 → 매니페스트 붙여 넣기 → 새 배포/웹 앱/나/나만 → 권한 승인 → `/exec?driveId=<AX-TF ID>&since=YYYY-MM-DD` 열기 → 브라우저에서 JSON을 다른 이름으로 저장 → ACL 보호 `app/server/.pilot/imports/`로 이동 → `app/`에서 AX_DRIVE_ID 설정 후 `npm run drive:import -- server/.pilot/imports/<파일>.json` → `drive:structure-draft`. 상세 안내는 `app/server/connectors/drive/apps-script/README.md`에 있다.

가져오기는 OAuth·네트워크 없이 DriveClient의 fetch 주입으로 기존 Collector·Store를 재생한다. files.get은 내보낸 파일 목록, changes는 빈 변경과 저장된 시작 토큰을 반환한다. 기존 범위 검사·action×target 분해·중복 방지·사람 후보 대조·Review 생성이 유지된다. 전체 스냅샷 재생 옵션은 기존 OAuth 수집의 기본 동작을 바꾸지 않는다. 입력은 imports 내부 .json, ACL 검사, 엄격 UTF-8, 32 MiB 상한, 형식/버전/고정 드라이브 ID 검증을 거친다. 기존 `.pilot/` Git 제외 규칙이 imports에도 적용됨을 `git check-ignore`로 확인했다. 성공 후 원본 삭제, --keep 유지, 토큰 없는 통계 출력을 지원한다. truncated는 경고와 Run의 기간·페이지 수로 기록하고 누락 파일 재조정은 하지 않는다.

한계: **실제 Apps Script 실행은 미검증**이다. 실제 Google API 호출·실데이터·자격 증명 접근은 하지 않았다. 조직 정책과 기본 프로젝트의 API 사용 가능 여부는 사용자가 실행할 때 확인해야 한다. 플랫폼의 강제 실행 종료는 JSON 반환을 보장하지 못한다. 이어받기 결과는 앞 페이지를 포함하지 않으므로 완전한 스냅샷은 로컬에서 페이지를 합쳐야 한다. 조각만 가져오면 해당 파일 목록에 없는 활동 대상은 제외된다. 권한·경로는 마지막 가져오기 시점의 메타데이터 기준이다.

## F3 잔여 수정

확정 판단 이력의 `signals.folderPath`와 상위 이동 후 하위 CSV의 과거 경로 노출을 각각 테스트로 재현했다. 수정 전 2/2 실패, 수정 후 통과했다. visibility.cjs의 currentPath는 저장된 folderPath를 읽지 않고 현재 parents 체인을 순회한다. available이 아닌 조상·누락·순환은 `(접근 불가 폴더)`로 표시한다. 판단 이력·열린 제안·Source 뷰·CSV가 같은 함수를 사용하고 CSV 프로젝트 이름도 같은 이름 마스킹 규칙을 적용한다. 원본 signals와 감사 이력은 변경하지 않는다.

## 이번 차수 검증 및 변경 파일

- `npm.cmd test`: 43/43, 전체 `npm.cmd run test:server`: 52/52(신규 8 포함), typecheck exit 0.
- navigation 88/88, visual 54/54, 모든 baseline/offline 픽셀 차이 0. 기준 이미지 재생성 없음. visual 첫 실행은 navigation과 8765 포트 충돌로 실패했으며 navigation 종료 후 단독 실행 통과.
- `npm.cmd run build`는 python PATH 없음으로 실패. 설치된 python3.15 trampoline은 샌드박스 안에서 permission denied. 권한 검토 후 같은 `build.py`를 설치된 Python으로 실행해 exit 0, offline preview 생성 확인.
- 서버 전체 검증은 3회 범위에서 종료했다. 마지막 공통 이름 함수 정리 후 영향 범위 테스트도 실행했다. 새 의존성·디자인 변경·Git commit/push·추가 위임 없음. 보호 파일 직접 편집 없음. git diff --check는 기존 CLAUDE.md EOF 공백 경고가 남는다.
- 변경: app/package.json; app/server/connectors/drive/{cli,collect,import,store,structure,visibility}.cjs; app/server/connectors/drive/apps-script/{Code.gs,appsscript.json,README.md}; app/server/service/index.cjs; app/server/tests/{drive-apps-script,drive-export,drive-import}.test.cjs; 이 보고서; tasks/current-state.md.

다음: AX-Lead 완료 검증과 AX-Reviewer 독립 검토 후 사용자 본인이 Apps Script를 배포·실행한다. 이 차수는 실제 계정 동작이나 실수집 완료를 주장하지 않는다.

