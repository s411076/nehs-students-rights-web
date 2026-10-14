// @vitest-environment node
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { startSupabaseFixture } from '../fixtures/supabase-server';
import { fakePublishableKey } from '../fixtures/supabase-data';
import { sessionRequest } from '../fixtures/server-auth-request';
vi.mock('server-only', () => ({}));
import { GET as feedback } from '../../app/api/rights/feedback/route';
import { GET as pending } from '../../app/api/rights/proposals/pending/route';
import * as actions from '../../app/api/rights/actions/route';
import { FEEDBACK_SELECT_STRING, PROPOSAL_SELECT_STRING } from '../../lib/rights/queries';

let fixture: Awaited<ReturnType<typeof startSupabaseFixture>>;
beforeEach(async () => {
  fixture = await startSupabaseFixture();
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', fixture.url);
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', fakePublishableKey);
});
afterEach(async () => { vi.unstubAllEnvs(); await fixture.close(); });

test('public feedback strips anonymous author before HTTP serialization', async () => {
  const response = await feedback(new NextRequest('http://localhost/api/rights/feedback'));
  const text = await response.text();
  expect(response.status).toBe(200);
  expect(text).not.toContain('ANONYMOUS_AUTHOR_SENTINEL');
  expect(text).not.toContain('author_name');
  expect(response.headers.get('cache-control')).toBe('private, no-store');
  const query = new URL(fixture.data.requests[0].path, fixture.url);
  expect(query.searchParams.get('select')).toBe(FEEDBACK_SELECT_STRING);
  expect(fixture.data.counters.total).toBe(0);
});

test.each(['student', 'outsider', 'unconfirmed'] as const)('pending denies %s before proposals query', async identity => {
  const response = await pending(await sessionRequest(fixture.url, identity));
  expect(response.status).toBe(403);
  expect(fixture.data.requests.some(r => r.path.startsWith('/rest/v1/proposals'))).toBe(false);
  expect(fixture.data.counters.total).toBe(0);
});

test('pending denies absent session before private query', async () => {
  expect((await pending(new NextRequest('http://localhost/api/rights/proposals/pending'))).status).toBe(401);
  expect(fixture.data.requests).toEqual([]);
});

test('admin pending returns only projected pending rows after fresh guard', async () => {
  const request = await sessionRequest(fixture.url, 'admin');
  fixture.data.requests.length = 0;
  const response = await pending(request);
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ ok: true, data: [{ id: 'proposal-2', title: 'Fixture 待審核',
    content: 'Fixture proposal', author_name: 'Fixture student', status: '待審核', upvotes_count: 0,
    reply: '', created_at: '2026-01-01T00:00:00Z' }] });
  const query = new URL(fixture.data.requests[2].path, fixture.url);
  expect(query.searchParams.get('select')).toBe(PROPOSAL_SELECT_STRING);
  expect(query.searchParams.get('status')).toBe('eq.待審核');
  expect(fixture.data.requests[0].path).toBe('/auth/v1/user');
  expect(fixture.data.counters.total).toBe(0);
});

test('actions exposes no GET mutation handler', () => {
  expect('GET' in actions).toBe(false);
});
