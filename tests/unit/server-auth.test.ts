// @vitest-environment node
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { fixtureSession, startSupabaseFixture } from '../fixtures/supabase-server';
import { fakePublishableKey, fixtureUsers } from '../fixtures/supabase-data';
import { sessionRequest } from '../fixtures/server-auth-request';

vi.mock('server-only', () => ({}));
import { getVerifiedIdentity, requireAdmin } from '../../lib/auth/server';
import { createRouteHandlerClient } from '../../lib/supabase/server';
import { GET } from '../../app/api/rights/session/route';

let fixture: Awaited<ReturnType<typeof startSupabaseFixture>>;
beforeEach(async () => {
  fixture = await startSupabaseFixture();
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', fixture.url);
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', fakePublishableKey);
});
afterEach(async () => { vi.unstubAllEnvs(); await fixture.close(); });

test('denies forged admin session when token is invalid before any private query', async () => {
  // Given a genuine cookie encoding containing forged identity/metadata and invalid token.
  const forged = { ...fixtureSession('student'), access_token: 'invalid.token.signature', user: fixtureUsers.admin };
  const { supabase } = createRouteHandlerClient(await sessionRequest(fixture.url, 'student', forged));
  // When privileged authorization is requested.
  await expect(requireAdmin(supabase)).rejects.toMatchObject({ status: 401 });
  // Then no role/private database request occurs.
  expect(fixture.data.requests.filter(request => request.path.startsWith('/rest/'))).toEqual([]);
});

test('denies absent session when privileged authorization is requested', async () => {
  const { supabase } = createRouteHandlerClient(new NextRequest('http://localhost/feedback'));
  await expect(requireAdmin(supabase)).rejects.toMatchObject({ status: 401 });
  expect(fixture.data.requests).toEqual([]);
});

test.each(['outsider', 'unconfirmed'] as const)('denies %s before querying membership', async identity => {
  const { supabase } = createRouteHandlerClient(await sessionRequest(fixture.url, identity));
  await expect(requireAdmin(supabase)).rejects.toMatchObject({ status: 403 });
  expect(fixture.data.requests.filter(request => request.path.startsWith('/rest/'))).toEqual([]);
});

test('denies suffix domain when Google hd hints the school domain', async () => {
  const request = await sessionRequest(fixture.url);
  const original = globalThis.fetch;
  vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => String(input).endsWith('/auth/v1/user')
    ? Promise.resolve(Response.json({ ...fixtureUsers.student, email: 'student@nehs.hc.edu.tw.evil.test', user_metadata: { hd: 'nehs.hc.edu.tw' } }))
    : original(input, init));
  const { supabase } = createRouteHandlerClient(request);
  await expect(requireAdmin(supabase)).rejects.toMatchObject({ status: 403 });
  expect(fixture.data.requests.filter(request => request.path.startsWith('/rest/'))).toEqual([]);
});

test('returns minimal student identity when no privileged role is needed', async () => {
  const { supabase } = createRouteHandlerClient(await sessionRequest(fixture.url));
  const identity = await getVerifiedIdentity(supabase);
  expect(identity).toEqual({ id: 'student', email: 'student@nehs.hc.edu.tw', displayName: 'Fixture student', isAdmin: false });
  expect(fixture.data.requests.filter(request => request.path.startsWith('/rest/'))).toEqual([]);
});

test('normalizes a confirmed full email when provider returns mixed case', async () => {
  const request = await sessionRequest(fixture.url);
  const original = globalThis.fetch;
  vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => String(input).endsWith('/auth/v1/user')
    ? Promise.resolve(Response.json({ ...fixtureUsers.student, email: ' Student@NEHS.HC.EDU.TW ' }))
    : original(input, init));
  const { supabase } = createRouteHandlerClient(request);
  expect(await getVerifiedIdentity(supabase)).toMatchObject({ email: 'student@nehs.hc.edu.tw', isAdmin: false });
});

test('rejects an aborted request before membership lookup', async () => {
  const seeded = await sessionRequest(fixture.url, 'admin');
  const controller = new AbortController();
  const request = new NextRequest(seeded, { signal: controller.signal });
  const { supabase } = createRouteHandlerClient(request);
  controller.abort();
  await expect(requireAdmin(supabase)).rejects.toMatchObject({ name: 'AbortError' });
  expect(fixture.data.requests.filter(request => request.path.startsWith('/rest/'))).toEqual([]);
});

test('verifies user before caller-only admin RPC when admin is requested', async () => {
  const { supabase } = createRouteHandlerClient(await sessionRequest(fixture.url, 'admin'));
  fixture.data.requests.length = 0;
  expect(await requireAdmin(supabase)).toMatchObject({ id: 'admin', isAdmin: true });
  expect(fixture.data.requests.map(request => request.path)).toEqual([
    '/auth/v1/user', '/rest/v1/rpc/rights_is_admin',
  ]);
});

test('denies nonadmin before a guarded mutation can execute', async () => {
  const { supabase } = createRouteHandlerClient(await sessionRequest(fixture.url));
  const operation = async () => { await requireAdmin(supabase); return supabase.from('feedback').update({ reply: 'forbidden' }).eq('id', 'feedback-1'); };
  await expect(operation()).rejects.toMatchObject({ status: 403 });
  expect(fixture.data.counters.total).toBe(0);
});

test.each([
  { rows: [{ email: 'admin@nehs.hc.edu.tw' }], status: 403 },
  { rows: 'true', status: 403 },
  { rows: false, status: 403 },
  { rows: null, status: 503 },
])('fails closed when membership is $rows', async ({ rows, status }) => {
  const request = await sessionRequest(fixture.url, 'admin');
  const original = globalThis.fetch;
  vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => String(input).includes('/rest/v1/rpc/rights_is_admin')
    ? Promise.resolve(rows === null ? Response.json({ message: 'role policy error' }, { status: 400 }) : Response.json(rows))
    : original(input, init));
  const { supabase } = createRouteHandlerClient(request);
  await expect(requireAdmin(supabase)).rejects.toMatchObject({ status });
  expect(fixture.data.counters.total).toBe(0);
});

test('does not share identity or membership when two requests run concurrently', async () => {
  const admin = createRouteHandlerClient(await sessionRequest(fixture.url, 'admin'));
  const student = createRouteHandlerClient(await sessionRequest(fixture.url));
  const results = await Promise.allSettled([requireAdmin(admin.supabase), requireAdmin(student.supabase)]);
  expect(results[0]).toMatchObject({ status: 'fulfilled', value: { id: 'admin', isAdmin: true } });
  expect(results[1]).toMatchObject({ status: 'rejected', reason: { status: 403 } });
});

test('reverifies when a previously verified token is revoked', async () => {
  const { supabase } = createRouteHandlerClient(await sessionRequest(fixture.url, 'admin'));
  await requireAdmin(supabase);
  const original = globalThis.fetch;
  vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => String(input).endsWith('/auth/v1/user')
    ? Promise.resolve(Response.json({ message: 'revoked', code: 'bad_jwt' }, { status: 401 })) : original(input, init));
  fixture.data.requests.length = 0;
  await expect(requireAdmin(supabase)).rejects.toMatchObject({ status: 401 });
  expect(fixture.data.requests).toEqual([]);
});

test('waits for provider verification when auth response is delayed', async () => {
  const request = await sessionRequest(fixture.url, 'admin');
  const original = globalThis.fetch;
  let release: (response: Response) => void = () => { throw new TypeError('Missing pending verification'); };
  const delayed = new Promise<Response>(resolve => { release = resolve; });
  vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => String(input).endsWith('/auth/v1/user') ? delayed : original(input, init));
  const { supabase } = createRouteHandlerClient(request);
  const result = requireAdmin(supabase);
  expect(fixture.data.requests.filter(request => request.path.startsWith('/rest/'))).toEqual([]);
  release(Response.json({ message: 'revoked', code: 'bad_jwt' }, { status: 401 }));
  await expect(result).rejects.toMatchObject({ status: 401 });
});

test.each([503, 429, 400])('reports Auth service failure %s as unavailable rather than signing the user out', async status => {
  const request = await sessionRequest(fixture.url, 'admin');
  const original = globalThis.fetch;
  vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => String(input).endsWith('/auth/v1/user')
    ? Promise.resolve(Response.json({ message: 'Synthetic service failure', code: 'unexpected_failure' }, { status }))
    : original(input, init));
  fixture.data.requests.length = 0;
  const response = await GET(request);
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({ error: 'auth_unavailable' });
  expect(fixture.data.requests.filter(request => request.path.startsWith('/rest/'))).toEqual([]);
});

test('keeps an explicit bad JWT a definitive rejection even when Auth returns HTTP 400', async () => {
  const request = await sessionRequest(fixture.url, 'student');
  const original = globalThis.fetch;
  vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => String(input).endsWith('/auth/v1/user')
    ? Promise.resolve(Response.json({ message: 'Invalid token', code: 'bad_jwt' }, {
      status: 400, headers: { 'X-Supabase-Api-Version': '2024-01-01' },
    }))
    : original(input, init));
  expect((await GET(request)).status).toBe(401);
});
