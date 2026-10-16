import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { users } from './identities.mjs';

// Auth is ONLY a synthetic token-registry facade, NOT Google/GoTrue verification.
// Every REST byte goes to real PostgREST; no table/RPC response is simulated here.
export async function startGateway(state) {
  const upstream = new URL(state.postgrestUrl);
  if (upstream.href !== 'http://rest:3000/' || !/^rights-real-[a-f0-9]{10}-db$/.test(state.db)) {
    throw new Error('Only the dedicated internal PostgREST is allowed');
  }
  const registry = new Map(Object.entries(users).map(([name, user]) => [state.tokens[name], user]));
  const server = createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,HEAD,POST,PATCH,DELETE,OPTIONS');
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
    if (req.url.startsWith('/rest/v1/')) {
      const args = ['exec', '-i', state.db, 'curl', '--silent', '--show-error',
        '--max-time', '10', '--include', '--http1.1', '--request', req.method,
        '--url', `${upstream.origin}${req.url.slice('/rest/v1'.length)}`];
      for (const name of ['authorization', 'content-type', 'accept', 'prefer', 'range', 'range-unit', 'accept-profile', 'content-profile']) {
        const value = req.headers[name];
        if (typeof value === 'string') args.push('--header', `${name}: ${value}`);
      }
      if (['POST', 'PATCH', 'PUT'].includes(req.method)) args.push('--data-binary', '@-');
      const forwarded = spawn('docker', args, { stdio: ['pipe', 'pipe', 'pipe'] });
      const chunks = [];
      forwarded.stdout.on('data', chunk => chunks.push(chunk));
      forwarded.stderr.resume();
      forwarded.on('error', () => { res.writeHead(502); res.end(); });
      forwarded.on('close', code => {
        if (res.writableEnded) return;
        if (code !== 0) { res.writeHead(502); res.end(); return; }
        const raw = Buffer.concat(chunks);
        const separator = raw.indexOf('\r\n\r\n');
        const lines = raw.subarray(0, separator).toString().split('\r\n');
        const status = Number(lines.shift().split(' ')[1]);
        for (const line of lines) {
          const split = line.indexOf(':');
          const name = line.slice(0, split).toLowerCase();
          if (split > 0 && !['transfer-encoding', 'connection', 'content-length'].includes(name)) {
            res.setHeader(name, line.slice(split + 1).trim());
          }
        }
        res.writeHead(status); res.end(raw.subarray(separator + 4));
      });
      req.pipe(forwarded.stdin); return;
    }
    const user = registry.get(req.headers.authorization?.replace(/^Bearer /, ''));
    res.setHeader('Content-Type', 'application/json');
    if (req.url === '/auth/v1/user' && user) {
      res.writeHead(200); res.end(JSON.stringify(user)); return;
    }
    if (req.url === '/auth/v1/logout' && user) {
      registry.delete(req.headers.authorization.replace(/^Bearer /, ''));
      res.writeHead(204); res.end(); return;
    }
    res.writeHead(401); res.end(JSON.stringify({ code: 'bad_jwt', message: 'Synthetic registry rejected token' }));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  return { url, close: () => new Promise((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve()); server.closeIdleConnections();
  }) };
}

if (process.argv[1]?.endsWith('/gateway.mjs')) {
  const state = JSON.parse(readFileSync(process.argv[2], 'utf8'));
  const gateway = await startGateway(state);
  console.log(`NEXT_PUBLIC_SUPABASE_URL=${gateway.url}`);
  console.log(`NEXT_PUBLIC_SUPABASE_ANON_KEY=${state.tokens.anon}`);
  console.log('Synthetic Auth registry only; REST uses real PostgREST. Tokens live in STATE.');
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => {
    await gateway.close(); process.exit(0);
  });
}
