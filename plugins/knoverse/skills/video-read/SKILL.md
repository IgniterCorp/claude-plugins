---
name: video-read
description: "영상(유튜브·jwplayer·mp4)을 노버스 서재에 '쪽이 있는 책'으로 넣고 원문 → 교정본 → 한국어 번역 → 주제 목차 → 독후감까지 만든다. 절차·도구·원어 선택의 정본은 노버스 MCP get_playbook(video-read). \"영상 정리\", \"영상 요약\", \"이 영상 서재에\", \"영상 번역\", \"영상 독후감\", \"video read\", \"강연 정리\" 에 반응."
argument-hint: "<영상 URL 또는 mp4 경로> [--item <항목 id>] [--space <스페이스>] [--language auto|언어코드]"
---

# 영상 읽기 — 서버 플레이북

1. 연결된 노버스 MCP에서 `get_playbook("video-read")`를 받는다.
2. 반환된 본문의 준비·검증·실행·교정·번역 순서를 그대로 따른다. 로컬 스크립트 사본이나 모델별 별도 옵션을 만들지 않는다.
3. 원어를 아는 사용자는 추출 전에 지정할 수 있다 (`--language ko`, `en`, `ar`, 지역 코드도 지원). 자동 확인이 기본이다. 번역 목표 언어와 구분한다.
4. 원어 불명·충돌·무음 상태를 성공으로 보고하거나 임의 언어 자막으로 대체하지 않는다.
5. 도구 404/버전 변경이면 플레이북을 다시 받아 준비 단계부터 실행한다. 해시 불일치·다운로드 실패 시 실행하지 않는다.

이전 직접 실행 주소 `scripts/video-ingest.mjs`와 `video-speakers.mjs`도 이제 같은 서버 `get_playbook`과 해시 검증 runner로 연결한다. Node 22+ 및 `KNOVERSE_TOKEN`이 필요하다. 오래된 설치본은 `/plugin update knoverse@igniter`로 갱신한다.
