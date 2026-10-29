# knoverse

[노버스](https://knoverse.im) 서재에 책·영상을 넣고, 장별 요약·발표자료·독후감을 만드는 Claude Code 플러그인입니다.
생성은 이 Claude Code 세션이 하고, 노버스 서버는 저장·검증만 합니다.

## 설치

```
/plugin marketplace add IgniterCorp/claude-plugins
/plugin install knoverse@igniter
```

## 처음 한 번

1. 노버스 콘솔 「설정 › MCP 연결」에서 `kn_mcp_` 토큰을 발급합니다 (발급 화면에서 한 번만 보입니다).
2. MCP 서버를 붙입니다.
   ```
   claude mcp add --transport http --scope user knoverse https://api.knoverse.im/mcp --header "Authorization: Bearer <kn_mcp_ 토큰>"
   ```
3. 스크립트(영상·PDF 올리기)가 쓸 토큰을 둡니다.
   ```
   mkdir -p ~/.config/knoverse && echo 'KNOVERSE_TOKEN=<kn_mcp_ 토큰>' > ~/.config/knoverse/env && chmod 600 ~/.config/knoverse/env
   ```
   다른 위치를 쓰려면 `KNOVERSE_ENV=<파일>`, 아니면 환경변수 `KNOVERSE_TOKEN` 을 직접 줍니다.

## 스킬

| 스킬 | 하는 일 | 필요한 것 |
|---|---|---|
| `video-read` | 영상(유튜브·jwplayer·mp4)을 장면 구간별 쪽으로 올리고 → 교정본 → 번역 → 목차 → 독후감 | `ffmpeg` · `ffprobe`, 유튜브면 `yt-dlp`, 자막이 없으면 `mlx-whisper`(맥) 또는 `faster-whisper` + `webrtcvad-wheels` |
| `ingest` | PDF 한 권을 등록 → 원문 업로드 → 쪽 이미지 → 글자 읽기까지 | `pdfinfo` (poppler) |
| `summarize-chapters` | 서재의 책을 장별로 요약해 저장 | MCP |
| `doc-make` | 책 한 권에서 발표자료·핸드아웃·독후감을 만들어 저장 | MCP |

스크립트를 직접 돌릴 수도 있습니다.

```
node <플러그인 경로>/scripts/video-ingest.mjs --url https://www.youtube.com/watch?v=... --dry-run
```

## 문제가 생기면

- `401` — 토큰이 폐기됐거나 틀렸습니다. 콘솔에서 다시 발급합니다.
- MCP 툴이 안 보이면 `claude mcp list` 로 `knoverse` 가 붙었는지 봅니다.

영상 직접 실행도 서버 get_playbook → 동일 버전 도구 SHA256 검증 → 실행 경로를 사용합니다. 원어는 `--language auto|ko|en|ar|…`로 추출 전에 선택합니다.

0.3.0 릴리스는 tools manifest/runner를 제공하는 knoverse-engineering 서버 변경 이후에 합니다. 이전 exporter가 사본 수집 코드를 복원하지 않게 `node scripts/check-knoverse-bootstrap.mjs`를 릴리스 전에 실행합니다. 별도 레포 통합 검사는 서버 레포의 `KNOVERSE_PLUGIN_CHECKOUT=<이 레포> ... video-clients.check.ts`로 수행합니다.
