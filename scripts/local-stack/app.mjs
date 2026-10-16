import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { closeSync, cpSync, existsSync, mkdtempSync, openSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startGateway } from './gateway.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const sourceState = resolve(process.argv[2] ?? '');
const state = JSON.parse(readFileSync(sourceState, 'utf8'));
if (state.mode !== 'hardened') throw new Error('A hardened synthetic STATE is required');
const dir = mkdtempSync(join(tmpdir(), 'rights-app-'));
const appStatePath = join(dir, 'app-state.json');
const logPath = join(dir, 'next.log');
// Snapshot only source/config: no .env, .next, browser profile, provider cache or backup.
for (const name of ['app', 'components', 'lib', 'public', 'proxy.ts', 'next.config.ts',
  'postcss.config.mjs', 'tsconfig.json', 'next-env.d.ts', 'package.json', 'package-lock.json']) {
  if (existsSync(join(root, name))) cpSync(join(root, name), join(dir, name), {
    recursive: true, filter: path => !basename(path).startsWith('.env'),
  });
}
symlinkSync(join(root, 'node_modules'), join(dir, 'node_modules'), 'dir');
const reservation = createServer();
await new Promise((resolve, reject) => {
  reservation.once('error', reject); reservation.listen(0, '127.0.0.1', resolve);
});
const port = reservation.address().port;
await new Promise((resolve, reject) => reservation.close(error => error ? reject(error) : resolve()));
const gateway = await startGateway(state);
const log = openSync(logPath, 'a', 0o600);
let child;
let stopping;
function signalGroup(signal) {
  try { process.kill(-child.pid, signal); }
  catch (error) { if (!(error instanceof Error && 'code' in error && error.code === 'ESRCH')) throw error; }
}
function stop() {
  stopping ??= (async () => {
    if (child && child.exitCode === null && child.signalCode === null) {
      const exited = once(child, 'exit');
      signalGroup('SIGTERM');
      const deadline = setTimeout(() => signalGroup('SIGKILL'), 8000);
      try { await exited; } finally { clearTimeout(deadline); }
    }
    await gateway.close(); closeSync(log);
  })();
  return stopping;
}
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => {
  void stop().then(() => process.exit(0), () => process.exit(1));
});
try {
  // Whitelist only operational environment; never inherit application credentials.
  child = spawn(process.execPath, [join(root, 'node_modules/next/dist/bin/next'),
    'dev', dir, '--webpack', '--hostname', '127.0.0.1', '--port', String(port)], {
    cwd: dir, detached: true, stdio: ['ignore', 'pipe', 'pipe'],
    env: { PATH: process.env.PATH ?? '/usr/bin:/bin', TMPDIR: tmpdir(),
      NODE_ENV: 'development', NEXT_TELEMETRY_DISABLED: '1',
      NEXT_PUBLIC_SUPABASE_URL: gateway.url,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: state.tokens.anon,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: state.tokens.anon,
      NEXT_FONT_GOOGLE_MOCKED_RESPONSES: join(root, 'scripts/local-stack/fonts.cjs') },
  });
  child.stderr.on('data', chunk => writeFileSync(log, chunk));
  await new Promise((resolve, reject) => {
    let output = '';
    const deadline = setTimeout(() => reject(new Error('Next startup timeout; inspect private next.log')), 120000);
    const fail = error => { clearTimeout(deadline); reject(error); };
    child.once('error', fail);
    child.once('exit', code => fail(new Error(`Next exited during startup (${code}); inspect private next.log`)));
    child.stdout.on('data', chunk => {
      writeFileSync(log, chunk);
      output = (output + chunk.toString()).slice(-4096);
      if (/Ready in/.test(output)) { clearTimeout(deadline); resolve(); }
    });
  });
  writeFileSync(appStatePath, JSON.stringify({ appUrl: `http://127.0.0.1:${port}`,
    gatewayUrl: gateway.url, sourceState, logPath, snapshotPath: dir, launcherPid: process.pid,
    nextPid: child.pid }, null, 2), { mode: 0o600 });
  console.log(`APP_URL=http://127.0.0.1:${port}`);
  console.log(`APP_STATE=${appStatePath}`);
  console.log(`STACK_STATE=${sourceState}`);
  await once(child, 'exit');
} finally { await stop(); }
