---
name: video-read
description: "영상(유튜브·jwplayer·mp4)을 노버스 서재에 '쪽이 있는 책'으로 넣고 원문 → 교정본 → 한국어 번역 → 주제 목차 → 독후감까지 만든다. 장면 캡처 + 자막(없으면 로컬 STT)을 구간별 쪽으로 올리는 것은 scripts/video-ingest.mjs, 그다음은 노버스 MCP. \"영상 정리\", \"영상 요약\", \"이 영상 서재에\", \"영상 번역\", \"영상 독후감\", \"video read\", \"강연 정리\" 에 반응."
argument-hint: "<영상 URL 또는 mp4 경로> [--space <스페이스>]"
---

# video-read — 영상을 서재에 넣고 책처럼 정리

> 영상 URL → **쪽**(장면 구간) → 교정본 → 번역(ko) → 목차 → 독후감.
> 서버 쪽 순서·규칙(근거 표기 `(mm:ss)`, 교정 범위, 독후감 템플릿)은 **노버스 MCP 지침이 정본**이다 —
> 여기는 로컬 작업(받기·STT·장면·업로드)과 발화 조건만 갖는다. 계약: knoverse-engineering `specs/video-library`.

## 0. 준비 확인

```bash
which ffmpeg ffprobe yt-dlp        # yt-dlp 는 jwplayer·mp4 파일이면 없어도 된다
python3 -c "import mlx_whisper"    # 맥. 아니면: python3 -c "import faster_whisper"
```

- STT 패키지가 없으면 설치를 권한다 — 맥 `pip install mlx-whisper`, 그 밖 `pip install faster-whisper`.
  다른 파이썬에 깔려 있으면 `KNOVERSE_WHISPER_PY=<그 python>` 로 가리킨다
- 자막 트랙이 있는 영상이면 STT 없이도 된다 (스크립트가 먼저 자막을 찾는다)

## 1. 쪽으로 넣기 — 스크립트

```bash
node "$(dirname "$(find "${FLEET_ROOT:-$(git rev-parse --show-toplevel)}" \
  -path '*/plugins/knoverse/scripts/video-ingest.mjs' | head -1)")/video-ingest.mjs" --url "<URL>" [--space "<스페이스 이름>"] [--dry-run]
```

- `--dry-run` 이면 받고·STT·장면까지 하고 올리지 않는다. 쪽 수와 빈 쪽 수를 먼저 보여 준다
- 끝나면 `itemId` 를 출력한다. 중단돼도 같은 명령을 다시 돌리면 이어간다(작업 폴더의 `state.json`)
- 강의처럼 장면이 드문 영상은 쪽이 길어진다 → `--max-sec 120`. 인터뷰처럼 컷이 잦으면 `--min-sec 60`
- **화자**: 원문 줄에 `A:`·`B:` 가 화자가 바뀔 때 붙는다 (sherpa-onnx, 무료·오프라인. 맥 70분 ≈ 수 분).
  🔴 **화자 수를 알면 `--speakers 2` 를 준다** — 자동은 과분할된다 (2인 인터뷰가 11명으로 나왔다, 2026-10-20).
  한 사람 강연이면 `--no-speakers`

## 2. 그다음 — MCP

`get_book_context(itemId)` 로 kind=video 를 확인하고 **MCP 지침의 영상 순서**를 따른다:
교정본 → 번역(ko) → 목차(주제) → (요약) → 독후감(`tech-essay`·`lit-essay`).

- 🔴 **교정본은 STT 오인식만 고친다** — 특히 고유명사. 실측(2026-10-20 70분 인터뷰)에서 35곳이었다
  (Huang→"Wong", Claude→"Quad", Kimi→"Kimmy", H20·H200→"age 20, age 200"). `get_page_image` 로 화면 자막·슬라이드를 대조한다
- **교정본에서 화자 글자를 이름으로 바꾼다** — 원문 몇 쪽을 읽어 A·B 가 누구인지 정한 뒤
  `video-speakers.mjs --url <URL> --names "corrected=Mike Allen,Jensen Huang" --names "ko=마이크 앨런,젠슨 황"`.
  번역 뒤에 돌려도 된다(시각으로 맞춘다 — 다시 번역하지 않는다). 확신이 없으면 글자 그대로 둔다
- 번역은 `[mm:ss]` 와 `이름:` 을 그대로 둔다
- 번역은 쪽이 많으면 서브에이전트에 쪽 범위로 나눠 맡긴다 — `[mm:ss]` 줄을 하나도 빼지 말고 그대로 두라고 넘긴다
- 공개 영상이어도 결과는 **비공개 스페이스**에 둔다. 팀·공개로 옮기거나 내보내라는 요청이면 그때 권리를 묻는다

## 끝에 보고할 것

| 무엇 | 숫자 |
|---|---|
| 쪽 | N쪽 · 원문 출처(`caption`/`stt`) · 엔진 · 화자 N명 |
| 교정본 | 고친 곳 수 |
| 번역 | ko N쪽 · stale 0 |
| 독후감 | 문서 제목 · 콘솔 링크 |
