#!/usr/bin/env node
/**
 * PDF 한 권을 노버스에 **끝까지** 넣는다 — 업로드 → 쪽 이미지 → 글자 → 목차.
 *
 *   node ingest.mjs --pdf ~/books/모던자바스크립트.pdf
 *   node ingest.mjs --pdf <경로> --title "모던 자바스크립트" --space "내 서재"
 *   node ingest.mjs --pdf <경로> --dry-run        # 무엇을 할지만
 *   node ingest.mjs --item <itemId>               # 이미 올린 책을 이어서
 *
 * 🔴 **서버 상태가 진행의 정본이다.** 체크리스트 파일은 그걸 비춘 것이고, 매 실행마다
 *    서버에 다시 물어 갱신한다. 둘이 다르면 서버가 맞다 — 그래서 중단돼도 그냥 다시 돌리면 된다
 *    (`~/.knoverse/AGENTS.md` §함정).
 *
 * 🔴 **PDF 원본을 store 에 복사하지 않는다.** 경로와 sha256 만 적는다. 바이트의 정본은
 *    제로클라우드 스토리지다.
 *
 * 설정: process.env 또는 env 파일(`KNOVERSE_ENV`, 기본 `~/.config/knoverse/env`) — KNOVERSE_TOKEN(콘솔 「MCP 연결」의 kn_mcp_ 토큰) · KNOVERSE_API
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = resolve(HERE, '..');
const STORE = process.env.KNOVERSE_STORE ?? join(process.env.HOME, '.knoverse');

// ── 인자 ────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const opt = (n, d) => (argv.indexOf(n) >= 0 ? argv[argv.indexOf(n) + 1] : d);
const PDF = opt('--pdf', null);
const ITEM_ARG = opt('--item', null);
const TITLE_ARG = opt('--title', null);
const SPACE_ARG = opt('--space', null);
const DRY = argv.includes('--dry-run');
const ONLY = opt('--only', null); // 단계 하나만
if (!PDF && !ITEM_ARG) {
  console.error('--pdf <경로> 또는 --item <itemId> 가 필요하다. --help 는 파일 머리말을 본다.');
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
const env = {
  ...loadEnvFile(process.env.KNOVERSE_ENV || join(process.env.HOME, '.config/knoverse/env')),
  ...process.env,
};
const API = (env.KNOVERSE_API || 'https://api.knoverse.im').replace(/\/+$/, '');
const TOKEN = env.KNOVERSE_TOKEN || '';
if (!TOKEN) {
  console.error('KNOVERSE_TOKEN 이 없다. 콘솔 「설정 › MCP 연결」에서 kn_mcp_ 토큰을 받아 ~/.config/knoverse/env 에 KNOVERSE_TOKEN=… 로 넣어라.');
  process.exit(2);
}

// ── HTTP ────────────────────────────────────────────────────────────────
async function api(method, path, body) {
  const res = await fetch(API + path, {
    method,
    headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (res.status === 401) {
    throw new Error('토큰이 만료되었거나 유효하지 않다 (401). 콘솔에 다시 로그인해 KNOVERSE_TOKEN 을 갱신해라.');
  }
  if (!res.ok) {
    let msg = text.slice(0, 300);
    try { const j = JSON.parse(text); msg = typeof j.message === 'string' ? j.message : JSON.stringify(j.message ?? j); } catch {}
    // 이유를 맨 앞에 — 긴 경로 뒤로 밀면 고칠 방법이 잘린다
    throw new Error(`${msg}  [${method} ${path} → ${res.status}]`);
  }
  return text ? JSON.parse(text) : null;
}

/**
 * 한글 → 로마자. **사전이 없다** — 한글 음절은 유니코드에서 산술로 분해된다:
 *   코드 = ((초성 × 21) + 중성) × 28 + 종성 + 0xAC00
 *
 * 표기는 국어의 로마자 표기법 근사다. 정확한 전사가 목적이 아니라
 * **사람이 폴더를 눈으로 찾을 수 있는 ASCII** 가 목적이다.
 */
const CHO = ['g','kk','n','d','tt','r','m','b','pp','s','ss','','j','jj','ch','k','t','p','h'];
const JUNG = ['a','ae','ya','yae','eo','e','yeo','ye','o','wa','wae','oe','yo','u','wo','we','wi','yu','eu','ui','i'];
const JONG = ['','k','k','k','n','n','n','t','l','l','l','l','l','l','l','l','m','p','p','t','t','ng','t','t','k','t','p','t'];

function romanize(text) {
  let out = '';
  for (const ch of text) {
    const c = ch.codePointAt(0);
    if (c >= 0xac00 && c <= 0xd7a3) {
      const i = c - 0xac00;
      out += CHO[Math.floor(i / 588)] + JUNG[Math.floor((i % 588) / 28)] + JONG[i % 28];
    } else {
      out += ch;
    }
  }
  return out;
}

/**
 * 디렉토리 이름 — 🔴 **ASCII 만.** 한글 경로는 응답에서 클릭 링크가 깨지고, 터미널·에디터·
 * git 사이에서 정규화(NFC/NFD)가 갈려 같은 폴더가 둘로 보인다.
 *
 * 한글은 **음역한다** — 해시만 쓰면 `f276a1a2/079944e4` 가 되어 사람이 폴더를 못 찾는다.
 * 음역해도 ASCII 가 2자 미만이면(기호만 있는 제목) 그때만 해시로 떨어진다.
 * 사람이 읽을 원문 제목은 `CHECKLIST.md` 첫 줄과 `source.yaml` 에 그대로 있다.
 */
const slug = (raw) => {
  const base = raw.normalize('NFC').replace(/\.pdf$/i, '');
  const ascii = romanize(base)
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
    .slice(0, 56);
  if (ascii.length >= 2) return ascii;
  return createHash('sha256').update(base).digest('hex').slice(0, 8);
};

/** 쪽 수는 **우리가 센다** — 서버는 PDF 를 파싱하지 않는다 (commit 계약) */
function countPages(pdf) {
  try {
    const out = execFileSync('pdfinfo', [pdf], { encoding: 'utf8' });
    const m = out.match(/^Pages:\s+(\d+)/m);
    if (m) return Number(m[1]);
  } catch { /* 아래로 */ }
  throw new Error(
    'pdfinfo 로 쪽 수를 못 셌다. poppler 가 필요하다 (brew install poppler). ' +
      '쪽 수는 commit 에 필수다 — 없으면 뒤 조각의 전역 오프셋을 못 구한다.',
  );
}

// ── 단계 ────────────────────────────────────────────────────────────────
// 각 단계는 **서버 상태로 완료를 판정한다.** 체크리스트 파일을 믿지 않는다.
const STEPS = [
  { id: 'item',     label: '책 등록' },
  { id: 'upload',   label: '원문 업로드' },
  { id: 'images',   label: '쪽 이미지' },
  { id: 'text',     label: '글자 읽기' },
  { id: 'chapters', label: '목차' },
  { id: 'pages',    label: '목차에 쪽 붙이기' },
];

async function probe(itemId) {
  const [files, imageState, pageState, chapters] = await Promise.all([
    api('GET', `/library/${itemId}/files`).catch(() => null),
    api('GET', `/library/${itemId}/pages/images/status`).catch(() => null),
    api('GET', `/library/${itemId}/pages/status`).catch(() => null),
    api('GET', `/library/${itemId}/chapters`).catch(() => null),
  ]);
  const flat = (ns) => (ns ?? []).flatMap((n) => [n, ...flat(n.children)]);
  const chs = flat(chapters);
  return {
    files, imageState, pageState, chapters: chs,
    done: {
      item: true,
      upload: (files?.files?.length ?? 0) > 0,
      images: imageState?.imageStatus === 'done',
      // 🔴 '쪽이 채워졌다' 로 판정하지 않는다. 한국어 책은 글자가 깨져도 전 쪽이 채워진다
      //    (prod 33권 중 5권·2,796쪽 실측). 읽히는지까지 봐야 한다
      text: (pageState?.pages ?? 0) > 0 && pageState?.text?.usable !== false,
      chapters: chs.length > 0,
      pages: chs.length > 0 && chs.every((c) => c.startPage != null),
    },
  };
}

function checklist(itemId, title, st) {
  const mark = (k) => (st.done[k] ? 'x' : ' ');
  const note = {
    item: `itemId \`${itemId}\``,
    upload: `${st.files?.files?.length ?? 0}조각`,
    images: `${st.imageState?.built ?? 0}${st.imageState?.target ? ` / ${st.imageState.target}` : ''}장`,
    text:
      st.pageState?.text?.usable === false
        ? `🔴 ${st.pageState.text.reason}`
        : `${st.pageState?.pages ?? 0}쪽 · ${
            st.pageState?.text?.usable === true ? '읽힌다' : '미확인 — 서버에 읽힘 판정이 없다'
          }`,
    chapters: `${st.chapters.length}줄`,
    pages: `쪽 있는 줄 ${st.chapters.filter((c) => c.startPage != null).length} / ${st.chapters.length}`,
  };
  return [
    `# ${title}`,
    '',
    '> 🔴 **진행의 정본은 서버다.** 이 파일은 비춘 것이고 매 실행마다 갱신된다.',
    `> 갱신 ${new Date().toISOString().slice(0, 19).replace('T', ' ')}`,
    '',
    ...STEPS.map((s) =>
      `- [${mark(s.id)}] **${s.label}** — ${note[s.id]}` +
      (blockers[s.id] ? `\n      - 🔴 막혔다: ${blockers[s.id]}` : ''),
    ),
    '',
    ...(Object.keys(blockers).length > 0
      ? ['> 🔴 막힌 단계가 있다. 위 이유를 풀고 같은 명령을 다시 돌리면 거기서 이어진다.', '']
      : []),
    '## 다음',
    '',
    // 🔴 마지막 단계 하나만 보고 '끝났다' 고 쓰지 않는다 — 중간이 막힌 채로 초록이 된다
    STEPS.every((s) => st.done[s.id])
      ? '전부 끝났다. `/knoverse:doc-make` 로 발표자료·핸드아웃·독후감을 만들 수 있다.'
      : `\`${STEPS.find((s) => !st.done[s.id]).label}\` 부터. 같은 명령을 다시 돌리면 거기서 이어진다.`,
    '',
  ].join('\n');
}

function writeChecklist(spaceSlug, bookSlug, body) {
  const dir = join(STORE, spaceSlug, bookSlug);
  if (DRY) return dir;
  mkdirSync(join(dir, '_runs'), { recursive: true });
  writeFileSync(join(dir, 'CHECKLIST.md'), body);
  return dir;
}

// ── 본류 ────────────────────────────────────────────────────────────────
const say = (...a) => console.log(...a);

/**
 * 🔴 **한 단계가 막혀도 죽지 않는다.** 던지면 체크리스트를 못 쓰고 끝나서, 사용자는
 *    "뭐가 어디까지 됐는지" 를 다시 조회해야 한다 — 이 스크립트의 존재 이유가 사라진다.
 *    서버가 준 이유를 그대로 들고 다음 단계로 간다.
 */
const blockers = {};
async function step(id, fn) {
  try { return await fn(); }
  catch (e) { blockers[id] = e.message; say(`             🔴 막혔다 — ${e.message}`); return null; }
}

let itemId = ITEM_ARG;
let title = TITLE_ARG;
let spaceName = SPACE_ARG;

if (!itemId) {
  // ① 책 등록 — 같은 제목이 이미 있으면 그걸 쓴다. 두 벌이 생기면 목차·쪽이 갈린다
  title = title ?? basename(PDF).replace(/\.pdf$/i, '');
  const page = await api('GET', `/library?status=all&pageSize=200`);
  const hit = (page.items ?? []).filter((i) => i.title.normalize('NFC') === title.normalize('NFC'));
  if (hit.length > 1) {
    console.error(`제목 "${title}" 인 항목이 ${hit.length}개다. --item 으로 지목해라.`);
    process.exit(2);
  }
  if (hit.length === 1) {
    itemId = hit[0].id;
    say(`① 책 등록   = 이미 있다 (${itemId})`);
  } else {
    const spaces = await api('GET', '/spaces');
    const space = spaceName ? spaces.find((s) => s.name === spaceName) : spaces.find((s) => s.isDefault) ?? spaces[0];
    if (!space) { console.error('스페이스가 없다. 콘솔에서 하나 만들어라.'); process.exit(2); }
    spaceName = space.name;
    if (DRY) { say(`① 책 등록   + "${title}" → ${space.name} (dry-run)`); itemId = 'DRY'; }
    else {
      const created = await api('POST', '/library', { title, kind: 'book', status: 'reading', spaceId: space.id });
      itemId = created.id;
      say(`① 책 등록   + "${title}" → ${space.name} (${itemId})`);
    }
  }
}

const item = itemId === 'DRY' ? { title, spaceId: null } : await api('GET', `/library/${itemId}`);
title = title ?? item.title;
if (!spaceName) {
  const spaces = await api('GET', '/spaces').catch(() => []);
  spaceName = spaces.find((s) => s.id === item.spaceId)?.name ?? 'default';
}
const spaceSlug = slug(spaceName);
const bookSlug = slug(title);

let st = itemId === 'DRY' ? { files: null, imageState: null, pageState: null, chapters: [], done: { item: true } } : await probe(itemId);

// ② 업로드
if ((!ONLY || ONLY === 'upload') && !st.done.upload) {
  if (!PDF) { console.error('업로드가 안 됐는데 --pdf 가 없다.'); process.exit(2); }
  const abs = resolve(PDF);
  if (!existsSync(abs)) { console.error(`파일이 없다: ${abs}`); process.exit(2); }
  const bytes = statSync(abs).size;
  const buf = readFileSync(abs);
  const sha = createHash('sha256').update(buf).digest('hex');
  const pageCount = countPages(abs);
  say(`② 업로드     ${basename(abs)} · ${(bytes / 1048576).toFixed(1)}MB · ${pageCount}쪽 · sha256 ${sha.slice(0, 12)}`);
  if (!DRY) await step('upload', async () => {
    const pre = await api('POST', `/library/${itemId}/file/presign`, {
      filename: basename(abs), contentType: 'application/pdf', size: bytes,
    });
    // 🔴 서명이 크기에 묶여 있다 — 신고한 바이트 수로만 올라간다 (크기를 속이면 403)
    // 🔴 필드 이름은 `uploadUrl` 이다. `pre.url` 을 읽어서 fetch(undefined) 가 되고
    //    "Failed to parse URL from undefined" 로 네 권이 통째로 막혔다 (2026-10-08).
    //    서버 계약을 확인하지 않고 이름을 짐작한 자리다 — 없으면 바로 던진다.
    if (!pre.uploadUrl) throw new Error(`presign 응답에 uploadUrl 이 없다 (받은 키: ${Object.keys(pre).join(', ')})`);
    const put = await fetch(pre.uploadUrl, { method: 'PUT', headers: { 'content-type': 'application/pdf' }, body: buf });
    if (!put.ok) throw new Error(`스토리지 PUT 실패 (${put.status})`);
    await api('POST', `/library/${itemId}/file/commit`, { fileId: pre.fileId, pageCount });
    say(`             커밋 완료`);
    if (!DRY) {
      const dir = join(STORE, spaceSlug, bookSlug);
      mkdirSync(dir, { recursive: true });
      // 🔴 원본을 복사하지 않는다 — 경로와 지문만
      // 🔴 사람이 읽을 제목은 여기 원문으로 남는다 (폴더 이름은 ASCII 해시다)
      writeFileSync(join(dir, 'source.yaml'),
        [`title: ${title}`, `space: ${spaceName}`, `path: ${abs}`, `bytes: ${bytes}`, `sha256: ${sha}`, `pageCount: ${pageCount}`,
         `itemId: ${itemId}`, `fileId: ${pre.fileId}`, `uploadedAt: ${new Date().toISOString()}`, ''].join('\n'));
    }
    st = await probe(itemId);
  });
} else if (!ONLY) say(`② 업로드     = ${st.files?.files?.length ?? 0}조각 (건너뜀)`);

// ③ 쪽 이미지 — 넣고 떠난다. 서버가 이어간다
if ((!ONLY || ONLY === 'images') && !st.done.images && !DRY) {
  say('③ 쪽 이미지  신청');
  await step('images', async () => {
    await api('POST', `/library/${itemId}/pages/images/start`);
    st = await probe(itemId);
    say(`             ${st.imageState?.imageStatus} ${st.imageState?.built ?? 0}장 — 창을 닫아도 서버가 계속 굽는다`);
  });
} else if (!ONLY) say(`③ 쪽 이미지  = ${st.imageState?.built ?? 0}장 (${st.imageState?.imageStatus ?? 'none'})`);

// ④ 글자 — 🔴 순서가 뒤집혔다. 텍스트 레이어를 먼저 쓰지 않는다
if ((!ONLY || ONLY === 'text') && !st.done.text && !DRY) {
  // 🔴 `usable === false` 만 보면 안 된다. 스캔본은 텍스트 레이어 추출 자체가 실패해서
  //    `textStatus: "failed"` · `text: null` 로 온다 — 읽힘 판정이 아예 없는 것이지 "읽힌다" 가 아니다.
  //    전에는 이 경우가 textify 분기로 떨어졌고, 이미 failed 인 변환을 다시 때려 아무 일도 안 일어났다
  //    (2026-10-08 기술적 복제시대의 예술작품 153쪽 — 이미지 306장을 다 구워 놓고 OCR 이 안 돌았다).
  const broken = st.pageState?.text?.usable === false
    || (st.pageState?.textStatus === 'failed' && (st.pageState?.pages ?? 0) === 0);
  if (broken) {
    // 텍스트 레이어가 깨진 책이다 — 이미지에서 읽는 것만이 길이다
    say(`④ 글자       🔴 텍스트 레이어가 깨져 있다 → OCR 로 간다`);
    // text 가 null 인 경로(추출 자체 실패)로도 들어오므로 옵셔널로 읽는다
    say(`             ${st.pageState?.text?.reason ?? `서버 textStatus=${st.pageState?.textStatus}`}`);
    if (!st.done.images) {
      say('             ⚠ 쪽 이미지가 먼저 다 구워져야 한다. 이미지가 끝나면 다시 돌려라.');
    } else {
      await step('text', async () => {
        const r = await api('POST', `/library/${itemId}/pages/ocr/start`, { refine: false });
        if (r?.started === false) { say(`             ⏸ 서버가 OCR 을 미뤘다 — ${r.reason ?? '이유 없음'}`); return; }
        st = await probe(itemId);
        say(`             OCR ${st.pageState?.pages ?? 0}쪽 — 무료 엔진(tesseract)`);
      });
    }
  } else if ((st.pageState?.pages ?? 0) === 0) {
    say('④ 글자       텍스트 레이어 변환 시도');
    // 🔴 서버는 무거운 작업을 하나씩 돌린다 — 쪽 이미지가 굽는 동안 textify 는 `{started:false, reason}` 으로
    //    **거절된다.** 응답을 안 읽으면 "돌고 있다" 로 오보한다 (2026-10-14 AI Systems Performance
    //    Engineering 1062쪽 — 90분 동안 30번 거절당하고 OCR 로 못 넘어갔다).
    let refused = null;
    await step('text', async () => {
      const r = await api('POST', `/library/${itemId}/pages/textify`);
      if (r?.started === false) refused = r.reason ?? '이유 없음';
      st = await probe(itemId);
    });
    // 🔴 textify 는 비동기다. POST 직후 probe 하면 아직 0쪽이라,
    //    `usable !== false` 를 '읽힌다' 로 적으면 **0쪽인데 읽힌다**는 자기모순이 찍힌다
    //    (2026-10-08 요즘우아한개발 350쪽 — 돌고 있는데 "0쪽 · 읽힌다" 로 보고했다).
    //    쪽수가 0 이면 아직 모른다고 적고, 판정은 다음 실행에 맡긴다.
    if (refused) {
      say(`             ⏸ 서버가 변환을 미뤘다 — ${refused}`);
      say('             앞 작업(대개 쪽 이미지)이 끝난 뒤 다시 돌려라.');
    } else if (st.pageState?.text?.usable === false) {
      say(`             🔴 뽑았는데 못 읽는다 — ${st.pageState?.text?.reason ?? '이유 없음'}`);
      say('             다시 돌리면 OCR 경로로 간다.');
    } else if ((st.pageState?.pages ?? 0) === 0) {
      say('             변환이 돌고 있다 — 아직 0쪽. 끝나면 다시 돌려 판정한다');
    } else {
      say(`             ${st.pageState.pages}쪽 · ${st.pageState?.text?.usable === true ? '읽힌다' : '미확인'}`);
    }
  }

} else if (!ONLY) {
  // 🔴 `undefined` 를 통과로 읽지 않는다. 읽힘 판정이 없는 서버(배포 전)에서는 **미확인**이다 —
  //    '읽힌다' 로 적으면 한글 0% 인 책이 초록으로 보인다 (2026-10-03 에 실제로 그랬다)
  const verdict =
    st.pageState?.text?.usable === false ? '🔴 깨짐'
    : st.pageState?.text?.usable === true ? '읽힌다'
    : '미확인 (서버에 읽힘 판정이 없다)';
  say(`④ 글자       = ${st.pageState?.pages ?? 0}쪽 · ${verdict}`);
}

// ⑤⑥ 목차 — 사람이 넣는다. 스크립트가 지어내지 않는다
if (!ONLY) {
  if (!st.done.chapters) {
    say('⑤ 목차       없다 — 콘솔 목차 화면에서 붙여넣거나, MCP put_chapters 로 넣는다.');
  } else if (!st.done.pages) {
    const missing = st.chapters.filter((c) => c.startPage == null).length;
    say(`⑥ 쪽 붙이기  ${missing}줄에 쪽이 없다 → chapters/suggest-pages 로 제안받아 확정한다`);
  } else {
    say(`⑤⑥ 목차      = ${st.chapters.length}줄 · 전부 쪽 있음`);
  }
}

const dir = writeChecklist(spaceSlug, bookSlug, checklist(itemId, title, st));
say('');
say(`체크리스트  ${join(dir, 'CHECKLIST.md')}${DRY ? ' (dry-run — 안 썼다)' : ''}`);
const next = STEPS.find((s) => !st.done[s.id]);
say(next ? `다음        ${next.label} — 같은 명령을 다시 돌리면 거기서 이어진다` : '다음        끝났다. /knoverse:doc-make 로 문서를 만든다');
if (Object.keys(blockers).length > 0) process.exitCode = 1; // 막힌 게 있으면 0 으로 끝내지 않는다
