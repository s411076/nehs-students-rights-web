// @vitest-environment node
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { fixtureSession, startSupabaseFixture } from '../fixtures/supabase-server';
import { fakePublishableKey } from '../fixtures/supabase-data';
import { sessionRequest } from '../fixtures/server-auth-request';
vi.mock('server-only', () => ({}));
import { GET as feedback } from '../../app/api/rights/feedback/route';
import { GET as pending } from '../../app/api/rights/proposals/pending/route';
import { GET as proposals } from '../../app/api/rights/proposals/route';
import { GET as home } from '../../app/api/rights/home-sections/route';
import { GET as authors } from '../../app/api/rights/authors/route';
import { GET as items } from '../../app/api/rights/items/route';
import { GET as comments } from '../../app/api/rights/proposals/[id]/comments/route';
import * as actions from '../../app/api/rights/actions/route';

let fixture: Awaited<ReturnType<typeof startSupabaseFixture>>;
beforeEach(async () => {
  fixture = await startSupabaseFixture();
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', fixture.url);
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', fakePublishableKey);
});
afterEach(async () => { vi.unstubAllEnvs(); await fixture.close(); });
test('public feedback strips anonymous identity before HTTP serialization', async () => {
  // Given anonymous feedback; when read publicly; then only a redacted Page is serialized.
  const response = await feedback(new NextRequest('http://localhost/api/rights/feedback'));
  const text = await response.text();
  expect(response.status).toBe(200);
  expect(text).not.toContain('ANONYMOUS_AUTHOR_SENTINEL'); expect(text).not.toContain('author_name');
  expect(JSON.parse(text)).toMatchObject({ ok: true, data: { items: [{ id: 'feedback-1', version: 1 }], nextCursor: null } });
  expect(response.headers.get('cache-control')).toBe('private, no-store');
  expect(fixture.data.requests[0].path).toBe('/rest/v1/rpc/rights_list_public_feedback');
  expect(fixture.data.counters.total).toBe(0);
});
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
    { handler: authors, path: '/api/rights/authors?kind=feedback&id=feedback-1' },
  ]) {
    expect((await handler(new NextRequest(`http://localhost${path}`))).status).toBe(401);
    expect(fixture.data.requests).toEqual([]);
  }
});
test('admin pending returns projected versioned Page after fresh guard', async () => {
  const request = await sessionRequest(fixture.url, 'admin');
  fixture.data.requests.length = 0;
  const response = await pending(request);
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ ok: true, data: { items: [{ id: 'proposal-2', title: 'Fixture 待審核',
    content: 'Fixture proposal', author_name: 'Fixture student', status: '待審核', upvotes_count: 0,
    reply: '', created_at: '2026-01-01T00:00:00Z', version: 1, viewer_voted: false, legacy_upvotes_count: 0 }], nextCursor: null } });
  expect(fixture.data.requests.map(r => r.path)).toEqual(['/auth/v1/user', '/rest/v1/rpc/rights_is_admin', '/rest/v1/rpc/rights_list_pending_proposals']);
});
test('public feedback stays redacted for admins while guarded author lookup can identify attribution', async () => {
  const seeded = await sessionRequest(fixture.url, 'admin');
  const headers = { cookie: seeded.headers.get('cookie') ?? '' };
  const list = await feedback(new NextRequest('http://localhost/api/rights/feedback', { headers }));
  expect(list.status).toBe(200);
  expect(await list.text()).not.toContain('ANONYMOUS_AUTHOR_SENTINEL');
  const author = await authors(new NextRequest('http://localhost/api/rights/authors?kind=feedback&id=feedback-1', { headers }));
  expect(author.status).toBe(200);
  expect(await author.json()).toMatchObject({ ok: true, data: { attribution: 'legacy_unverified', user_id: null, email: null } });
});
test('public proposal search runs before pagination with exact precision cursor', async () => {
  fixture.data.tables.proposals.push({ ...fixture.data.tables.proposals[0], id: 'proposal-later', title: 'searchable', created_at: '2026-01-01T00:00:00.123456Z' });
  const first = await proposals(new NextRequest('http://localhost/api/rights/proposals?limit=1&query=searchable'));
  expect(first.status).toBe(200);
  expect(await first.json()).toMatchObject({ ok: true, data: { items: [{ id: 'proposal-later' }], nextCursor: null } });
  const cursor = encodeURIComponent(JSON.stringify({ id: 'proposal-later', created_at: '2026-01-01T00:00:00.123456Z' }));
  const original = globalThis.fetch;
  let args: unknown;
  vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
    if (String(input).includes('rights_list_public_proposals')) args = JSON.parse(String(init?.body));
    return original(input, init);
  });
  expect((await proposals(new NextRequest(`http://localhost/api/rights/proposals?limit=1&cursor=${cursor}`))).status).toBe(200);
  expect(args).toEqual({ p_limit: 1, p_cursor: { id: 'proposal-later', created_at: '2026-01-01T00:00:00.123456Z' }, p_query: '' });
});
test.each(['limit=51', 'cursor=null'])('rejects invalid list query %s before RPC', async query => {
  expect((await proposals(new NextRequest(`http://localhost/api/rights/proposals?${query}`))).status).toBe(400);
  expect(fixture.data.requests).toEqual([]);
});
test('returns projected comments and home pages without raw table access', async () => {
  const comment = await comments(new NextRequest('http://localhost/api/rights/proposals/proposal-1/comments'), { params: Promise.resolve({ id: 'proposal-1' }) });
  expect(comment.status).toBe(200);
  expect(await comment.json()).toMatchObject({ ok: true, data: { items: [{ id: 'comment-1', version: 1 }], nextCursor: null } });
  const sections = await home(new NextRequest('http://localhost/api/rights/home-sections'));
  expect(sections.status).toBe(200);
  expect(await sections.json()).toMatchObject({ ok: true, data: { items: [{ id: 'section-1', version: 1 }] } });
  expect(fixture.data.requests.every(r => r.path.startsWith('/rest/v1/rpc/rights_'))).toBe(true);
});
test.each(['kind=comment&id=c', 'kind=proposal', 'kind=proposal&id=', 'kind=proposal&kind=feedback&id=p'])('rejects invalid targeted read %s', async query => {
  expect((await items(new NextRequest(`http://localhost/api/rights/items?${query}`))).status).toBe(400);
  expect(fixture.data.requests).toEqual([]);
});
test('targeted public reads never reveal private rows', async () => {
  const hidden = await items(new NextRequest('http://localhost/api/rights/items?kind=proposal&id=proposal-2'));
  expect(hidden.status).toBe(200); expect(await hidden.json()).toEqual({ ok: true, data: null });
  const visible = await items(new NextRequest('http://localhost/api/rights/items?kind=feedback&id=feedback-1'));
  expect(visible.status).toBe(200); expect(await visible.text()).not.toContain('ANONYMOUS_AUTHOR_SENTINEL');
});
test.each([[], { items: [{}], nextCursor: null }, { items: [], nextCursor: { id: 'p' } }])('fails closed on malformed RPC Page %j', async page => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json(page));
  const response = await feedback(new NextRequest('http://localhost/api/rights/feedback'));
  expect(response.status).toBe(503);
  expect(response.headers.get('cache-control')).toBe('private, no-store');
});
test('preserves cookie refresh on a guarded Page response', async () => {
  const seeded = await sessionRequest(fixture.url, 'admin', fixtureSession('admin', true));
  const response = await pending(seeded);
  expect(response.status).toBe(200);
  expect(response.cookies.getAll().some(cookie => cookie.value)).toBe(true);
  expect(response.headers.get('cache-control')).toContain('no-store');
});
test('actions exposes no GET mutation handler', () => { expect('GET' in actions).toBe(false); });
