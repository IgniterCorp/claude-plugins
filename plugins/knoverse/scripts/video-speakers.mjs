#!/usr/bin/env node
/**
 * 이미 올린 영상 항목에 화자를 붙인다 — 원문은 `A:`·`B:`, 변환 트랙(교정본·번역)은 이름으로.
 * 다시 STT·번역하지 않는다: 줄마다 `[mm:ss]` 가 있어 화자 구간과 시각으로 맞춘다. 두 번 돌려도 같다.
 *
 *   node video-speakers.mjs --url <인제스트 때 URL> \
 *     --names "corrected=Mike Allen,Jensen Huang" --names "ko=마이크 앨런,젠슨 황"
 *
 * 화자 구간은 video-ingest 가 만든 작업 폴더의 speakers.json (없으면 video-ingest --speakers N 으로 먼저).
 * 이름은 화자 번호 순서(A, B, …)다 — 원문 몇 쪽을 보고 누가 A 인지 확인하고 넣는다.
 * 쓰는 순서는 원문 → 교정본 → 번역: 번역은 교정본보다 늦게 고쳐져야 stale 이 안 된다.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { labelSpeakers } from './video-pages.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const opt = (n) => (argv.indexOf(n) >= 0 ? argv[argv.indexOf(n) + 1] : null);
const all = (n) => argv.flatMap((a, i) => (a === n ? [argv[i + 1]] : []));
const URL_ARG = opt('--url');
if (!URL_ARG) throw new Error('--url 이 필요하다 (인제스트 때와 같은 값)');

const loadEnvFile = (p) => (existsSync(p) ? Object.fromEntries(readFileSync(p, 'utf8').split('\n')
  .filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)])) : {});
const env = { ...loadEnvFile(process.env.KNOVERSE_ENV || join(process.env.HOME, '.config/knoverse/env')), ...process.env };
const API = (env.KNOVERSE_API || 'https://api.knoverse.im').replace(/\/+$/, '');
const STORE = env.KNOVERSE_STORE ?? join(env.HOME, '.knoverse');
const key = URL_ARG.replace(/^https?:\/\//, '').normalize('NFC').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase().slice(0, 56);
const WORK = join(STORE, '.cache', 'videos', key);
const state = JSON.parse(readFileSync(join(WORK, 'state.json'), 'utf8'));
const itemId = opt('--item') ?? state.items?.[API];
if (!itemId) throw new Error(`${API} 에 올린 항목이 없다 — state.json`);
const segs = JSON.parse(readFileSync(join(WORK, 'speakers.json'), 'utf8'));
const { duration, pages: cut } = JSON.parse(readFileSync(join(WORK, 'pages.json'), 'utf8'));
const pageEnd = (n) => cut[n]?.start ?? duration; // n 은 1부터 — cut[n] 이 다음 쪽
const names = Object.fromEntries(all('--names').map((s) => {
  const [track, list] = s.split('=');
  return [track, Object.fromEntries(list.split(',').map((v, i) => [i, v.trim()]))];
}));

const api = async (method, path, body) => {
  const r = await fetch(API + path, { method, headers: { authorization: `Bearer ${env.KNOVERSE_TOKEN}`, 'content-type': 'application/json' }, body: body && JSON.stringify(body) });
  const t = await r.text();
  if (!r.ok) throw new Error(`${method} ${path} ${r.status} ${t.slice(0, 300)}`);
  return t ? JSON.parse(t) : null;
};
// 🔴 쪽 글은 한 번에 50쪽까지만 온다 — 더 달라고 해도 조용히 50쪽이다
const read = async (track, total) => {
  const out = [];
  for (let a = 1; a <= total; a += 50) out.push(...await api('GET', `/library/${itemId}/conversions/${track}/pages?from=${a}&to=${Math.min(a + 49, total)}`));
  return out;
};

const conv = await api('GET', `/library/${itemId}/conversions`);
const total = conv.pageCount;
console.log(`항목 ${itemId} · ${total}쪽 · 화자 ${new Set(segs.map((s) => s.speaker)).size}명`);

const orig = await read('original', total);
const relabeled = orig.map((p) => ({ pageNo: p.pageNo, text: labelSpeakers(p.text, segs, pageEnd(p.pageNo)) }));
for (let i = 0; i < relabeled.length; i += 200) {
  await api('PUT', `/library/${itemId}/pages`, { pages: relabeled.slice(i, i + 200), done: i + 200 >= relabeled.length });
}
console.log(`원문 ${relabeled.length}쪽 — A·B`);

const order = [...conv.tracks].sort((a, b) => (a.code === 'corrected' ? -1 : b.code === 'corrected' ? 1 : 0));
for (const t of order) {
  const rows = (await read(t.code, total)).map((p) => ({ pageNo: p.pageNo, text: labelSpeakers(p.text, segs, pageEnd(p.pageNo), names[t.code]) }));
  for (let i = 0; i < rows.length; i += 50) await api('PUT', `/library/${itemId}/conversions/${t.code}/pages`, { pages: rows.slice(i, i + 50) });
  console.log(`${t.label} ${rows.length}쪽 — ${names[t.code] ? Object.values(names[t.code]).join(' · ') : 'A·B'}`);
}
console.log('후', JSON.stringify((await api('GET', `/library/${itemId}/conversions`)).tracks));
