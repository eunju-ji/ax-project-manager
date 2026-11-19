# M1-04 연동 문서 조사: Drive · Calendar · GitHub · Chat

> 작성: AX-Lead, 2026-11-19 · 게이트 G0(공식 문서 조사만, 실데이터·계정 접근 없음)
> 결정 대상: OD-05 (파일럿 소스 2개 이상 선정) · 관련: ADR-004(SourceEvent), ADR-007(보호), ADR-010(게이트)
> 상태: v2(AX-Reviewer 검토 반영)
> 표기: **[문서 확인]** 공식 문서 검색 결과로 확인 · **[가정]** 경험·추론, PoC 검증 필요

## 1. 요약
| 소스 | 변경 감지 | 실행자(누가) 정보 | 최소 권한 후보 | 개인정보 위험 | 파일럿 적합도 |
|---|---|---|---|---|---|
| Drive | `changes.watch`/`files.watch` 푸시(알림 본문은 비어 있고 후속 조회 필요), `changes.list` 페이지 토큰 [문서 확인] | Drive Activity API v2 활동 이력. 활동 하나에 행위자·동작·대상이 여러 개일 수 있음 [문서 확인] | `drive.metadata.readonly` + `drive.activity.readonly`, **둘 다 Restricted** [문서 확인] | 중 (파일명·공유 범위) | **높음** |
| GitHub | Webhook `push`·`pull_request` 등 [문서 확인] | 커밋 author/committer/pusher, PR 작성자·리뷰어. 셋이 다를 수 있고 봇도 있음 [가정: 표준 페이로드] | GitHub App, Contents read(push), Pull requests read(pull_request) [문서 확인] | 승인된 저장소 범위·보존 필드에 따라 평가 (일반화 금지) | **높음** |
| Calendar | `syncToken` 증분 동기화(삭제 포함, 410이면 전체 재동기) [문서 확인], `events.watch` 채널(만료 있음) [문서 확인: 필드만] | 주최자·참석자 [가정] | `calendar.events.readonly` [가정: 스코프 목록 미확인] | 중~높음 (비공개 일정·참석자) | 중 |
| Chat | Workspace Events API 구독 [문서 확인] | 메시지 작성자 [가정] | `chat.messages.readonly`(**Restricted**) [문서 확인] | **높음** (대화 원문) | 낮음(후속) |

**권고: 파일럿 소스 = Drive + GitHub.** 문서 활동과 개발 활동이라는 서로 다른 근거를 시험할 수 있고, 명시적 태스크 참조 시나리오를 검증하기 좋다. 단 **Drive 이벤트 정규화와 GitHub 실행자 해석**이 핵심 PoC 위험이다. Calendar는 3순위 후보, Chat은 ADR-005·007 취지(대화 원문 최소화)에 따라 후속으로 미룬다.

> Restricted 스코프는 Drive 후보에도 해당한다. 앱 검증·보안 심사가 실제로 적용되는 조건(내부 앱 여부, 배포 방식)은 G1 전에 확인한다.

## 2. 근거

### 2.1 Drive
- 이벤트를 받는 방법은 두 가지다. `changes.watch`(사용자 단위)·`files.watch`(파일 단위) 푸시 알림은 변화가 있었다는 **신호**를 webhook으로 보낸다. 알림 본문은 비어 있어 변경 내용은 후속 조회로 가져와야 한다([Drive 푸시 알림](https://developers.google.com/workspace/drive/api/guides/push)). Drive Activity API는 상세 활동 이력을 조회하며 감사 용도에 맞다. Workspace Events API(Pub/Sub)도 별도 경로로 있다. — [Work with events from Google Drive](https://developers.google.com/workspace/drive/api/guides/events-overview), [changes.watch](https://developers.google.com/workspace/drive/api/reference/rest/v3/changes/watch)
- `changes.watch`는 `drive.metadata.readonly` 같은 읽기 전용 메타데이터 스코프로도 쓸 수 있다. Google은 앱이 동작하는 가장 좁은 스코프를 권장한다. — [Choose Drive API scopes](https://developers.google.com/workspace/drive/api/guides/api-specific-auth)
- Drive Activity API v2 스코프는 `drive.activity` / `drive.activity.readonly`. — [Migrate from Drive Activity API v1](https://developers.google.com/workspace/drive/activity/v2/migrating)
- DriveActivity 1건에는 행위자·동작·대상이 여러 개 들어 있을 수 있고, 시각이 시점 또는 범위로 표현된다. 그래서 우리 SourceEvent는 (동작 × 대상) 단위로 분해한다(M1-01 §2.1). — [Drive Activity 데이터 모델](https://developers.google.com/workspace/drive/activity/v2/datamodel)
- `drive.metadata.readonly`, `drive.activity.readonly`는 Restricted 스코프로 분류된다. — [Choose Drive API scopes](https://developers.google.com/workspace/drive/api/guides/api-specific-auth)
- 우리 설계와의 대응:
  - Source = 파일(파일 ID + 계정 범위), SourceEvent = Activity API 활동 1건(행위자·시각·동작 유형) → ADR-004 이벤트 보존 계약과 잘 맞는다.
  - Changes 알림은 "변화가 있다"는 트리거로, Activity API는 "누가 무엇을" 기록으로 함께 쓰는 구성 [가정].
- 리스크: Activity 이력의 행위자 표기 범위·보존 기간, 공유 드라이브와 개인 드라이브의 차이, 푸시 채널 만료·재등록 [가정, PoC 확인].

### 2.2 GitHub
- push 이벤트를 구독하려면 GitHub App에 최소 Contents **read** 권한이 필요하다. — [Webhook events and payloads](https://docs.github.com/en/webhooks/webhook-events-and-payloads)
- 권한 모델: GitHub App과 fine-grained PAT가 같은 권한 체계를 쓰며, 응답 헤더 `X-Accepted-GitHub-Permissions`로 필요한 권한을 확인할 수 있다. — [Permissions required for GitHub Apps](https://docs.github.com/en/rest/authentication/permissions-required-for-github-apps), [Troubleshooting the REST API](https://docs.github.com/en/rest/using-the-rest-api/troubleshooting-the-rest-api)
- `pull_request` 이벤트는 Pull requests **read** 권한으로 구독할 수 있다. 공식 튜토리얼의 read & write는 댓글 작성 기능 때문이다. — [pull_request 이벤트](https://docs.github.com/en/webhooks/webhook-events-and-payloads#pull_request), [Building a GitHub App that responds to webhook events](https://docs.github.com/en/apps/creating-github-apps/writing-code-for-a-github-app/building-a-github-app-that-responds-to-webhook-events)
- Webhook 수신 시 서명(`X-Hub-Signature-256`) 검증과 delivery ID 기반 재전송 중복 방지가 필요하다. — [Validating webhook deliveries](https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries), [Best practices for using webhooks](https://docs.github.com/en/webhooks/using-webhooks/best-practices-for-using-webhooks)
- 우리 설계와의 대응: 커밋 SHA·PR 번호는 안정적인 원본 ID다. 커밋 메시지·PR 본문의 **명시적 태스크 ID 참조**는 OD-14의 1순위 판별 근거가 된다. author·committer·pusher가 다를 수 있고 봇 계정도 있다. 계정 매핑과 실행자 확인을 구분한다(M1-03 §2 실행자). 이벤트 키는 저장소 ID와 커밋 SHA·PR 번호로 만들고, delivery ID는 수신 중복 방지에만 쓴다(M1-01 §2.1).
- 리스크: Webhook 수신 엔드포인트가 필요하다(OD-09 실행 환경과 연결). 수신 누락에 대비한 REST 재조회가 필요하다 [가정].

### 2.3 Calendar
- 증분 동기화: 최초 전체 동기화로 `syncToken`을 받아 저장하고, 이후 그 토큰으로 변경분만 받는다. 결과에는 삭제 항목도 포함된다. 토큰이 무효화되면 HTTP 410이 오고, 이때는 전체 재동기화를 한다. `syncToken`은 `timeMin`/`timeMax`/`q` 등과 함께 쓸 수 없다. — [Synchronize resources efficiently](https://developers.google.com/workspace/calendar/api/guides/sync), [Events: list](https://developers.google.com/workspace/calendar/api/v3/reference/events/list)
- `events.watch` 채널은 만료 시각이 있다(요청 필드 확인). 설정 가이드와 스코프는 이번 조사에서 확인하지 못했다 → PoC 전 재확인.
- 판단: 회의는 "참석"이지 "작업 내역"이 아니다. 근거로는 유용하지만 WorkLog를 직접 만들면 건수가 부풀 위험이 있다. 비공개 일정·참석자 정보 노출 정책(ADR-007)을 먼저 정해야 한다.

### 2.4 Chat
- 사용자 인증으로 메시지를 조회하려면 `chat.messages.readonly` 또는 `chat.messages`가 필요하다. `chat.messages.readonly`는 **Restricted** 스코프로 분류된다. — [List messages](https://developers.google.com/workspace/chat/list-messages), [spaces.messages.list](https://developers.google.com/workspace/chat/api/reference/rest/v1/spaces.messages/list), [OAuth 2.0 Scopes](https://developers.google.com/identity/protocols/oauth2/scopes)
- 앱 인증용 `chat.app.messages.readonly`는 관리자 승인과 서비스 계정이 필요하다. 이 경우 앱이 접근할 수 있는 space의 public messages만 반환하고 private messages는 빠진다(인터넷 공개라는 뜻이 아님). — [Authenticate and authorize Chat apps](https://developers.google.com/workspace/chat/authenticate-authorize)
- Workspace Events API로 메시지 이벤트를 구독할 때도 같은 메시지 스코프가 필요하다. — [Choose Workspace Events API scopes](https://developers.google.com/workspace/events/guides/auth)
- 판단: 대화 원문을 다루므로 ADR-005·007 취지상 위험이 가장 크다. 앱 검증 부담도 있을 수 있다 [가정]. 후속으로 미룬다.

## 3. 공통 리스크와 PoC 검증 항목 (M2)
1. **채널·토큰 수명**: Drive/Calendar 푸시 채널 만료와 재등록, Calendar 410 전체 재동기, Drive 페이지 토큰 저장. → "갱신 실패"와 "업무 변경"을 구분해 표시(OD-11).
2. **중복 수신**: 푸시와 재조회가 겹치면 같은 이벤트가 두 번 들어온다 → SourceEvent 키로 식별 중복 제거(ADR-004 멱등성).
3. **실행자 정확도**: Drive Activity 행위자, GitHub author/committer의 계정 매핑(외부 ID ↔ 사람). 매핑되지 않으면 "미상"으로 둔다(L02).
4. **실행 환경 의존**: Webhook 수신에는 공개 HTTPS 엔드포인트가 필요하다. Apps Script만으로 처리할 수 있는지, 경량 백엔드가 필요한지는 OD-09 판단 기준이다 [가정].
5. **권한 범위 표시**: 화면에 "어떤 계정·범위에서 수집했는지"를 보여 준다(N03 필수 기능).
6. **수신 보안**: GitHub webhook 서명 검증·재전송 중복 방지, Drive 알림 채널 토큰 검증, 수집 범위 밖 데이터 거부. 외부 수신을 열기 전(G1) 필수.
7. **외부 텍스트 주입**: 커밋 메시지·문서 제목 등 외부 텍스트를 LLM 지시로 취급하지 않는다(M1-03 §5).

## 4. 결정 요청
- **OD-05**: 파일럿 소스를 **Drive + GitHub**로 확정할지(권고), 또는 Drive + Calendar로 할지.
- G1·G2 승인은 별도다. 이번 조사는 실제 앱 등록·OAuth 동의·저장소 연결을 하지 않았다.
