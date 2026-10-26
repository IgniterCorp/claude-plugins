# 그림을 어떻게 그리나 — 외부 이미지 없이

> 🔴 **전제: 외부에서 이미지를 불러올 수 없다.** chromium 이 네트워크를 못 타면 **조용히 빈칸**이
> 되고(`_common.md` HTML 규약), 슬라이드쇼도 PDF 도 같은 문자열을 쓴다.
> 그래서 그림은 **인라인 SVG** 나 **CSS 박스**로 그린다. 둘 다 PDF 에서 그대로 나온다.

## 무엇으로 그리나

| 그릴 것 | 수단 |
|---|---|
| 흐름 · 단계 · 파이프라인 | CSS 박스 + 화살표(`→` 글자) 또는 인라인 SVG |
| 구조 · 포함 관계 | CSS 중첩 박스 |
| 비교 (전/후, A/B) | CSS 2단 그리드 |
| 비율 · 추이 | 인라인 SVG (`rect` · `polyline`) |
| 강조할 숫자 | 큰 글씨 (그림이 아니라 타이포) |

## 공통 스타일 — `<style>` 에 한 번 넣는다

```css
.two  { display: grid; grid-template-columns: 1fr 1fr; gap: 28px; width: 100% }
.flow { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; font-size: 22px }
.box  { border: 2px solid #d4d4d8; border-radius: 12px; padding: 14px 18px; background: #fafafa }
.box.on { border-color: #7c3aed; background: #f5f3ff }
.arrow{ color: #a1a1aa; font-size: 26px }
.tag  { font-size: 18px; color: #71717a; margin: 0 0 8px }
```

## 1. 흐름 — 파이프라인

```html
<div class="flow">
  <div class="box">PDF</div><span class="arrow">→</span>
  <div class="box">쪽 이미지</div><span class="arrow">→</span>
  <div class="box on">OCR</div><span class="arrow">→</span>
  <div class="box">목차</div>
</div>
```

지금 말하는 단계에 `.on` 을 준다 — **어디를 보라는 신호**가 그림의 값이다.

## 2. 전/후 비교

```html
<div class="two">
  <div><p class="tag">전 — 한 함수가 둘을 한다</p><pre>...</pre></div>
  <div><p class="tag">후 — 계산과 출력이 갈렸다</p><pre>...</pre></div>
</div>
```

🔴 **같은 부분을 양쪽에 다 쓰지 않는다.** 바뀐 줄만 남겨야 차이가 보인다.

## 3. 비율 — 인라인 SVG 막대

```html
<svg viewBox="0 0 600 120" width="100%" role="img" aria-label="원문 대비 요약 비율">
  <rect x="0" y="20"  width="600" height="30" fill="#e4e4e7"/>
  <rect x="0" y="20"  width="34"  height="30" fill="#7c3aed"/>
  <text x="46" y="42" font-size="18" fill="#52525b">요약 5.7%</text>
  <text x="0"  y="90" font-size="18" fill="#a1a1aa">원문 469,160자</text>
</svg>
```

- `viewBox` + `width="100%"` 로 두면 **PDF 에서도 같은 비율**로 나온다
- `aria-label` 을 준다 — 화면 낭독기와 **PDF 텍스트 추출**이 그걸 읽는다
- 색은 덱 팔레트 안에서 (`#7c3aed` 보라 / `#e4e4e7` 회색)

## 4. 구조 — 중첩 박스

```html
<div class="box" style="padding:20px">
  <p class="tag">모듈</p>
  <div class="flow">
    <div class="box">공개 API</div>
    <div class="box" style="opacity:.55">숨은 구현</div>
  </div>
</div>
```

## 🔴 이모지는 쓰지 못한다

PDF 를 굽는 chromium 컨테이너에 **이모지 폰트가 없다.** 넣으면 **두부(▯)** 가 된다 —
그리고 **슬라이드쇼에서는 멀쩡해 보여서** PDF 를 열기 전까지 모른다 (2026-10-05 실측).

아이콘이 필요하면 **인라인 SVG** 로 그린다. 한글·영문·기호(`→` `·` `↗`)는 시스템 폰트에
있으므로 안전하다.

```html
<!-- ❌ <p class="tag">🎩 기능 추가 모자</p> -->
<!-- ⭕ 글자로 -->
<p class="tag">기능 추가 모자</p>

<!-- ⭕ 꼭 아이콘이면 SVG -->
<svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">
  <circle cx="11" cy="11" r="9" fill="none" stroke="#7c3aed" stroke-width="2"/>
  <path d="M7 11l3 3 5-6" fill="none" stroke="#7c3aed" stroke-width="2"/>
</svg>
```

## 금지

- 🔴 **외부 이미지·웹폰트** (`<img src="https://...">`) — 조용히 빈칸이 된다
- 🔴 **ASCII 아트로 때우기** — 발표 화면에서 줄 맞춤이 깨지고 키울 수 없다
- `position: fixed` · `vh`/`vw` · 스크롤 컨테이너 — PDF 에서 좌표가 어긋난다
- 애니메이션 — PDF 는 첫 프레임만 남는다
- 의미 없는 장식 그림. **그림은 주장을 받칠 때만** 넣는다 (Assertion-Evidence)
- 🔴 **이모지** — PDF 에서 두부가 된다 (위 참조)
