# 플레이북 공통 규약 — 모든 타입이 따른다

> 타입별 플레이북(`tech-deck.md` 등)은 **이 파일을 전제**로 쓰여 있다. 먼저 이걸 읽는다.

## 왜 3단인가

**한 번에 다 쓰면 완성도가 장 번호에 반비례한다.** 50장짜리 책을 한 호출에 맡기면
1~5장은 촘촘하고 40장 이후는 제목만 남는다. 컨텍스트 한계에도 걸린다.

```
① 아웃라인   목차 + 책 메타 → 체크리스트.  사람이 보고 고친다 → put_outline
② 칸 채우기   체크리스트 한 칸 = 생성 한 번.  get_chapter_text 로 그 장만 받는다
             → 칸마다 PATCH 저장 (중단해도 이어서 · 이미 채운 칸은 건너뛴다)
③ 조립       도입·전환·마무리를 손질 → status='done'
```

**아웃라인은 계약이다.** 승인된 칸 수 = 결과 섹션 수. 칸을 말없이 합치거나 늘리지 않는다 —
늘려야 할 근거가 생기면 ①로 돌아가 사람에게 묻는다.

## 입력 — 요약이 오면 더 깎지 않는다

`get_chapter_text` 는 `source` 를 함께 준다.

| `source` | 받은 것 | 어떻게 쓰나 |
|---|---|---|
| `summary` | 이미 요약된 글 (1천 자 안쪽) | 🔴 **더 깎지 않는다.** 이미 깎인 것이다. 재구성·재배치만 한다 |
| `pageText` | 장 본문 원문 (수만 자) | 골라내고 깎는다. 원문에 없는 걸 **지어내지 않는다** |

OCR 로 읽은 본문은 오탈자가 있다. 문맥으로 고쳐 읽되 **확신이 없으면 원문을 그대로 둔다.**

## 출처를 반드시 기록한다

`sourceChapters` 가 비면 `done` 으로 못 넘어간다 (서버가 막는다). 이유 —
출처 없는 문서는 "어디서 왔는지" 를 **영구히 잃는다.** 나중에 복원할 방법이 없다.

## HTML 규약 — 보는 것과 굽는 것이 같은 파일이다

산출물은 HTML 이다. 콘솔 슬라이드쇼가 이걸 그리고, **같은 문자열**이 제로클라우드
`html-to-pdf` 로 가서 PDF 가 된다. 그래서 아래가 지켜지지 않으면 **화면은 멀쩡한데 PDF 가 깨진다.**

### deck — 한 `<section>` = 한 슬라이드 = PDF 한 쪽

```html
<style>
  /* 🔴 @page 크기와 section 크기가 같아야 한 슬라이드가 한 쪽이 된다 */
  @page { size: 1280px 720px; margin: 0 }
  body { margin: 0; font-family: system-ui, -apple-system, "Apple SD Gothic Neo", sans-serif;
         color: #18181b; background: #fff }
  /* 🔴 배경을 **section 에** 칠한다. body 에만 칠하면 PDF 는 멀쩡한데 **슬라이드쇼가 검게 뜬다** —
     슬라이드쇼는 레터박스를 위해 body 를 검정으로 덮기 때문이다 (2026-10-04 실측) */
  section { width: 1280px; height: 720px; box-sizing: border-box; padding: 72px 88px;
            background: #fff; color: #18181b;
            page-break-after: always; break-after: page; overflow: hidden;
            display: flex; flex-direction: column; justify-content: center }
  section > h2 { margin: 0 0 28px; font-size: 44px; line-height: 1.25 }
  section ul { margin: 0; padding-left: 1.1em; font-size: 28px; line-height: 1.6 }
  section pre { margin: 0; font-size: 20px; line-height: 1.5; background: #f4f4f5;
                padding: 20px 24px; border-radius: 10px; overflow: hidden }
  .lead { font-size: 60px; font-weight: 700 }
  .note { margin-top: 24px; font-size: 20px; color: #71717a }
</style>
<section>…</section>
<section>…</section>
```

> 🔴 **쪽 크기는 `@page` 가 정한다 — 단 processor-api 에 `preferCSSPageSize` 가 올라간 뒤부터다.**
> 그 전에는 `format`(기본 A4)이 `@page` 를 조용히 덮어서 **쪽 수는 맞고 크기만 A4** 로 나온다
> (2026-10-03 stage 실측). 에러가 없으니 PDF 를 열어 보기 전까지 모른다.
> 다운로드한 PDF 가 A4 로 나오면 이것이고, HTML 을 고칠 일이 아니다.

- 🔴 **배경·글자색을 `section` 에 칠한다** — `body` 에만 칠하면 PDF 만 맞고 **슬라이드쇼가 검게 뜬다.**
  두 표면이 같은 문자열을 쓰지만 **감싸는 문서가 다르다**: PDF 는 이 CSS 가 전부고,
  슬라이드쇼는 레터박스를 위해 `body` 를 어둡게 덮는다. 슬라이드가 자기 바닥을 갖고 있어야 한다
- **`overflow: hidden` 이 안전장치가 아니다.** 넘치면 화면에서도 PDF 에서도 **잘려 사라진다.**
  한 슬라이드에 들어갈 양을 애초에 넘기지 않는다 (타입별 플레이북의 분량 규칙)
- `position: fixed` · 스크롤 컨테이너 · `vh`/`vw` 를 쓰지 않는다 — PDF 에서 좌표가 어긋난다
- 🔴 **이모지를 본문에 쓰지 않는다.** PDF 를 굽는 chromium 컨테이너에 이모지 폰트가 없어
  **두부(▯)로 나온다** (2026-10-05 실측 — 🎩·🔧·🔴 전부 빈 네모가 됐다).
  화면(슬라이드쇼)에서는 멀쩡해서 **PDF 를 열어 보기 전까지 모른다.**
  강조는 `<strong>` 으로, 아이콘이 필요하면 **인라인 SVG** 로 그린다.
  (이 플레이북 문서 안의 🔴 는 사람이 읽는 것이라 괜찮다 — **산출물 HTML** 에 쓰지 말라는 뜻이다)
- 이미지·웹폰트를 **외부에서 불러오지 않는다.** chromium 이 네트워크를 못 타면 조용히 빈칸이 된다
  - 🔴 **그럼 그림은 어떻게 그리나** — 인라인 SVG(`<svg viewBox=…>`) 와 CSS 박스다. 둘 다 PDF 에
    그대로 나온다. 조각 모음은 [`../references/visual-vocabulary.md`](../references/visual-vocabulary.md).
    "외부 이미지 금지" 만 적고 대안을 안 줬더니 **그림이 0장인 덱**이 나왔다 (2026-10-05)
- 애니메이션·전환 효과를 넣지 않는다. PDF 에선 첫 프레임만 남는다
- 스크립트를 넣지 않는다. 슬라이드쇼는 콘솔이 갖는다

### handout · doc — 흐르는 문서

```html
<style>
  @page { size: A4; margin: 24mm 20mm }
  body { margin: 0; font-family: system-ui, -apple-system, "Apple SD Gothic Neo", sans-serif;
         color: #18181b; font-size: 15px; line-height: 1.75 }
  h2 { margin: 2em 0 .6em; font-size: 22px; page-break-after: avoid }
  pre { background: #f4f4f5; padding: 14px 16px; border-radius: 8px; font-size: 13px;
        white-space: pre-wrap; page-break-inside: avoid }
  blockquote { margin: 1.2em 0; padding-left: 1em; border-left: 3px solid #d4d4d8; color: #52525b }
</style>
```

- `<section>` 을 쓰지 않는다 — **deck 이 아닌데 `<section>` 이 있으면 쪽이 강제로 끊긴다**
- 제목 뒤에서 쪽이 넘어가지 않게 `page-break-after: avoid` 를 유지한다

## 공통 금지

- **인사말·맺음말·메타 발언** ("이번 발표에서는 …을 살펴보겠습니다" 류 빈 문장)
- 본문에 없는 사실·수치·인용을 **지어내는 것**. 근거가 약하면 약하다고 쓴다
- 장 제목을 그대로 슬라이드 제목으로 복사하는 것 — 제목은 **주장**이어야 한다
- 전 장을 균등 분배하는 것. 중요한 장에 더 쓴다 (아웃라인에서 사람이 조정한다)

## 옵션 축 — 공통 의미

| 옵션 | 값 | 무엇이 달라지나 |
|---|---|---|
| `level` | `intro` · `working` · `deep` | 전제 지식. `intro` 는 용어를 **등장할 때마다** 풀고 `deep` 은 전제한다 |
| `examples` | `none` · `some` · `many` | 예시·코드 분량 |
| `density` | `simple` · `standard` · `full` | 한 섹션에 담는 양 (deck 에서는 슬라이드 수로 직결) |
| `minutes` | 숫자 | 발표 시간. deck 슬라이드 수를 여기서 역산한다 |

세부 환산은 타입별 플레이북이 갖는다 — 같은 `density` 가 deck 과 핸드아웃에서 다른 뜻이다.
