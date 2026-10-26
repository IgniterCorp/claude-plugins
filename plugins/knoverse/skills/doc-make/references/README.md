# references — 잘 만든 발표자료의 패턴

> **플레이북이 "어떻게 쓰나" 라면 여기는 "무엇이 좋은 것인가" 다.**
> 플레이북(`../playbooks/`)은 절차·분량 상한처럼 **지켜야 할 것**을 갖고,
> 여기는 **보고 따라갈 본보기**를 갖는다. 아웃라인을 짜기 전에 읽는다.

## 왜 생겼나

2026-10-05 에 만든 deck 세 개에서 같은 문제가 나왔다 —
**본문은 맞는데 발표자료답지 않았다.**

- 전 슬라이드가 `<h2>` + 불릿 4개. **16장이 전부 같은 모양**이었다
- 그림이 한 장도 없었다. 구조·흐름·비교를 전부 글로 설명했다
- 듣는 사람이 아는 것과 이어 주는 **실제 사례가 없었다** (책 안 예시만)
- `"1~76쪽 · 이 발표는 1장 안에서만 인용한다"` 같은 **메타 발언**이 슬라이드에 실렸다

플레이북에 분량 상한은 있었지만 **좋은 것의 모습**이 없었다. 그래서 상한만 지킨 결과물이 나왔다.

## 파일

| 파일 | 무엇 |
|---|---|
| [deck-patterns.md](deck-patterns.md) | 슬라이드 원형 8가지 + 전체 구조 패턴. **아웃라인 짤 때** 본다 |
| [visual-vocabulary.md](visual-vocabulary.md) | 외부 이미지 없이 그리는 법 (인라인 SVG·CSS). **그림 슬라이드 쓸 때** 본다 |
| [tone-and-hooks.md](tone-and-hooks.md) | 톤 축, 실제 서비스 사례 고르는 법, 여는 훅. **tone 옵션을 받을 때** 본다 |

## 근거 — 이 패턴들이 어디서 왔나

**Assertion-Evidence (펜실베이니아 주립대 Michael Alley)** — 기술 발표 슬라이드 연구에서
가장 많이 검증된 구조다. 세 원칙:

1. 발표를 **주제(topic)가 아니라 메시지(message)** 위에 세운다
2. 그 메시지를 **불릿이 아니라 시각 증거**로 받친다
3. 증거에 대한 설명은 **말로** 한다 (슬라이드에 적지 않는다)

슬라이드 하나 = **주장 한 문장(제목) + 그것을 받치는 시각 증거**. 공대생 110명 대상
실험에서 전통적 불릿 슬라이드보다 **이해도가 높고 오개념이 적고 인지 부하가 낮았다.**

> 🔴 우리 플레이북의 *"제목은 주장이어야 한다"* 가 이 1번이다. 그런데 **2번(시각 증거)을
> 빼먹고 불릿으로 받치고 있었다.** 절반만 따른 셈이다.

**개발자 콘퍼런스 발표 통념** (업계 가이드 다수에서 공통으로 나오는 것):

- 한 슬라이드에 **한 가지 생각**. 글을 빽빽이 채우지 않는다
- **비유와 익숙한 예시**로 접근성을 만든다 — 복잡한 개념을 듣는 사람의 경험에 붙인다
- 다이어그램·아키텍처 그림·스크린샷·차트는 **관계를 밝히거나 증거를 보일 때** 쓴다
- **서사 구조** — 여는 문제 → 긴장 고조 → 통찰 → 해결. 기술 내용도 이야기로 간다
- **유머는 적당히.** 잘 놓인 농담 하나가 분위기를 살리지만 남발하면 신뢰를 깎는다

## 출처

- [Self-Study Guide for Assertion-Evidence Approach](https://www.assertion-evidence.com/guide.html)
- [Designing Assertion-Evidence Slide Decks](https://fhsu.pressbooks.pub/strategicbcomm/chapter/5-12-message-strategy-evidence/)
- [Assertion-Evidence versus Traditional PowerPoint (ScienceDirect)](https://www.sciencedirect.com/science/article/pii/S2307187725001701)
- [How the Design of Presentation Slides Affects Audience Comprehension (Penn State)](https://writing.engr.psu.edu/ae_comprehension.pdf)
- [10 Tips on Giving Standout Talks at Developer Conferences](https://nordicapis.com/10-tips-on-giving-standout-talks-at-developer-conferences/)
- [13 Tips For Your Conference Presentations](https://www.wearedevelopers.com/magazine/384-13-tips-for-your-conference-presentations)
- [The Fundamentals of Speaking at Technology Conferences](https://draft.dev/learn/the-fundamentals-of-speaking-at-technology-conferences)

> 🔴 **남의 덱을 베껴 오지 않는다.** 여기 있는 것은 공개 자료에서 뽑은 **패턴**이지
> 특정 발표의 복제가 아니다. 좋은 덱을 봤으면 **무엇이 좋았는지 한 줄**로 적어 추가한다.
