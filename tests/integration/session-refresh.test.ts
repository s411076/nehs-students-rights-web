// @vitest-environment node
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { unstable_doesMiddlewareMatch } from 'next/experimental/testing/server';
import { fixtureSession, startSupabaseFixture } from '../fixtures/supabase-server';
import { fakePublishableKey } from '../fixtures/supabase-data';
import { sessionRequest } from '../fixtures/server-auth-request';

vi.mock('server-only', () => ({}));
const cookieStore = vi.hoisted(() => ({ getAll: vi.fn(() => []), set: vi.fn() }));
vi.mock('next/headers', () => ({ cookies: async () => cookieStore }));
import { createReadOnlyClient, createRouteHandlerClient } from '../../lib/supabase/server';
import { requireAdmin } from '../../lib/auth/server';
import { config, proxy } from '../../proxy';

let fixture: Awaited<ReturnType<typeof startSupabaseFixture>>;
beforeEach(async () => {
  fixture = await startSupabaseFixture();
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', fixture.url);
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', fakePublishableKey);
});
afterEach(async () => { vi.unstubAllEnvs(); await fixture.close(); });

test.each(['/', '/admin', '/admin/settings', '/profile', '/feedback', '/proposals/1', '/auth/callback', '/api/rights/feedback'])('refreshes eligible %s requests', url => {
  expect(unstable_doesMiddlewareMatch({ config, nextConfig: {}, url })).toBe(true);
});
test.each(['/_next/static/chunk.js', '/_next/image', '/assets/logo.svg', '/favicon.ico', '/logo.png'])('excludes static %s requests', url => {
  expect(unstable_doesMiddlewareMatch({ config, nextConfig: {}, url })).toBe(false);
});

test('propagates refreshed chunks and cache headers when route returns a new response', async () => {
  const request = await sessionRequest(fixture.url, 'admin', fixtureSession('admin', true));
  const adapter = createRouteHandlerClient(request);
  expect(await requireAdmin(adapter.supabase)).toMatchObject({ isAdmin: true });
  const response = adapter.applyToResponse(NextResponse.json({ ok: true }));
  expect(response.cookies.getAll().filter(cookie => cookie.value).length).toBeGreaterThan(1);
  expect(request.cookies.getAll()).toEqual(response.cookies.getAll().map(({ name, value }) => ({ name, value })));
  expect(response.headers.get('cache-control')).toContain('private');
  expect(response.headers.get('cache-control')).toContain('no-store');
  expect(response.headers.get('pragma')).toBe('no-cache');
  expect(response.headers.get('expires')).toBe('0');
});

test('forwards refreshed request cookies and all response chunks when proxy refreshes', async () => {
  const request = await sessionRequest(fixture.url, 'admin', fixtureSession('admin', true));
  const response = await proxy(request);
  expect(response.cookies.getAll().filter(cookie => cookie.value).length).toBeGreaterThan(1);
  expect(response.headers.get('x-middleware-request-cookie')).toContain(request.cookies.getAll()[0].value);
  expect(response.headers.get('cache-control')).toContain('no-store');
  expect(fixture.data.requests.some(request => request.path.includes('/rest/'))).toBe(false);
});

test('uses only read access when a Server Component creates a client', async () => {
  const client = await createReadOnlyClient();
  expect((await client.auth.getUser()).data.user).toBeNull();
  expect(cookieStore.getAll).toHaveBeenCalled();
  expect(cookieStore.set).not.toHaveBeenCalled();
});

test('preserves no-store headers and chunks on a denial response after refresh', async () => {
  const request = await sessionRequest(fixture.url, 'student', fixtureSession('student', true));
  const adapter = createRouteHandlerClient(request);
  await expect(requireAdmin(adapter.supabase)).rejects.toMatchObject({ status: 403 });
  const response = adapter.applyToResponse(NextResponse.json({ error: 'admin_required' }, { status: 403 }));
  expect(response.status).toBe(403);
  expect(response.cookies.getAll().filter(cookie => cookie.value).length).toBeGreaterThan(1);
  expect(response.headers.get('cache-control')).toContain('no-store');
  expect(response.headers.get('pragma')).toBe('no-cache');
});

test('denies admin and preserves original failure when refresh cookie writes fail', async () => {
  const request = await sessionRequest(fixture.url, 'admin', fixtureSession('admin', true));
  const failure = new TypeError('Cookie store write failed');
  vi.spyOn(request.cookies, 'set').mockImplementation(() => { throw failure; });
  const adapter = createRouteHandlerClient(request);
  await expect(requireAdmin(adapter.supabase)).rejects.toBe(failure);
  expect(() => adapter.applyToResponse(NextResponse.json({ ok: true }))).toThrow(failure);
  expect(fixture.data.requests.filter(request => request.path.startsWith('/rest/'))).toEqual([]);
});

test('does not authorize or query memberships when proxy has no session', async () => {
  const response = await proxy(new NextRequest('http://localhost/admin'));
  expect(response.status).toBe(200);
  expect(response.headers.get('cache-control')).toContain('no-store');
  expect(fixture.data.requests).toEqual([]);
});
