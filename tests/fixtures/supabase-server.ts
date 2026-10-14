import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { once } from 'node:events';
import { createFixtureData, fixtureUsers, fakePublishableKey } from './supabase-data.ts';
import type { FixtureIdentity, Row } from './supabase-data.ts';
import type { User } from '@supabase/supabase-js';

export function fixtureSession(identity: FixtureIdentity = 'student', expired = false) {
  const expires = expired ? 1 : 4102444800;
  return { access_token: fixtureToken(identity, expires),
    refresh_token: `fixture-refresh-${identity}`, token_type: 'bearer', expires_in: 3600,
    expires_at: expires, user: fixtureUsers[identity] };
}

function fixtureToken(identity: string, expires = 4102444800) {
  const payload = Buffer.from(JSON.stringify({ sub: identity, exp: expires, role: 'authenticated' })).toString('base64url');
  const signature = Buffer.from(`fixture-${identity}-${expires}`).toString('base64url');
  return `eyJhbGciOiJIUzI1NiJ9.${payload}.${signature}`;
}

// Verification uses a provider-owned token registry, never cookie/JWT claims.
export async function startSupabaseFixture(port = 0) {
  const data = createFixtureData();
  const tokens = new Map<string, User>(Object.entries(fixtureUsers).map(([identity, user]) => [fixtureToken(identity), user]));
  let failure: { path: string; method: string } | null = null;
  let defaults = false;
  const server = createServer((request, response) => {
    void handle(request, response).catch(error => {
      response.statusCode = 500;
      response.end(JSON.stringify({ message: error instanceof Error ? error.message : 'Fixture boundary failure' }));
    });
  });
  async function handle(request: IncomingMessage, response: ServerResponse) {
    response.setHeader('Access-Control-Allow-Origin', '*');
    response.setHeader('Access-Control-Allow-Headers', '*');
    response.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
    response.setHeader('Content-Type', 'application/json');
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    const token = request.headers.authorization?.replace(/^Bearer /, '') ?? '';
    const method = request.method ?? 'GET';
    const send = (status: number, body: unknown) => { response.statusCode = status; response.end(JSON.stringify(body)); };
    if (method === 'OPTIONS') return send(200, {});
    if (url.pathname === '/__fixture/health') return send(200, { ready: true });
    if (url.pathname === '/__fixture/reset') {
      data.reset(); failure = null; defaults = false;
      Object.entries(fixtureUsers).forEach(([identity, user]) => tokens.set(fixtureToken(identity), user));
      return send(200, {});
    }
    if (url.pathname === '/__fixture/state') return send(200, data);
    // Provider-only fault controls; no application authentication backdoor.
    if (url.pathname === '/__fixture/control') {
      const body = await readBody(request);
      if (typeof body.revoke === 'string') tokens.delete(fixtureToken(body.revoke));
      if (typeof body.path === 'string' && typeof body.method === 'string') failure = { path: body.path, method: body.method };
      if (body.clear === true) failure = null;
      if (body.defaults === true) defaults = true;
      return send(200, {});
    }
    data.requests.push({ method, path: url.pathname + url.search, token });
    if (request.headers.apikey !== fakePublishableKey) return send(401, { message: 'Invalid fixture key' });
    if (failure?.path === url.pathname && failure.method === method) return send(400, { message: 'Injected provider failure' });
    const verified = tokens.get(token);
    if (url.pathname === '/auth/v1/logout') return send(200, {});
    if (url.pathname === '/auth/v1/user') return verified ? send(200, verified) : send(401, { message: 'Invalid fixture token', code: 'bad_jwt' });
    if (url.pathname === '/auth/v1/token') {
      const body = await readBody(request);
      const identity = Object.keys(fixtureUsers).find(key => body.refresh_token === `fixture-refresh-${key}` || body.auth_code === `fixture-code-${key}`);
      const entry = Object.entries(fixtureUsers).find(([key]) => key === identity);
      if (!entry) return send(401, { message: 'Invalid fixture grant' });
      const access_token = fixtureToken(entry[0]);
      tokens.set(access_token, entry[1]);
      return send(200, { access_token, refresh_token: `fixture-refresh-${identity}`, expires_in: 3600, token_type: 'bearer', user: entry[1] });
    }
    const table = url.pathname.replace('/rest/v1/', '');
    const rows = data.tables[table];
    if (!url.pathname.startsWith('/rest/v1/') || !rows) return send(404, { message: 'Unknown fixture endpoint' });
    const selected = rows.filter(row => matches(row, url.searchParams));
    let result = selected;
    if (method !== 'GET' && method !== 'HEAD') {
      if (!verified) return send(401, { message: 'Authenticated token required' });
      // Deliberately NO role/ownership/RLS checks. Application guards must stop students.
      switch (method) {
        case 'PATCH': { const body = await readBody(request); selected.forEach(row => Object.assign(row, body)); data.counters.update++; break; }
        case 'DELETE': data.tables[table] = rows.filter(row => !selected.includes(row)); data.counters.delete++; break;
        case 'POST': {
          const body = await readJson(request);
          const inserted = (Array.isArray(body) ? body : [body]).map(parseRow).map(row => ({
            id: `insert-${data.counters.total + 1}`,
            ...(defaults ? { created_at: '2026-01-01T00:00:00Z',
              ...(table === 'feedback' ? { reply: '', replied_at: null } : table === 'proposals' ? { reply: '' } : {}) } : {}), ...row,
          }));
          rows.push(...inserted); result = inserted; data.counters.insert++; break;
        }
        default: return send(405, { message: 'Unsupported fixture method' });
      }
      data.counters.total++;
      if (!request.headers.prefer?.includes('return=representation')) return send(200, null);
    }
    const order = url.searchParams.get('order');
    if (order) {
      const [field, direction] = order.split('.');
      result = [...result].sort((a, b) => String(a[field]).localeCompare(String(b[field])) * (direction === 'desc' ? -1 : 1));
    }
    const limit = url.searchParams.get('limit');
    if (limit) result = result.slice(0, Number(limit));
    const fields = url.searchParams.get('select');
    const projected = result.map(row => fields && fields !== '*' ? Object.fromEntries(fields.split(',').map(field => [field, row[field]])) : row);
    response.setHeader('Content-Range', `0-${Math.max(0, projected.length - 1)}/${projected.length}`);
    if (request.headers.accept?.includes('application/vnd.pgrst.object+json')) {
      return projected.length === 1 ? send(200, projected[0]) : send(406, { code: 'PGRST116', message: 'Expected single row' });
    }
    return send(200, projected);
  }
  server.listen(port, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new TypeError('Expected loopback TCP address');
  return { url: `http://127.0.0.1:${address.port}`, data,
    close: () => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())) };
}

function matches(row: Row, params: URLSearchParams) {
  return Array.from(params).every(([field, filter]) => {
    if (['select', 'order', 'limit', 'offset'].includes(field)) return true;
    if (filter.startsWith('eq.')) return String(row[field]) === filter.slice(3);
    if (filter.startsWith('in.(')) return filter.slice(4, -1).split(',').map(value => value.replace(/^"|"$/g, '')).includes(String(row[field]));
    if (filter.startsWith('neq.')) return String(row[field]) !== filter.slice(4);
    throw new TypeError(`Unsupported fixture filter: ${filter}`);
  });
}
function parseRow(value: unknown): Row {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('Expected fixture row');
  return Object.fromEntries(Object.entries(value));
}
async function readJson(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
async function readBody(request: IncomingMessage) { return parseRow(await readJson(request)); }
