import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createHash} from 'node:crypto';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawn} from 'node:child_process';
const root = new URL('../', import.meta.url);
// A future export must preserve thin wrappers; copying the obsolete ingest engine fails CI.
for (const name of ['video-ingest.mjs','video-speakers.mjs']) {
  const text=readFileSync(new URL(`plugins/knoverse/scripts/${name}`,root),'utf8');
  assert.ok(text.includes("from './server-tool.mjs'"));
  assert.ok(!/yt-dlp|mlx_whisper|faster_whisper|parseVtt/.test(text));
}
assert.match(readFileSync(new URL('plugins/knoverse/skills/video-read/SKILL.md',root),'utf8'),/get_playbook/);
const body=Buffer.from(`console.log(JSON.stringify({args:process.argv.slice(2),executed:true}));`);
const sha=createHash('sha256').update(body).digest('hex');
const version='012345abcdef';
let mode='valid', requests=0, playbooks=0;
const server=createServer(async(req,res)=>{
  if(req.url==='/mcp'){
    let input='';for await(const chunk of req)input+=chunk;
    const rpc=JSON.parse(input);assert.equal(rpc.params.name,'get_playbook');assert.equal(rpc.params.arguments.name,'video-read');
    playbooks++;
    const value={jsonrpc:'2.0',id:1,result:{content:[{type:'text',text:JSON.stringify({tools:{version,files:[{name:'tool-runner.mjs',sha256:sha}]}})}]}};
    res.setHeader('content-type','text/event-stream');res.end(`event: message\ndata: ${JSON.stringify(value)}\n\n`);return;
  }
  if(req.url===`/tools/${version}/tool-runner.mjs`){
    requests++;
    if(mode==='rollout'&&requests===1){res.statusCode=404;res.end();return;}
    if(mode==='download-failure'){res.statusCode=429;res.end();return;}
    res.end(mode==='tampered'?Buffer.from('console.log("MUST NOT EXECUTE")'):body);return;
  }
  res.statusCode=404;res.end();
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base=`http://127.0.0.1:${server.address().port}`;
const home=mkdtempSync(join(tmpdir(),'kv-plugin-check-'));
const run=(token='fixture')=>new Promise((resolve,reject)=>{
 const p=spawn(process.execPath,[new URL('plugins/knoverse/scripts/video-ingest.mjs',root).pathname,'--language','ko-KR','--no-stt'],{env:{...process.env,HOME:home,KNOVERSE_ENV:'/dev/null',KNOVERSE_API:base,KNOVERSE_TOKEN:token}});
 let output='';p.stdout.on('data',b=>output+=b);p.stderr.on('data',b=>output+=b);p.on('error',reject);p.on('close',code=>resolve({code,output}));
});
try{
 for(const scenario of ['valid','rollout','tampered','download-failure']){
  mode=scenario;requests=0;playbooks=0;const result=await run();
  assert.equal(result.code,['valid','rollout'].includes(mode)?0:3,result.output);
  if(result.code===0){const output=JSON.parse(result.output.trim());assert.deepEqual(output.args,['--api',base,'--version',version,'--tool','video-ingest.mjs','--','--language','ko-KR','--no-stt']);}
  else assert.ok(!result.output.includes('MUST NOT EXECUTE'));
  if(mode==='rollout')assert.equal(playbooks,2);
 }
 assert.equal((await run('')).code,3);
 console.log('knoverse bootstrap checks ok (SSE, same arguments, stale 404 recovery, hash/download failure, missing token)');
}finally{await new Promise(r=>server.close(r));rmSync(home,{recursive:true,force:true});}
