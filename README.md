# IgniterCorp Claude Code plugins

```
/plugin marketplace add IgniterCorp/claude-plugins
/plugin install <플러그인>@igniter
```

| 플러그인 | 하는 일 |
|---|---|
| [knoverse](plugins/knoverse) | 노버스 서재에 책·영상을 넣고 장별 요약·발표자료·독후감을 만든다 |

영상 수집 절차와 구현의 정본은 knoverse-engineering 서버의 `get_playbook("video-read")`입니다.
knoverse 0.3.0부터 영상 진입점은 서버 도구를 해시 검증해 실행합니다. 수집 코드를 이 레포에 다시 복사하지 않습니다.
이전 설치는 `/plugin update knoverse@igniter`로 갱신합니다. 공개 릴리스·마켓 갱신은 별도입니다.

기존 내보내기 자동화가 있다면 이 얇은 진입점과 스킬을 보존해야 합니다. 과거 harness 내보내기를 그대로 실행하면 구판이 복원됩니다.
그 자동화 원본은 이 레포에 포함되어 있지 않습니다.

`node scripts/check-knoverse-bootstrap.mjs`와 PR 워크플로가 서버 진입점 유지 및 해시/다운로드 실패를 검사합니다. 실제 서버 도구와의 통합은 knoverse-engineering 동반 PR에서 Codex MCP/Claude MCP/플러그인의 SHA256·정규화 옵션·언어 결정을 비교했습니다. 릴리스는 서버 변경 이후에 진행합니다.
