# Apps Script로 AX-TF 메타데이터 가져오기

회사 GCP 프로젝트 권한 없이 본인 계정에서 실행하는 임시 경로입니다. 실제 Apps Script 배포·실행은 아직 검증하지 않았습니다. 조직 정책에 따라 Apps Script 또는 Drive Activity API 사용이 차단될 수 있습니다. 이 경우 회사 관리자에게 허용 여부를 확인하세요.

## 1. 스크립트 만들기

1. AX-TF 멤버인 회사 계정으로 https://script.google.com 에 접속해 **새 프로젝트**를 누릅니다.
2. 기본 `Code.gs` 내용을 지우고 이 폴더의 `Code.gs` 전체를 붙여 넣어 저장합니다.
3. 왼쪽 **프로젝트 설정**에서 **편집기에 appsscript.json 매니페스트 파일 표시**를 켭니다.
4. 편집기로 돌아가 `appsscript.json` 전체를 이 폴더의 같은 파일 내용으로 바꿔 저장합니다. 스코프는 메타데이터·활동 읽기와 외부 요청 세 개입니다.
5. **API 켜기**: 왼쪽 **서비스 +**에서 **Drive API**(v3)와 **Drive Activity API**(v2)를 차례로 추가합니다. 스크립트는 이 서비스 객체를 쓰지 않고 REST로 직접 호출하지만, 기본 프로젝트에서 서비스를 추가해야 해당 API가 켜집니다([공식 안내](https://developers.google.com/apps-script/guides/services/advanced)). 추가 후 `appsscript.json`의 `oauthScopes`가 위 세 개 그대로인지 다시 확인하고, 바뀌었으면 이 폴더의 내용으로 되돌려 저장합니다.
6. **배포 > 새 배포 > 유형 선택 > 웹 앱**을 선택합니다. **실행 사용자: 나**, **액세스 권한이 있는 사용자: 나만**으로 설정하고 배포합니다.
7. 본인 계정에서 권한을 승인합니다. 파일 내용이나 권한 목록을 읽는 스코프가 추가로 표시되면 매니페스트를 다시 확인합니다.

## 2. 결과 저장

1. 공유 드라이브 AX-TF를 브라우저로 열었을 때 주소의 `/folders/` 뒤 ID가 드라이브 ID입니다. **이 ID가 AX-TF를 식별하는 기준**입니다. 결과 JSON의 `driveName`은 참고용입니다(공유 드라이브 최상위 폴더 이름이 드라이브 표시 이름과 같다는 공식 보장이 없어 이름으로 차단하지 않습니다). 첫 실행 결과의 `driveName`을 보고 맞는 드라이브인지 눈으로 확인하세요.
2. 배포된 웹 앱 주소(`/exec`)에 `?driveId=<AX-TF ID>&since=YYYY-MM-DD`를 붙여 본인 계정 브라우저에서 엽니다. `<AX-TF ID>`와 날짜는 실제 값으로 바꿉니다. `since`를 생략하면 최근 14일이고 최대 90일입니다.
3. JSON이 표시되면 브라우저의 **다른 이름으로 저장**으로 `ax-drive-export.json`을 저장합니다. HTML이 아니라 JSON 본문이어야 합니다. `error`가 있으면 가져오지 말고 ID·날짜·권한을 확인합니다. `Drive API or Drive Activity API is not enabled`가 나오면 1-5단계(서비스 추가)를 다시 합니다. **첫 실행은 한 번에 끝난 완전한 결과만 씁니다.** 결과에 `truncated`·`resume`·`partial`이 있으면 `drive:import`가 거부합니다. 이때는 `since`를 더 짧게(예: 최근 7일) 해서 다시 내보냅니다.
4. 프로젝트의 `app/`에서 `npm run drive:secure-dirs`를 실행합니다. `app/server/.pilot/imports/` 폴더를 만든 뒤 JSON을 이 폴더에 옮깁니다. 이 폴더는 Git 제외이며 `.pilot`의 ACL 보호를 상속합니다. `npm run drive:check-dirs`로 확인합니다. ACL 오류가 나면 가져오기는 중단됩니다.

```powershell
cd app
$env:AX_DRIVE_ID = '<AX-TF ID>'
npm run drive:import -- server/.pilot/imports/ax-drive-export.json
npm run drive:structure-draft
```

처음 지정한 ID는 `.pilot/drive-config.json`과 DB에 고정됩니다. 다른 ID는 거부됩니다. 가져오기는 OAuth 설정이나 Google 접속 없이 작동합니다. 정상 처리 후 원본 JSON은 삭제됩니다. 유지하려면 명령 끝에 `--keep`을 붙입니다. 결과의 이벤트·Review·사람 후보 수는 DB 누적 수이며 파일·폴더·활동·다른 드라이브 제외 수는 이번 JSON 기준입니다. 구조 CSV는 `.pilot/structure-draft.csv`에 저장되며 기존 파일을 덮어쓰지 않습니다.

## 중단과 제한

약 5분이 지나면 다음 요청 전에 중단하고 `truncated: true`와 `resume`에 다음 페이지 토큰을 넣습니다. 429/5xx는 지수 백오프로 최대 4회 시도합니다. 개별 요청이 플랫폼 실행 제한을 초과하거나 서비스 자체가 종료되면 JSON을 반환하지 못할 수 있습니다.

**지금은 이어받기 결과를 가져올 수 없습니다.** 중단(`truncated`)되거나 이어받은(`partial`) 결과는 완전한 목록이 아니어서, 가져오면 멀쩡한 파일을 누락으로 판정할 수 있기 때문입니다. `drive:import`가 이런 파일을 거부합니다. 시간이 모자라면 `since`를 더 짧게 해서 한 번에 끝나는 범위로 다시 내보내세요. 여러 조각을 합치는 기능은 필요해지면 따로 만듭니다.

파일 내용·공유 대상 목록·댓글 본문은 요청하지 않습니다. 내보낸 JSON에는 파일 이름·사용자 정보가 있으므로 보호 폴더 밖에 남은 다운로드 사본도 사용자가 정리하세요. 사용자에게 보여 줄 경로는 저장된 문자열 대신 로컬 DB의 현재 부모 체인으로 계산합니다. 이 내보내기는 해당 시점의 스냅샷이며 이후 권한·이동 변화는 새 내보내기를 가져와야 반영됩니다.
