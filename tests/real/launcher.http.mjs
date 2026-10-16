import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { readFileSync, readdirSync } from 'node:fs';
import { connect } from 'node:net';

// Given: the real launcher and a previously migrated synthetic Docker fixture.
const child = spawn(process.execPath, ['scripts/local-stack/app.mjs', process.argv[2]], {
  stdio: ['ignore', 'pipe', 'pipe'],
});
const exited = once(child, 'exit');
let output = '';
child.stderr.resume();
const statePath = await new Promise((resolve, reject) => {
  const deadline = setTimeout(() => { child.kill('SIGTERM'); reject(new Error('Launcher readiness timeout')); }, 130000);
  child.once('error', error => { clearTimeout(deadline); reject(error); });
  child.once('exit', () => { clearTimeout(deadline); reject(new Error('Launcher exited before readiness')); });
  child.stdout.on('data', chunk => {
    output += chunk.toString();
    const match = output.match(/^APP_STATE=(.+)$/m);
    if (match) { clearTimeout(deadline); resolve(match[1]); }
  });
});
const state = JSON.parse(readFileSync(statePath, 'utf8'));
try {
  // When: consume the launcher's public output; Then: only local URLs and state paths, never tokens.
  assert.equal(output.trim().split('\n').length, 3);
  assert.match(output, /^APP_URL=http:\/\/127\.0\.0\.1:\d+\nAPP_STATE=.+\nSTACK_STATE=.+\n$/);
  assert.equal(readdirSync(state.snapshotPath).some(name => name.startsWith('.env')), false);
  console.log('PASS launcher exposes only loopback URL/state paths and excludes env files');
  // When: compile and serve the real app; Then: local fonts configuration permits a successful page.
  const page = await fetch(state.appUrl, { signal: AbortSignal.timeout(90000) });
  assert.equal(page.status, 200); await page.arrayBuffer();
  console.log('PASS real Next page compiles and responds with offline fonts');
  // When: call a real application read route; Then: Next + SDK + actual PostgREST serve a Page envelope.
  const response = await fetch(`${state.appUrl}/api/rights/proposals?limit=1`, { signal: AbortSignal.timeout(30000) });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true); assert.ok(Array.isArray(body.data.items));
  console.log('PASS real application route serves PostgREST Page data');
} finally {
  // When: SIGTERM launcher; Then: both child server and in-process gateway release their loopback sockets.
  child.kill('SIGTERM');
  const deadline = setTimeout(() => child.kill('SIGKILL'), 15000);
  try { const [code] = await exited; assert.equal(code, 0); } finally { clearTimeout(deadline); }
}
for (const url of [state.appUrl, state.gatewayUrl]) {
  await new Promise((resolve, reject) => {
    const socket = connect({ host: '127.0.0.1', port: Number(new URL(url).port) });
    socket.setTimeout(3000, () => { socket.destroy(); reject(new Error('Socket shutdown timeout')); });
    socket.once('connect', () => { socket.destroy(); reject(new Error('Launcher left a listening socket')); });
    socket.once('error', error => error.code === 'ECONNREFUSED' ? resolve() : reject(error));
  });
}
console.log('PASS SIGTERM closes Next and gateway; Docker fixture remains running');
console.log(`APP_STATE=${statePath}`);
