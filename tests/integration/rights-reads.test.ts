// @vitest-environment node
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { NextResponse } from 'next/server';
import { fixtureSession, startSupabaseFixture } from '../fixtures/supabase-server';
import { fakePublishableKey } from '../fixtures/supabase-data';
import { sessionRequest } from '../fixtures/server-auth-request';
vi.mock('server-only', () => ({}));
import { GET as pending } from '../../app/api/rights/proposals/pending/route';
import { GET as authors } from '../../app/api/rights/authors/route';
import { GET as queue } from '../../app/api/rights/queue/route';
import { proxy } from '../../proxy';

let fixture: Awaited<ReturnType<typeof startSupabaseFixture>>;
beforeEach(async () => {
  fixture = await startSupabaseFixture();
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', fixture.url);
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', fakePublishableKey);
});
afterEach(async () => { vi.unstubAllEnvs(); await fixture.close(); });
test.each(['student', 'outsider', 'unconfirmed'] as const)('denies pending read for %s before private RPC', async identity => {
  const seeded = await sessionRequest(fixture.url, identity);
  const response = await pending(seeded);
  expect(response.status).toBe(403);
  expect(fixture.data.requests.filter(r => r.path.startsWith('/rest/')).every(r => r.path === '/rest/v1/rpc/rights_is_admin')).toBe(true);
  expect(fixture.data.counters.total).toBe(0);
});
test('denies absent session on pending and authors before private RPC', async () => {
  for (const { handler, path } of [
    { handler: pending, path: '/api/rights/proposals/pending' },
    { handler: authors, path: '/api/rights/authors?kind=feedback&id=20000000-0000-4000-8000-000000000001' },
  ]) {
    expect((await handler(new NextRequest(`http://localhost${path}`))).status).toBe(401);
    expect(fixture.data.requests).toEqual([]);
  }
});
function refreshedCookies(response: NextResponse) {
  const chunks = response.cookies.getAll().map(({ name, value }) => ({ name, value }));
  expect(chunks.map(({ name }) => name)).toEqual(['sb-127-auth-token.0', 'sb-127-auth-token.1']);
  const encoded = chunks.map(({ value }) => value).join('');
  expect(encoded).toMatch(/^base64-/);
  const { access_token, refresh_token, user } = fixtureSession('admin');
  expect(JSON.parse(Buffer.from(encoded.slice('base64-'.length), 'base64url').toString('utf8')))
    .toMatchObject({ access_token, refresh_token, user });
  return chunks;
}

test('returns every refreshed cookie chunk on a guarded Page response', async () => {
  const seeded = await sessionRequest(fixture.url, 'admin', fixtureSession('admin', true));
  const response = await pending(seeded);
  expect(response.status).toBe(200);
  expect(refreshedCookies(response)).toEqual(seeded.cookies.getAll());
  expect(response.headers.get('cache-control')).toContain('no-store');
});

test('proxy returns every refreshed cookie chunk and forwards them to the downstream request', async () => {
  const seeded = await sessionRequest(fixture.url, 'admin', fixtureSession('admin', true));
  const response = await proxy(seeded);
  expect(response.status).toBe(200);
  const chunks = refreshedCookies(response);
  const forwarded = response.headers.get('x-middleware-request-cookie');
  expect(forwarded).not.toBeNull();
  const downstream = new NextRequest(seeded.url, { headers: { cookie: forwarded ?? '' } });
  expect(downstream.cookies.getAll()).toEqual(chunks);
  expect(response.headers.get('cache-control')).toContain('no-store');
  expect(fixture.data.requests.some(request => request.path.startsWith('/rest/'))).toBe(false);
});
test('denies pending queue for students before the private RPC', async () => {
  const seeded = await sessionRequest(fixture.url, 'student');
  const response = await queue(new NextRequest('http://localhost/api/rights/queue?kind=pending&filter=pending', {
    headers: { cookie: seeded.headers.get('cookie') ?? '' },
  }));
  expect(response.status).toBe(403);
  expect(fixture.data.requests.filter(r => r.path.startsWith('/rest/')).every(r => r.path === '/rest/v1/rpc/rights_is_admin')).toBe(true);
});
