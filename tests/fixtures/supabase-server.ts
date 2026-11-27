import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { once } from 'node:events';
import { createFixtureData, fixtureUsers, fakePublishableKey } from './supabase-data.ts';
import type { FixtureIdentity, Row } from './supabase-data.ts';
import type { User } from '@supabase/supabase-js';
import { FixtureRpcError, uuid } from './supabase-rpc-common.ts';
import { readRpc } from './supabase-rpc-reads.ts';
import { mutateRpc, mutationRpcs } from './supabase-rpc-mutations.ts';

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
      data.reset(); failure = null;
      tokens.clear();
      Object.entries(fixtureUsers).forEach(([identity, user]) => { tokens.set(fixtureToken(identity), user); });
      return send(200, {});
    }
    if (url.pathname === '/__fixture/state') return send(200, data);
    // Provider-only fault controls; no application authentication backdoor.
    if (url.pathname === '/__fixture/control') {
      const body = await readBody(request);
      if (typeof body.revoke === 'string') tokens.delete(fixtureToken(body.revoke));
      if (typeof body.path === 'string' && typeof body.method === 'string') failure = { path: body.path, method: body.method };
      if (body.clear === true) failure = null;
      return send(200, {});
    }
    data.requests.push({ method, path: url.pathname + url.search, token });
    if (request.headers.apikey !== fakePublishableKey) return send(401, { message: 'Invalid fixture key' });
    if (url.pathname.startsWith('/rest/v1/rpc/rights_') && method === 'POST') {
      data.rpcCounters[mutationRpcs.has(url.pathname.slice('/rest/v1/rpc/'.length)) ? 'mutation' : 'read']++;
    }
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
    if (url.pathname.startsWith('/rest/v1/rpc/rights_')) {
      if (method !== 'POST') return send(405, { message: 'RPC requires POST' });
      const name = url.pathname.slice('/rest/v1/rpc/'.length);
      const mutation = mutationRpcs.has(name);
      try {
        const body = await readBody(request);
        validateArguments(name, body);
        return send(200, mutation ? mutateRpc(data, name, { body, user: verified }) : readRpc(data, name, { body, user: verified }));
      } catch (error) {
        if (error instanceof FixtureRpcError) return send(error.status, { code: error.code, message: error.message, details: null, hint: null });
        if (error instanceof SyntaxError || error instanceof TypeError) return send(400, { code: 'PT400', message: 'Invalid RPC payload', details: null, hint: null });
        throw error;
      }
    }
    return send(403, { code: '42501', message: 'No table privileges' });
  }
  server.listen(port, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new TypeError('Expected loopback TCP address');
  return { url: `http://127.0.0.1:${address.port}`, data,
    close: () => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())) };
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

// Named PostgREST arguments from the public SQL wrappers. Only page options have defaults.
const signatures: Record<string, readonly string[]> = {
  rights_list_public_proposals: ['p_limit', 'p_cursor', 'p_query'],
  rights_list_public_feedback: ['p_limit', 'p_cursor', 'p_query'],
  rights_list_public_comments: ['p_proposal_id', 'p_limit', 'p_cursor'],
  rights_list_home_sections: ['p_limit', 'p_cursor'],
  rights_list_pending_proposals: ['p_limit', 'p_cursor'],
  rights_list_admin_feedback: ['p_limit', 'p_cursor'],
  rights_is_admin: [],
  rights_get_public_item: ['p_kind', 'p_id'],
  rights_admin_author: ['p_kind', 'p_id'],
  rights_create_proposal: ['p_client_key', 'p_title', 'p_content', 'p_category'],
  rights_create_feedback: ['p_client_key', 'p_title', 'p_content', 'p_category', 'p_is_anonymous'],
  rights_add_comment: ['p_client_key', 'p_proposal_id', 'p_content', 'p_is_anonymous'],
  rights_set_vote: ['p_proposal_id', 'p_voted'],
  rights_update_proposal_control: ['p_id', 'p_status', 'p_reply', 'p_expected_version'],
  rights_approve_proposal: ['p_id', 'p_expected_version'],
  rights_reject_proposal: ['p_id', 'p_expected_version'],
  rights_delete_proposal: ['p_id', 'p_expected_version'],
  rights_delete_comment: ['p_id', 'p_proposal_id', 'p_expected_version'],
  rights_save_feedback_reply: ['p_id', 'p_reply', 'p_expected_version'],
  rights_delete_feedback: ['p_id', 'p_expected_version'],
  rights_create_home_section: ['p_client_key', 'p_title', 'p_content'],
  rights_delete_home_section: ['p_id', 'p_expected_version'],
  rights_queue_page: ['p_kind', 'p_filter', 'p_limit', 'p_cursor', 'p_query'],
};

function validateArguments(name: string, body: Row) {
  const keys = signatures[name];
  const optional = ['p_limit', 'p_cursor', 'p_query'];
  if (!keys || Object.keys(body).some(key => !keys.includes(key)) ||
      keys.some(key => !(key in body) && !optional.includes(key))) {
    throw new FixtureRpcError(400, 'Unknown RPC signature');
  }
  for (const key of ['p_id', 'p_proposal_id', 'p_client_key']) {
    if (key in body) body[key] = uuid(body[key]);
  }
}
