# ADR-009 생성물 Git 추적

- 상태: 승인 (2026-11-19) · 출처: OD-12
- 결정: `app/app.js`, `app/data.js`는 개발 서버 실행에 필요하므로 Git에서 추적한다. 소스와 동기 상태인지는 빌드 후 diff로 검증한다. `build.py`가 만드는 `preview/`(이미지 base64가 포함된 대용량 HTML)는 루트 `.gitignore`로 제외한다.
