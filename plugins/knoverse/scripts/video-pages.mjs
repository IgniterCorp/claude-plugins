/** 영상 → 쪽 순수 규칙. 검사: `node video-pages.check.mjs` */

/** 초 → `m:ss` · 한 시간 넘으면 `h:mm:ss`. 요약·독후감의 근거 표기가 이것이다 */
export function stamp(sec) {
  const s = Math.floor(sec);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return h ? `${h}:${pad(m)}:${pad(r)}` : `${pad(m)}:${pad(r)}`;
}

/** WebVTT → [{start, text}]. 자막은 같은 줄이 겹쳐 나오는 일이 많아 바로 앞과 같으면 버린다 */
export function parseVtt(vtt) {
  const out = [];
  const toSec = (t) => t.split(':').reduce((a, v) => a * 60 + Number(v.replace(',', '.')), 0);
  for (const block of vtt.replace(/\r/g, '').split(/\n\n+/)) {
    const lines = block.split('\n');
    const i = lines.findIndex((l) => l.includes('-->'));
    if (i < 0) continue;
    const text = lines.slice(i + 1).join(' ').replace(/<[^>]+>/g, '').trim();
    if (!text || out.at(-1)?.text === text) continue;
    out.push({ start: toSec(lines[i].split('-->')[0].trim()), text });
  }
  return out;
}

/**
 * 장면이 바뀐 시각들 → 쪽 시작 시각들. 너무 짧은 구간은 앞에 붙이고(MIN), 너무 긴 구간은 끊는다(MAX).
 * 첫 쪽은 늘 0초다 — 장면 감지가 첫 컷을 몇 초 뒤에 줘도 그 앞 말이 빠지면 안 된다.
 */
export function pageStarts(sceneTimes, duration, min = 45, max = 180) {
  const starts = [0];
  for (const t of [...sceneTimes, duration]) {
    while (t - starts.at(-1) > max) starts.push(starts.at(-1) + max);
    // 끝에서 MIN 안쪽 컷은 버린다 — 마지막 쪽이 5초짜리가 된다
    if (t <= duration - min && t - starts.at(-1) >= min) starts.push(t);
  }
  return starts;
}

const LINE = /^\[(\d+(?::\d\d){1,2})\] (.*)$/;
const toSec = (s) => s.split(':').reduce((a, v) => a * 60 + Number(v), 0);
/** `A`·`B`… — 화자 번호(0부터) → 글자. 이름은 교정본에서 사람이 읽을 수 있게 바꾼다 */
export const speakerName = (n) => String.fromCharCode(65 + n);

/** [start,end) 와 가장 많이 겹치는 화자. 안 겹치면 null (음악·침묵) */
export function speakerAt(segs, start, end) {
  const over = new Map();
  for (const s of segs) {
    const o = Math.min(end, s.end) - Math.max(start, s.start);
    if (o > 0) over.set(s.speaker, (over.get(s.speaker) ?? 0) + o);
  }
  let best = null, max = 0;
  for (const [k, v] of over) if (v > max) { best = k; max = v; }
  return best;
}

/**
 * 쪽 글 줄마다 화자를 붙인다 — `[mm:ss] A: 말`. 화자가 바뀔 때와 쪽 첫 줄에만 붙인다
 * (쪽 하나만 펴도 누가 말하는지 보여야 한다). 이미 붙어 있으면 그대로 둔다 — 다시 돌려도 같다.
 * `pageEnd` 는 마지막 줄의 끝(다음 쪽 시작). `names` 를 주면 글자 대신 이름 (교정본·번역)
 */
export function labelSpeakers(text, segs, pageEnd, names) {
  const lines = text.split('\n');
  const times = lines.map((l) => (LINE.exec(l) ? toSec(LINE.exec(l)[1]) : null));
  const known = new Set([...segs.map((s) => speakerName(s.speaker)), ...Object.values(names ?? {})]);
  let prev;
  return lines.map((l, i) => {
    const m = LINE.exec(l);
    if (!m) return l;
    const next = times.slice(i + 1).find((t) => t !== null) ?? pageEnd;
    const sp = speakerAt(segs, times[i], Math.max(next, times[i] + 1));
    const show = sp !== null && sp !== prev;
    if (sp !== null) prev = sp;
    const body = m[2].replace(/^([^:[\]]{1,20}): /, (x, k) => (known.has(k) ? '' : x));
    return show ? `[${m[1]}] ${names?.[sp] ?? speakerName(sp)}: ${body}` : `[${m[1]}] ${body}`;
  }).join('\n');
}
