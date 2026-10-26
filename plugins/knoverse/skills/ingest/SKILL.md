---
name: ingest
description: "PDF 경로 하나를 받아 노버스에 **끝까지** 넣는다 — 책 등록 → 원문 업로드 → 쪽 이미지 → 글자 읽기 → 목차 → 쪽 붙이기. 돌릴 때마다 **체크리스트 명단**이 뜨고 안 된 단계부터 이어진다(서버 상태가 정본이라 중단돼도 그냥 다시 돌리면 된다). 🔴 한국어 책은 텍스트 레이어가 깨져 나오는 경우가 흔해서 **쪽 이미지 → OCR** 이 기본 경로다. 산출물·기록은 ~/.knoverse/<스페이스>/<책>/. 책이 구글 드라이브에 있으면 ⓪절의 rclone 경로로 먼저 받는다 (MCP 다운로드는 base64 라 큰 파일이 못 통과한다). \"책 넣어줘\", \"PDF 넣어줘\", \"인제스트\", \"드라이브에서 책 받아서 올려줘\", \"도서 관리대장\", \"업로드부터 끝까지\", \"knoverse:ingest\" 키워드."
---

# ingest — PDF 한 권을 끝까지 넣는다

> 실체는 [`scripts/ingest.mjs`](../../scripts/ingest.mjs) 다. **이 문서는 판단만 갖는다** —
> 결정적인 연쇄를 프롬프트로 옮겨 적으면 두 벌이 되고 한쪽만 낡는다.

```bash
node "$(dirname "$(find "${FLEET_ROOT:-$(git rev-parse --show-toplevel)}" \
  -path '*/plugins/knoverse/scripts/ingest.mjs' | head -1)")/ingest.mjs" --pdf <경로>
```

인자 — `--pdf <경로>` · `--title` · `--space` · `--item <id>`(이어받기) · `--dry-run` · `--only <단계>`

## ⓪ 원본 바이트를 어디서 가져오나 — 이 스킬은 **로컬 경로**를 받는다

`--pdf` 는 로컬 파일을 가리킨다. 책이 구글 드라이브에 있으면 **먼저 내려받아야 한다.**

**어떤 책이 있나** — 도서 관리대장(구글 시트)이 명단이다. 157행 · 카테고리/하위폴더/제목/저자/
출판사/파일명/쪽수/추가일. 드라이브 폴더 `1Te8wSWPFlzbo2BtpzKirezlkXZ3WyU05` 안에 있고
시트 id 는 `1W5A0B1EjqnNWPISDf1YejU8epuwu1Qaeb2ptZPHFWHc` 다(백업 사본이 여러 개라
**수정일이 가장 최근인 것**을 본다).

🔴 **MCP 드라이브 도구로는 못 받는다.** `download_file_content` 가 **base64 문자열**로 돌려줘서
422MB 파일이면 ~560MB 가 응답에 실린다 — 통과하지 못한다. 그래서 `rclone` 이다.

### 한 번만 — rclone 에 드라이브를 붙인다

대화형 OAuth 라 **에이전트가 못 한다.** 사람이 한 번 돌린다:

```bash
brew install rclone
rclone config create gdrive drive scope=drive.readonly
```

- 브라우저가 열리면 **그 파일들을 소유한 계정**으로 승인한다. 드라이브 URL 이 `/u/3/` 처럼
  계정 번호를 달고 있으면 계정이 여럿이라는 뜻이다 — 엉뚱한 계정으로 붙이면 목록이 빈다
- 권한은 **`drive.readonly`** 로 잡는다. 인제스트는 읽기만 한다
- 확인: `rclone listremotes` 에 `gdrive:` 가 보이면 된다

🔴 **경고 하나가 뜬다** — *"This remote uses rclone's shared Google Drive client_id, which is
being retired and will stop working during 2026."* 지금은 동작하지만 **2026 중에 끊긴다.**
끊기면 자체 client_id 를 만들어 `rclone config update gdrive client_id … client_secret …` 한다.

### 받기 — `copy` 가 아니라 `backend copyid`

```bash
rclone backend copyid gdrive: <파일id> ~/Desktop/books/<파일명>.pdf
```

🔴 **`rclone copy` 는 폴더용이다.** 파일 id 하나를 `--drive-root-folder-id` 로 주면 빈 목록(`[]`)이
돌아온다 — 조용히 아무것도 안 받는다. 파일 하나는 `backend copyid` 다.

🔴 **받은 바이트를 드라이브의 `fileSize` 와 대조한다.**

```bash
[ "$(stat -f%z "$f")" = "$want" ] || echo "🔴 불일치"
```

끊긴 파일을 "받았다"로 세면 **인제스트가 깨진 PDF 를 먹고**, 그 뒤 쪽 이미지·OCR·요약까지
전부 틀린 출처 위에 쌓인다. 크기가 수백 MB 라 중간에 끊길 여지가 실제로 있다.

### 받는 곳 — 볼트가 아니다

`~/Desktop/books/` 처럼 **볼트 밖**에 둔다. `~/.knoverse/` 에 넣으면 안 된다 —
AGENTS.md §PDF 원본을 복사하지 않는다 (수백 MB 가 git 에 들어가면 다른 머신에서 clone 이 안 된다).
볼트에는 `source.yaml` 의 **경로와 sha256** 만 남는다.

## 🔴 순서가 뒤집혔다 — 텍스트 레이어를 먼저 믿지 않는다

에픽 설계결정은 "텍스트 레이어 우선 → 스캔만 비전" 이었다. **한국어 책에서 역효과다.**

> 실측 2026-10-03, prod 33권 — **5권 2,796쪽이 한글 0.0%** 였다
> (모던 자바스크립트 957쪽 · 컴퓨터 구조 627 · 리팩터링 2판 540 · 스프링부트 420 · `1-5 0001` 252).
> 한국어 책 PDF 는 글꼴에 문자 정보가 없는 경우가 흔해서 `pdftotext` 가 **오류 없이**
> 의미 없는 라틴 바이트를 돌려준다. 유일하게 OCR 로 읽은 책이 한글 69.6% 로 가장 멀쩡했다.

그래서 기본 경로는 **PDF → 쪽 이미지 → OCR** 이다. 텍스트 레이어는 뽑아 보고
**읽히는지 검사해서 통과하면** 쓰는 보조 경로다 (`pages/status` 의 `text.usable`).

## 사람이 판단할 것 — 스크립트가 안 하는 셋

| 무엇 | 왜 스크립트가 안 하나 |
|---|---|
| **같은 책이 이미 있나** | 제목이 똑같은 항목이 2개 이상이면 **멈추고 묻는다.** 엉뚱한 책에 목차를 씌우면 눌렀을 때 딴 데로 간다 |
| **목차** | 지어내지 않는다. PDF 북마크(`extract-outline.mjs`)나 사람이 넣는다 — 틀린 목차는 모든 후속 산출물의 출처를 틀리게 만든다 |
| **쪽 제안 확정** | `chapters/suggest-pages` 는 **제안**이다(정답지 49장 실측 76%). 저장은 사람이 |

## 막힌 단계를 어떻게 읽나

한 단계가 막혀도 **죽지 않는다.** 서버가 준 이유를 체크리스트에 적고 다음으로 간다.
막힌 게 있으면 종료 코드가 1 이다.

자주 나오는 둘 —

| 이유 | 처방 |
|---|---|
| `총 쪽수를 모르는 조각이 있습니다` | 브라우저 업로드로 들어온 조각이다 — 콘솔에서 원문을 한 번 열면 뷰어가 쪽 수를 채운다 |
| `쪽 이미지가 먼저 다 구워져야 한다` | ③이 서버에서 도는 중이다. 기다렸다 다시 돌린다 |

## 쌓이는 자리

`~/.knoverse/<스페이스>/<책>/` — `CHECKLIST.md`(명단) · `source.yaml`(경로·sha256·itemId) · `_runs/`.

🔴 **진행의 정본은 서버다.** 체크리스트는 비춘 것이고 매 실행마다 갱신된다 — 둘이 다르면 서버가 맞다.
🔴 **PDF 원본을 복사하지 않는다.** 경로와 sha256 만. 바이트의 정본은 제로클라우드 스토리지다.

행동 규칙 전문은 `~/.knoverse/AGENTS.md`.

## 끝나면

`/knoverse:doc-make` — 발표자료·핸드아웃·독후감.
