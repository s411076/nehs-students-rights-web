// @vitest-environment node
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { startSupabaseFixture } from '../fixtures/supabase-server';
import { fakePublishableKey } from '../fixtures/supabase-data';
import { sessionRequest } from '../fixtures/server-auth-request';
vi.mock('server-only', () => ({}));
import { GET as queue } from '../../app/api/rights/queue/route';

let fixture: Awaited<ReturnType<typeof startSupabaseFixture>>;
beforeEach(async () => {
  fixture = await startSupabaseFixture();
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', fixture.url);
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', fakePublishableKey);
});
afterEach(async () => { vi.unstubAllEnvs(); await fixture.close(); });
test('feedback queue returns totals and counts with a no-store envelope', async () => {
  const response = await queue(new NextRequest('http://localhost/api/rights/queue?kind=feedback&filter=all'));
  expect(response.status).toBe(200);
  expect(response.headers.get('cache-control')).toBe('private, no-store');
  expect(await response.json()).toEqual({ ok: true, data: { items: [{ id: 'feedback-1', title: 'Fixture feedback',
    content: 'Fixture suggestion', category: '其他', is_anonymous: true, reply: '', replied_at: null,
    created_at: '2026-01-01T00:00:00Z', version: 1 }], nextCursor: null, total: 1, counts: { all: 1, awaiting: 1, replied: 0 } } });
  expect(fixture.data.requests.at(-1)?.path).toBe('/rest/v1/rpc/rights_queue_page');
});
test('awaiting queue walks oldest-first with stable counts and no misses', async () => {
  fixture.data.tables.feedback.push(
    { id: 'feedback-old', title: 'queue needle', content: 'old', category: '其他', is_anonymous: true,
      reply: '', replied_at: null, created_at: '2026-01-01T00:00:00.123456Z', version: 1 },
    { id: 'feedback-new', title: 'queue needle', content: 'new', category: '其他', is_anonymous: true,
      reply: '', replied_at: null, created_at: '2026-01-01T00:00:00.123457Z', version: 1 },
    { id: 'feedback-done', title: 'queue needle', content: 'done', category: '其他', is_anonymous: true,
      reply: 'reviewed', replied_at: '2026-01-02T00:00:00Z', created_at: '2026-01-03T00:00:00Z', version: 1 });
  const seen: string[] = [];
  let cursor: string | null = null;
  let counts: unknown;
  for (let loops = 0; loops < 10; loops++) {
    const suffix = cursor === null ? '' : `&cursor=${encodeURIComponent(cursor)}`;
    const response = await queue(new NextRequest(`http://localhost/api/rights/queue?kind=feedback&filter=awaiting&limit=1&query=needle${suffix}`));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.total).toBe(2);
    expect(body.data.counts).toEqual({ all: 3, awaiting: 2, replied: 1 });
    counts = body.data.counts;
    for (const item of body.data.items) seen.push(item.id);
    cursor = body.data.nextCursor === null ? null : JSON.stringify(body.data.nextCursor);
    if (cursor === null) break;
  }
  expect(seen).toEqual(['feedback-old', 'feedback-new']);
  expect(counts).toEqual({ all: 3, awaiting: 2, replied: 1 });
});
test.each([
  'kind=proposal&filter=awaiting',
  'kind=feedback&filter=processing',
  'kind=pending&filter=all',
  'kind=unknown&filter=all',
  'kind=feedback',
  'kind=feedback&filter=all&limit=51',
  'kind=feedback&filter=all&sort=asc',
] as const)('rejects invalid queue query %s before RPC', async query => {
  expect((await queue(new NextRequest(`http://localhost/api/rights/queue?${query}`))).status).toBe(400);
  expect(fixture.data.requests).toEqual([]);
});
test('denies pending queue for students before the private RPC', async () => {
  const seeded = await sessionRequest(fixture.url, 'student');
  const response = await queue(new NextRequest('http://localhost/api/rights/queue?kind=pending&filter=pending', {
    headers: { cookie: seeded.headers.get('cookie') ?? '' },
  }));
  expect(response.status).toBe(403);
  expect(fixture.data.requests.filter(r => r.path.startsWith('/rest/')).every(r => r.path === '/rest/v1/rpc/rights_is_admin')).toBe(true);
});
test('admin pending queue returns oldest-first totals while public proposal counts hide pending', async () => {
  const seeded = await sessionRequest(fixture.url, 'admin');
  const headers = { cookie: seeded.headers.get('cookie') ?? '' };
  const pending = await queue(new NextRequest('http://localhost/api/rights/queue?kind=pending&filter=pending', { headers }));
  expect(pending.status).toBe(200);
  expect(await pending.json()).toEqual({ ok: true, data: { items: [expect.objectContaining({ id: 'proposal-2', status: '待審核' })],
    nextCursor: null, total: 1, counts: { pending: 1 } } });
  const proposals = await queue(new NextRequest('http://localhost/api/rights/queue?kind=proposal&filter=all', { headers }));
  expect(await proposals.json()).toMatchObject({ ok: true, data: { total: 1, counts: { all: 1, processing: 1, closed: 0 } } });
});
test('fails closed on a queue envelope without totals', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ items: [], nextCursor: null }));
  const response = await queue(new NextRequest('http://localhost/api/rights/queue?kind=feedback&filter=all'));
  expect(response.status).toBe(503);
  expect(response.headers.get('cache-control')).toBe('private, no-store');
});
