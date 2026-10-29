/** Thin compatibility entrypoint. Selection and transcription live only on the Knoverse server. */
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

export async function run(tool, args) {
  let config = {};
  try {
    config = Object.fromEntries(readFileSync(process.env.KNOVERSE_ENV || join(process.env.HOME, '.config/knoverse/env'), 'utf8').split(/\r?\n/)
      .filter((l) => /^[A-Z_]+=/.test(l.trim())).map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]; }));
  } catch { /* environment can supply configuration */ }
  const env = { ...config, ...process.env };
  const base = (env.KNOVERSE_API || 'https://api.knoverse.im').replace(/\/+$/, '');
  if (!env.KNOVERSE_TOKEN) throw new Error('KNOVERSE_TOKEN 이 필요합니다. MCP get_playbook("video-read") 경로도 사용할 수 있습니다');
  for (let attempt = 0; attempt < 2; attempt++) {
    const r = await fetch(`${base}/mcp`, { method: 'POST', signal: AbortSignal.timeout(60000), headers: {
      authorization: `Bearer ${env.KNOVERSE_TOKEN}`, 'content-type': 'application/json', accept: 'application/json, text/event-stream',
    }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'get_playbook', arguments: { name: 'video-read' } } }) });
    if (!r.ok) throw new Error(`get_playbook 실패: HTTP ${r.status}`);
    const raw = await r.text();
    const rpc = r.headers.get('content-type')?.includes('text/event-stream')
      ? raw.split('\n').filter((l) => l.startsWith('data: ')).map((l) => JSON.parse(l.slice(6))).find((v) => v.id === 1) : JSON.parse(raw);
    if (!rpc?.result || rpc.result.isError || rpc.error) throw new Error('get_playbook 실패');
    const playbook = JSON.parse(rpc.result.content.find((c) => c.type === 'text').text);
    const manifest = playbook.tools;
    const runner = manifest?.files?.find((f) => f.name === 'tool-runner.mjs');
    if (!runner || !/^[a-f0-9]{12}$/.test(manifest.version) || !/^[a-f0-9]{64}$/.test(runner.sha256)) throw new Error('서버 도구 갱신이 필요합니다. 현재 MCP 플레이북을 다시 받아 주세요');
    const response = await fetch(`${base}/tools/${manifest.version}/tool-runner.mjs`, { signal: AbortSignal.timeout(60000) });
    if (response.status === 404 && attempt === 0) continue; // rollout between playbook and bundle: re-fetch the playbook
    if (!response.ok) throw new Error(`도구 받기 실패: HTTP ${response.status}`);
    const body = Buffer.from(await response.arrayBuffer());
    if (createHash('sha256').update(body).digest('hex') !== runner.sha256) throw new Error('도구 해시 불일치 — 실행하지 않습니다');
    const stage = mkdtempSync(join(tmpdir(), 'knoverse-bootstrap-'));
    try {
      const file = join(stage, 'tool-runner.mjs');
      writeFileSync(file, body);
      const p = spawnSync(process.execPath, [file, '--api', base, '--version', manifest.version, '--tool', tool, '--', ...args], { stdio: 'inherit', env });
      if (p.error) throw p.error;
      return p.status ?? 1;
    } finally { rmSync(stage, { recursive: true, force: true }); }
  }
  throw new Error('서버 버전이 계속 바뀝니다. get_playbook 을 다시 받아 주세요');
}
