# 홈 UI 개편 검증 기록

## 기준 이미지 재생성 전 기록

- 사용자 승인: 홈 화면 개편에 따른 기준 이미지 재생성 허용.
- 최초 비교: 54개 중 51개 변경, 모든 개발/오프라인 비교 0 pixels.
- 변경 없는 3개 이미지는 기준을 유지한다.
- 다이얼로그 HTML·기존 포커스 처리는 유지한다. 설정·자료 창 배경에 홈 개편이 비치므로 전체 캡처가 달라진다. 폴더 정보가 없는 기존 자료 창은 동일하게 유지한다.

| 이미지 | 변경 사유 | 변경 픽셀 |
|---|---|---:|
| `linear-notion-1440x900-home.png` | 상단 사람 목록·기간 탭, 목록과 타임라인 통합, 하단 히트맵 | 82299 |
| `linear-notion-1440x900-project.png` | 상단 사람 목록·기간 탭, 목록과 타임라인 통합, 하단 히트맵 | 383014 |
| `linear-notion-1440x900-episode.png` | 상단 사람 목록·기간 탭, 목록과 타임라인 통합, 하단 히트맵 | 289203 |
| `linear-notion-1440x900-sources-bottom.png` | 상단 사람 목록·기간 탭, 목록과 타임라인 통합, 하단 히트맵 | 585863 |
| `linear-notion-1440x900-empty.png` | 상단 사람 목록·요약 기간 탭 추가 | 41972 |
| `linear-notion-1440x900-review.png` | 통합 타임라인 내 프로젝트·태스크 배치 변경 | 245498 |
| `linear-notion-1440x900-settings.png` | 홈 배경 변경(다이얼로그 영역 별도 검사) | 67443 |
| `linear-notion-1440x900-image.png` | 홈 배경 변경(다이얼로그 영역 별도 검사) | 198802 |
| `linear-1440x900-home.png` | 상단 사람 목록·기간 탭, 목록과 타임라인 통합, 하단 히트맵 | 102773 |
| `linear-1440x900-project.png` | 상단 사람 목록·기간 탭, 목록과 타임라인 통합, 하단 히트맵 | 404287 |
| `notion-1440x900-home.png` | 상단 사람 목록·기간 탭·참여자 정렬, 하단 히트맵 | 45130 |
| `attio-1440x900-home.png` | 상단 사람 목록·기간 탭·참여자 정렬, 하단 히트맵 | 15865 |
| `attio-1440x900-project.png` | 상단 사람 목록·기간 탭·참여자 정렬, 하단 히트맵 | 524 |
| `airtable-1440x900-home.png` | 상단 사람 목록·기간 탭·참여자 정렬, 하단 히트맵 | 8212 |
| `clickup-1440x900-home.png` | 상단 사람 목록·기간 탭·참여자 정렬, 하단 히트맵 | 15885 |
| `linear-notion-834x1112-home.png` | 상단 사람 목록·기간 탭, 목록과 타임라인 통합, 하단 히트맵 | 201627 |
| `linear-notion-834x1112-project.png` | 상단 사람 목록·기간 탭, 목록과 타임라인 통합, 하단 히트맵 | 383341 |
| `linear-notion-834x1112-episode.png` | 상단 사람 목록·기간 탭, 목록과 타임라인 통합, 하단 히트맵 | 280079 |
| `linear-notion-834x1112-sources-bottom.png` | 상단 사람 목록·기간 탭, 목록과 타임라인 통합, 하단 히트맵 | 384046 |
| `linear-notion-834x1112-empty.png` | 상단 사람 목록·요약 기간 탭 추가 | 155711 |
| `linear-notion-834x1112-review.png` | 통합 타임라인 내 프로젝트·태스크 배치 변경 | 68421 |
| `linear-notion-834x1112-settings.png` | 홈 배경 변경(다이얼로그 영역 별도 검사) | 151060 |
| `linear-notion-834x1112-image.png` | 홈 배경 변경(다이얼로그 영역 별도 검사) | 183686 |
| `linear-834x1112-home.png` | 상단 사람 목록·기간 탭, 목록과 타임라인 통합, 하단 히트맵 | 303387 |
| `linear-834x1112-project.png` | 상단 사람 목록·기간 탭, 목록과 타임라인 통합, 하단 히트맵 | 384468 |
| `notion-834x1112-home.png` | 상단 사람 목록·기간 탭·참여자 정렬, 하단 히트맵 | 215698 |
| `notion-834x1112-project.png` | 상단 사람 목록·기간 탭·참여자 정렬, 하단 히트맵 | 28619 |
| `attio-834x1112-home.png` | 상단 사람 목록·기간 탭·참여자 정렬, 하단 히트맵 | 229550 |
| `attio-834x1112-project.png` | 상단 사람 목록·기간 탭·참여자 정렬, 하단 히트맵 | 115436 |
| `airtable-834x1112-home.png` | 상단 사람 목록·기간 탭·참여자 정렬, 하단 히트맵 | 279647 |
| `airtable-834x1112-project.png` | 상단 사람 목록·기간 탭·참여자 정렬, 하단 히트맵 | 91288 |
| `clickup-834x1112-home.png` | 상단 사람 목록·기간 탭·참여자 정렬, 하단 히트맵 | 273896 |
| `clickup-834x1112-project.png` | 상단 사람 목록·기간 탭·참여자 정렬, 하단 히트맵 | 48657 |
| `linear-notion-390x844-home.png` | 상단 사람 목록·기간 탭, 목록과 타임라인 통합, 하단 히트맵 | 88548 |
| `linear-notion-390x844-project.png` | 상단 사람 목록·기간 탭, 목록과 타임라인 통합, 하단 히트맵 | 95287 |
| `linear-notion-390x844-episode.png` | 상단 사람 목록·기간 탭, 목록과 타임라인 통합, 하단 히트맵 | 70446 |
| `linear-notion-390x844-sources-bottom.png` | 상단 사람 목록·기간 탭, 목록과 타임라인 통합, 하단 히트맵 | 40513 |
| `linear-notion-390x844-empty.png` | 상단 사람 목록·요약 기간 탭 추가 | 46931 |
| `linear-notion-390x844-review.png` | 통합 타임라인 내 프로젝트·태스크 배치 변경 | 76353 |
| `linear-notion-390x844-settings.png` | 홈 배경 변경(다이얼로그 영역 별도 검사) | 8091 |
| `linear-notion-390x844-image.png` | 홈 배경 변경(다이얼로그 영역 별도 검사) | 41039 |
| `linear-390x844-home.png` | 상단 사람 목록·기간 탭, 목록과 타임라인 통합, 하단 히트맵 | 104351 |
| `linear-390x844-project.png` | 상단 사람 목록·기간 탭, 목록과 타임라인 통합, 하단 히트맵 | 96972 |
| `notion-390x844-home.png` | 상단 사람 목록·기간 탭·참여자 정렬, 하단 히트맵 | 93944 |
| `notion-390x844-project.png` | 상단 사람 목록·기간 탭·참여자 정렬, 하단 히트맵 | 8313 |
| `attio-390x844-home.png` | 상단 사람 목록·기간 탭·참여자 정렬, 하단 히트맵 | 93412 |
| `attio-390x844-project.png` | 상단 사람 목록·기간 탭·참여자 정렬, 하단 히트맵 | 8819 |
| `airtable-390x844-home.png` | 상단 사람 목록·기간 탭·참여자 정렬, 하단 히트맵 | 97608 |
| `airtable-390x844-project.png` | 상단 사람 목록·기간 탭·참여자 정렬, 하단 히트맵 | 3991 |
| `clickup-390x844-home.png` | 상단 사람 목록·기간 탭·참여자 정렬, 하단 히트맵 | 107120 |
| `clickup-390x844-project.png` | 상단 사람 목록·기간 탭·참여자 정렬, 하단 히트맵 | 3763 |

## 구현 범위

1. 작업 내역 수 내림차순·이름순 동적 담당자(task owner 포함).
2. 오른쪽 레일 제거.
3. 머리 오른쪽 사람 목록과 담당자 필터. 좁은 화면에서는 별도 줄에 배치.
4. Linear 두 테마의 목록·월간 타임라인 통합, 상세 펼침·검색·담당자·최신 태스크 정렬 유지. 다른 테마의 기존 목록 유지.
5. 서울 날짜·최근 26주 히트맵, 담당자 필터, 키보드 화살표 이동·Enter 일간 전환.
6. 선택 due_date 매핑, 마감·지연·진척·일정 순수 함수와 단위 테스트.
7. 일간·주간·월간 요약, 기간별 선택·이동·미래 이동 제한.
8. Part B: 폴더 필드와 URL 허용 목록, 경로·이름순 같은 폴더 자료·현재 자료 강조·창 안 전환·폴더/원본 링크. 폴더 정보 없는 자료는 기존 미리보기 유지.

## 실행 환경

- 기존 미커밋 변경 보존, `feat/home-project-timeline` 브랜치. 추가 에이전트·의존성·commit/push 없음.
- `npm run build`는 python PATH 부재로 실패, 설치된 python3.15.exe로 동일 build.py 실행 통과.
- local 지정 포트 8769, 합성 임시 SQLite: 7개 프로젝트·50개 태스크, 담당자 김지현→이수민→박성진, 오른쪽 레일 0개. 실제 데이터 디렉터리 접근 없음.

## 최종 검증

- typecheck exit 0. build.py exit 0(설치된 Python 사용).
- npm test: 49/49. npm run test:server: 65/65.
- npm run test:navigation: 96/96, errors 0(Part B 창 안 전환·포커스 트랩·Esc 복귀 포함).
- 기준 이미지 재생성: 54/54, errors 0. 이어서 일반 npm run test:visual: 54/54, baseline/offline 모든 픽셀 차이 0. 변경된 기준 PNG 51개 및 manifest 갱신, 변경 없는 3개 PNG는 원본 유지.
- 설정·기존 자료 창 내부: 1440×900, 834×1112, 390×844에서 6개 영역 모두 기존 기준 대비 0 pixels. 변경은 뒤의 홈 배경.
- 합성 폴더 미리보기(834×1112), local 데스크톱·모바일 캡처 시각 확인.
- git diff --check 통과. 미해결 오류 없음. 후속: AX-Lead 완료 판정 및 독립 검토.

## 이번 작업 변경 파일

- app/src/app.ts, app/app.js: 홈 UI와 폴더 미리보기.
- app/src/model.js: 사람·진척·마감·요약 기간 순수 함수.
- app/src/adapter.js: dueDate/status 및 folderId/folderPath/folderUrl. 기존 변경 보존.
- app/styles.css: 새 홈·폴더 UI 스타일.
- app/tests/home-model.test.cjs(신규), app/tests/ui.test.cjs, app/tests/visual/run.mjs, app/server/tests/browser.test.cjs.
- app/tests/visual/baseline/: 위 표 51개 PNG 및 manifest.json.
- preview/AX_Project_Manager.html: build.py 생성(기존 Git 제외 정책 유지).
- docs/home-ui-verification.md, tasks/current-state.md.
- 기존 다른 변경 파일은 이번 작업으로 수정하지 않음. 임시 구현·검증 스크립트 제거.
