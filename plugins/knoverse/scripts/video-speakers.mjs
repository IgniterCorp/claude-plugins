#!/usr/bin/env node
import { run } from './server-tool.mjs';
try { process.exitCode = await run('video-speakers.mjs', process.argv.slice(2)); }
catch (e) { console.error(e.message); process.exitCode = 3; }
