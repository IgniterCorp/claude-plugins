#!/usr/bin/env node
/**
 * 영상 하나를 노버스 서재에 **쪽**으로 넣는다 — 받기 → 원문(자막·STT) → 장면 → 업로드.
 *
 *   node video-ingest.mjs --url https://cdn.jwplayer.com/previews/vMSE0G6O-CoMYKn1C
 *   node video-ingest.mjs --url https://www.youtube.com/watch?v=... --space "내 서재"
 *   node video-ingest.mjs --file ~/talks/keynote.mp4 --title "키노트"
 *   node video-ingest.mjs --url <URL> --dry-run         # 받고 쪽까지 만들고, 올리지는 않는다
 *   node video-ingest.mjs --url <URL> --speakers 3      # 화자 수 (기본 2 · 한 사람이면 --no-speakers)
 *
 * 쪽 하나 = 장면 구간 하나 (specs/video-library). 쪽 이미지 = 그 구간 첫 장면, 쪽 글 = `[mm:ss] 말` 줄들.
 * 🔴 **서버는 영상을 굽지 않는다.** 원문·장면은 여기서 만들고 서버는 저장·검증만 한다 — 책과 같은 원칙.
 * 그다음(교정본 → 번역 → 목차 → 요약 → 독후감)은 MCP 로 이어진다 — 스킬 `knoverse:video-read`.
 *
 * 원문을 고르는 순서: 사람이 단 자막 트랙 → 없으면 STT.
 *   - STT 는 맥이면 mlx-whisper(`large-v3-turbo`, 70분 = 49초 실측), 아니면 faster-whisper.
 *     `KNOVERSE_WHISPER_PY` 로 그 패키지가 깔린 파이썬을 가리킨다 (기본 python3).
 *   - 🔴 유튜브 **자동 생성 자막은 쓰지 않는다** — 그것도 기계 STT 인데 사람 자막처럼 보인다.
 *
 * 필요한 것: ffmpeg · ffprobe, (유튜브 등) yt-dlp, (자막 없으면) mlx-whisper 또는 faster-whisper.
 * 설정: process.env 또는 env 파일(`KNOVERSE_ENV`, 기본 `~/.config/knoverse/env`) — KNOVERSE_TOKEN(콘솔 「MCP 연결」의 kn_mcp_ 토큰) · KNOVERSE_API
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { labelSpeakers, pageStarts, parseVtt, stamp } from './video-pages.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = resolve(HERE, '..');
const STORE = process.env.KNOVERSE_STORE ?? join(process.env.HOME, '.knoverse');

// ── 인자 ────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const opt = (n, d) => (argv.indexOf(n) >= 0 ? argv[argv.indexOf(n) + 1] : d);
const URL_ARG = opt('--url', null);
const FILE_ARG = opt('--file', null);
const TITLE_ARG = opt('--title', null);
const SPACE_ARG = opt('--space', null);
const ITEM_ARG = opt('--item', null);
const DRY = argv.includes('--dry-run');
// ponytail: 고정 임계값. 인터뷰(카메라 전환 잦음)는 45초로 묶여 70분 = 56쪽이었다. 강의는 장면이 드물어 MAX 로 끊긴다
const MIN_SEC = Number(opt('--min-sec', 45));
const MAX_SEC = Number(opt('--max-sec', 180));
const SCENE = Number(opt('--scene', 0.3));
// 화자 수 (기본 2 — 인터뷰·대담). 한 사람 강연이면 --no-speakers
const SPEAKERS = argv.includes('--no-speakers') ? -1 : Number(opt('--speakers', 2));
if (!URL_ARG && !FILE_ARG) {
  console.error('--url <영상 주소> 또는 --file <mp4> 가 필요하다. 사용법은 파일 머리말.');
  process.exit(2);
}

// ── 설정 ────────────────────────────────────────────────────────────────
function loadEnvFile(p) {
  const out = {};
  try {
    for (const raw of readFileSync(p, 'utf8').split(/\r?\n/)) {
      const l = raw.trim();
      if (!l || l.startsWith('#')) continue;
      const eq = l.indexOf('=');
      if (eq === -1) continue;
      out[l.slice(0, eq).trim()] = l.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    }
  } catch { /* 선택이다 */ }
  return out;
}
const env = { ...loadEnvFile(process.env.KNOVERSE_ENV || join(process.env.HOME, '.config/knoverse/env')), ...process.env };
const API = (env.KNOVERSE_API || 'https://api.knoverse.im').replace(/\/+$/, '');
const TOKEN = env.KNOVERSE_TOKEN || '';
if (!TOKEN && !DRY) {
  console.error('KNOVERSE_TOKEN 이 없다. 콘솔 「설정 › MCP 연결」에서 kn_mcp_ 토큰을 받아 ~/.config/knoverse/env 에 KNOVERSE_TOKEN=… 로 넣어라.');
  process.exit(2);
}
const say = (s) => console.log(s);

async function api(method, path, body) {
  const res = await fetch(API + path, {
    method,
    headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (res.status === 401) throw new Error('토큰이 만료되었거나 유효하지 않다 (401). KNOVERSE_TOKEN 을 갱신해라.');
  if (!res.ok) {
    let msg = text.slice(0, 300);
    try { const j = JSON.parse(text); msg = typeof j.message === 'string' ? j.message : JSON.stringify(j.message ?? j); } catch {}
    throw new Error(`${msg}  [${method} ${path} → ${res.status}]`);
  }
  return text ? JSON.parse(text) : null;
}

async function putBytes(url, contentType, buf) {
  const r = await fetch(url, { method: 'PUT', headers: { 'content-type': contentType }, body: buf });
  if (!r.ok) throw new Error(`스토리지 PUT 실패 (${r.status})`);
}

const run = (cmd, args, opts = {}) => execFileSync(cmd, args, { encoding: 'utf8', maxBuffer: 1 << 28, ...opts });
const slug = (s) => s.normalize('NFC').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase().slice(0, 56) || 'video';

// ── 0. 작업 폴더 ────────────────────────────────────────────────────────
const key = slug(FILE_ARG ? basename(FILE_ARG).replace(/\.[^.]+$/, '') : URL_ARG.replace(/^https?:\/\//, ''));
// 🔴 store(~/.knoverse)는 git 레포다. 영상·장면·STT 는 `.cache/` 아래(무시됨)에 둔다 — 원본 바이트의 정본은
//    서버 스토리지다. 여기 두면 다음 push 에 190MB 가 실린다 (PDF 인제스트도 원본을 복사하지 않는다)
const WORK = join(STORE, '.cache', 'videos', key);
mkdirSync(WORK, { recursive: true });
const statePath = join(WORK, 'state.json');
const state = existsSync(statePath) ? JSON.parse(readFileSync(statePath, 'utf8')) : {};
const save = () => writeFileSync(statePath, JSON.stringify(state, null, 2));
say(`작업 폴더  ${WORK}`);

// ── 1. 받기 ─────────────────────────────────────────────────────────────
let videoPath = FILE_ARG ? resolve(FILE_ARG) : join(WORK, 'video.mp4');
let captions = null; // [{start,text}] — 사람 자막이 있을 때만
let meta = { title: TITLE_ARG, author: null, source: URL_ARG ?? null, lang: null };

const jw = URL_ARG && /jwplayer\.com\/(?:previews|players|v2\/media)\/([A-Za-z0-9]{8})/.exec(URL_ARG);
if (jw) {
  // jwplayer 미리보기 링크 = `<mediaId>-<playerId>`. 미디어 정보에 mp4 여러 해상도와 자막 트랙이 있다
  const media = await (await fetch(`https://cdn.jwplayer.com/v2/media/${jw[1]}`)).json();
  const p = media.playlist[0];
  meta.title ??= media.title ?? p.title;
  // 🔴 읽기용이라 낮은 해상도면 된다 — 360p 이상 중 가장 작은 것 (장면 캡처가 쓸 만한 최소)
  const mp4s = p.sources.filter((s) => s.type === 'video/mp4' && s.height).sort((a, b) => a.height - b.height);
  const pick = mp4s.find((s) => s.height >= 360) ?? mp4s.at(-1);
  if (!existsSync(videoPath)) {
    say(`① 받기      jwplayer ${jw[1]} · ${pick.height}p`);
    // 🔴 파일 주소는 302 로 CDN 에 넘긴다 — 안 따라가면 0바이트를 받고 성공한 것처럼 보인다
    run('curl', ['-sfL', '-o', videoPath, pick.file]);
  }
  const cap = (p.tracks ?? []).find((t) => t.kind === 'captions');
  if (cap) {
    captions = parseVtt(await (await fetch(cap.file)).text());
    meta.lang = cap.language ?? null;
  }
} else if (URL_ARG) {
  if (!existsSync(videoPath)) {
    say('① 받기      yt-dlp');
    run('yt-dlp', [
      '-f', 'bv*[height<=480][ext=mp4]+ba[ext=m4a]/b[height<=480][ext=mp4]/b[ext=mp4]',
      '--merge-output-format', 'mp4', '--write-subs', '--sub-format', 'vtt', '--sub-langs', 'en,ko,ja,en-US,en-GB',
      '--write-info-json', '-o', join(WORK, 'video.%(ext)s'), URL_ARG,
    ], { stdio: 'inherit' });
  }
  const info = existsSync(join(WORK, 'video.info.json')) ? JSON.parse(readFileSync(join(WORK, 'video.info.json'), 'utf8')) : {};
  meta.title ??= info.title;
  meta.author = info.uploader ?? info.channel ?? null;
  const vtt = readdirSync(WORK).find((f) => f.endsWith('.vtt'));
  if (vtt) {
    captions = parseVtt(readFileSync(join(WORK, vtt), 'utf8'));
    meta.lang = vtt.split('.').at(-2) ?? null;
  }
}
meta.title ??= basename(videoPath).replace(/\.[^.]+$/, '');
if (!existsSync(videoPath) || statSync(videoPath).size === 0) throw new Error(`영상 파일이 비었다: ${videoPath}`);

const probe = JSON.parse(run('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height:format=duration', '-of', 'json', videoPath]));
const duration = Number(probe.format.duration);
const vw = probe.streams[0]?.width ?? 0, vh = probe.streams[0]?.height ?? 0;
say(`             ${meta.title} · ${stamp(duration)} · ${vw}x${vh} · ${(statSync(videoPath).size / 1048576).toFixed(0)}MB`);

// ── 2. 원문 ─────────────────────────────────────────────────────────────
let segments, source, engine;
if (captions?.length) {
  segments = captions; source = 'caption'; engine = 'caption-track';
  say(`② 원문      자막 트랙 ${segments.length}줄 (${meta.lang ?? '언어 미상'})`);
} else {
  const cache = join(WORK, 'stt.json');
  if (!existsSync(cache)) {
    const py = env.KNOVERSE_WHISPER_PY || 'python3';
    say(`② 원문      자막 없음 → STT (${py})`);
    const t0 = Date.now();
    // mlx(맥 GPU) 를 먼저, 없으면 faster-whisper(CPU int8) — haulla 전사 서버와 같은 모델 계열
    run(py, ['-c', `
import json, sys
src, out = sys.argv[1], sys.argv[2]
try:
    import mlx_whisper
    r = mlx_whisper.transcribe(src, path_or_hf_repo='mlx-community/whisper-large-v3-turbo')
    segs, lang, eng = r['segments'], r.get('language'), 'mlx-whisper-v3-turbo'
except ImportError:
    from faster_whisper import WhisperModel
    m = WhisperModel('large-v3-turbo', device='auto', compute_type='int8')
    it, info = m.transcribe(src, vad_filter=True)
    segs, lang, eng = [{'start': s.start, 'text': s.text} for s in it], info.language, 'faster-whisper-v3-turbo'
json.dump({'language': lang, 'engine': eng, 'segments': [{'start': s['start'], 'text': s['text'].strip()} for s in segs]}, open(out, 'w'), ensure_ascii=False)
`, videoPath, cache], { stdio: ['ignore', 'inherit', 'inherit'] });
    say(`             ${((Date.now() - t0) / 1000).toFixed(0)}초`);
  }
  const stt = JSON.parse(readFileSync(cache, 'utf8'));
  segments = stt.segments.filter((s) => s.text); source = 'stt'; engine = stt.engine; meta.lang = stt.language;
  say(`             STT ${segments.length}구간 · 언어 ${meta.lang} · ${engine}`);
}

// ── 2.5 화자 ─────────────────────────────────────────────────────────────
// 원문 구간마다 화자 임베딩(wespeaker VoxCeleb, Apache-2.0)을 뽑아 묶는다 — diarize.py 머리말
let speakers = null;
if (SPEAKERS >= 0) {
  const cache = join(WORK, 'speakers.json');
  if (!existsSync(cache)) {
    const models = join(STORE, '.cache', 'models');
    const emb = join(models, 'wespeaker_en_voxceleb_resnet34.onnx');
    mkdirSync(models, { recursive: true });
    if (!existsSync(emb)) run('curl', ['-sfL', '-o', emb, 'https://github.com/k2-fsa/sherpa-onnx/releases/download/speaker-recongition-models/wespeaker_en_voxceleb_resnet34.onnx']);
    const wav = join(WORK, 'audio16k.wav');
    if (!existsSync(wav)) run('ffmpeg', ['-v', 'error', '-i', videoPath, '-ac', '1', '-ar', '16000', '-y', wav]);
    const segFile = join(WORK, 'segments.json');
    writeFileSync(segFile, JSON.stringify({ segments }));
    try {
      run(env.KNOVERSE_WHISPER_PY || 'python3', [join(HERE, 'diarize.py'), segFile, wav, cache, models, String(SPEAKERS)], { stdio: ['ignore', 'inherit', 'inherit'] });
    } catch { say('             화자 분리 건너뜀 — `pip install sherpa-onnx soundfile` (화자 표기 없이 계속)'); }
  }
  if (existsSync(cache)) speakers = JSON.parse(readFileSync(cache, 'utf8'));
}

// ── 3. 장면 → 쪽 ────────────────────────────────────────────────────────
// showinfo 는 stderr 로 나온다 — 2>&1 로 받는다. 영상 경로는 $0 로 넘겨 따옴표가 깨지지 않게
const scenes = [...run('sh', ['-c', `ffmpeg -hide_banner -nostats -i "$0" -vf "select='gt(scene,${SCENE})',showinfo" -f null - 2>&1`, videoPath])
  .matchAll(/pts_time:([0-9.]+)/g)].map((m) => Number(m[1]));
const starts = pageStarts(scenes, duration, MIN_SEC, MAX_SEC);
const pages = starts.map((t, i) => {
  const end = starts[i + 1] ?? Infinity;
  const lines = segments.filter((s) => s.start >= t && s.start < end).map((s) => `[${stamp(s.start)}] ${s.text}`);
  const text = lines.join('\n');
  return { pageNo: i + 1, start: t, text: speakers ? labelSpeakers(text, speakers, Math.min(end, duration)) : text };
});
say(`③ 쪽        장면 전환 ${scenes.length}곳 → ${pages.length}쪽 (최소 ${MIN_SEC}초 · 최대 ${MAX_SEC}초) · 글 빈 쪽 ${pages.filter((p) => !p.text).length}`);

const frameDir = join(WORK, 'frames');
mkdirSync(frameDir, { recursive: true });
const WIDTH = { sm: 800, md: 1600 };
for (const p of pages) {
  for (const [v, w] of Object.entries(WIDTH)) {
    const out = join(frameDir, `${String(p.pageNo).padStart(4, '0')}-${v}.jpg`);
    if (existsSync(out)) continue;
    // 구간 시작 +0.5초 — 컷 경계 바로 위 프레임은 앞 장면이 섞여 뭉개진다. sharp 처럼 확대는 안 한다
    run('ffmpeg', ['-v', 'error', '-ss', String(Math.min(p.start + 0.5, duration - 0.1)), '-i', videoPath, '-frames:v', '1',
      '-vf', `scale='min(${w},iw)':-2`, '-q:v', '4', '-y', out]);
  }
}
const dims = (v) => { const w = Math.min(WIDTH[v], vw); return { width: w, height: Math.round((vh * w) / vw / 2) * 2 }; };
writeFileSync(join(WORK, 'pages.json'), JSON.stringify({ meta, source, engine, duration, pages }, null, 1));
say(`             장면 이미지 ${pages.length}×2장 → ${frameDir}`);

if (DRY) { say('dry-run — 여기까지. 올리지 않았다.'); process.exit(0); }

// ── 4. 올리기 ───────────────────────────────────────────────────────────
// 서버마다 항목이 다르다 — 로컬에서 돌린 뒤 운영에 돌리면 로컬 id 로 올리려 한다
state.items ??= state.itemId ? { 'http://localhost:47001': state.itemId } : {};
delete state.itemId;
let itemId = ITEM_ARG ?? state.items[API];
if (!itemId) {
  const spaces = await api('GET', '/spaces');
  const space = SPACE_ARG ? spaces.find((s) => s.name === SPACE_ARG) : spaces.find((s) => s.isDefault) ?? spaces[0];
  if (!space) throw new Error(SPACE_ARG ? `스페이스 "${SPACE_ARG}" 가 없다` : '스페이스가 없다. 콘솔에서 하나 만들어라.');
  const created = await api('POST', '/library', {
    title: meta.title, author: meta.author ?? undefined, kind: 'video', status: 'reading', spaceId: space.id,
    note: meta.source ? `원본: ${meta.source}` : undefined,
  });
  itemId = state.items[API] = created.id; save();
  say(`④ 등록      "${meta.title}" → ${space.name} (${itemId})`);
}

const overview = await api('GET', `/library/${itemId}/files`);
if (!overview.files?.length) {
  const size = statSync(videoPath).size;
  const pre = await api('POST', `/library/${itemId}/file/presign`, { filename: basename(videoPath), contentType: 'video/mp4', size });
  await putBytes(pre.uploadUrl, 'video/mp4', readFileSync(videoPath));
  // 🔴 쪽 수는 우리가 센다 — 영상의 "쪽" 은 우리가 자른 장면 구간이다
  await api('POST', `/library/${itemId}/file/commit`, { fileId: pre.fileId, pageCount: pages.length });
  say(`             원본 영상 올림 (${(size / 1048576).toFixed(0)}MB)`);
}

for (let i = 0; i < pages.length; i += 200) {
  const chunk = pages.slice(i, i + 200);
  await api('PUT', `/library/${itemId}/pages`, {
    pages: chunk.map((p) => ({ pageNo: p.pageNo, text: p.text })),
    source, engine, done: i + 200 >= pages.length,
  });
}
say(`             원문 ${pages.length}쪽 (${source})`);

const frames = pages.flatMap((p) => Object.keys(WIDTH).map((v) => {
  const file = join(frameDir, `${String(p.pageNo).padStart(4, '0')}-${v}.jpg`);
  return { pageNo: p.pageNo, variant: v, file, size: statSync(file).size, ...dims(v) };
}));
for (let i = 0; i < frames.length; i += 100) {
  const chunk = frames.slice(i, i + 100);
  const body = { frames: chunk.map(({ file, ...f }) => f) };
  const urls = await api('POST', `/library/${itemId}/pages/images/presign`, body);
  await Promise.all(urls.map((u, j) => putBytes(u.uploadUrl, 'image/jpeg', readFileSync(chunk[j].file))));
  await api('POST', `/library/${itemId}/pages/images/commit`, body);
}
const img = await api('GET', `/library/${itemId}/pages/images/status`);
say(`             장면 이미지 ${img.built}/${img.target} (${img.imageStatus})`);
say(`\n다음: MCP 로 교정본 → 번역 → 목차 → 요약 → 독후감 (스킬 knoverse:video-read). itemId=${itemId}`);
