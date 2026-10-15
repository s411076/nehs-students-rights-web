// @vitest-environment node
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { fixtureSession, startSupabaseFixture } from '../fixtures/supabase-server';
import { fakePublishableKey } from '../fixtures/supabase-data';
import { sessionRequest } from '../fixtures/server-auth-request';
vi.mock('server-only', () => ({}));
import { POST } from '../../app/api/rights/actions/route';
import type { RightsActionRequest } from '../../lib/rights/contracts';
import { createRightsActionFlight, sendRightsAction } from '../../lib/rights/client';

let fixture: Awaited<ReturnType<typeof startSupabaseFixture>>;
beforeEach(async () => {
  fixture = await startSupabaseFixture();
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', fixture.url);
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', fakePublishableKey);
});
afterEach(async () => { vi.unstubAllEnvs(); await fixture.close(); });

test('denies student reply before permissive provider writes', async () => {
  // Given a verified student and a deliberately permissive database.
  const seeded = await sessionRequest(fixture.url);
  const request = new NextRequest('http://localhost/api/rights/actions', {
    method: 'POST', headers: { cookie: seeded.headers.get('cookie') ?? '', Origin: 'http://localhost',
      'X-Requested-With': 'nehs-web', 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'saveFeedbackReply', payload: { id: 'feedback-1', reply: 'forbidden' } }),
  });
  // When the route receives a privileged write.
  const response = await POST(request);
  // Then application authorization, not RLS, prevents the mutation.
  expect({ status: response.status, writes: fixture.data.counters.total }).toEqual({ status: 403, writes: 0 });
});

const adminCases = [
  { action: 'updateProposalControl', payload: { id: 'proposal-1', status: '通過', reply: 'reply' } },
  { action: 'approveProposal', payload: { id: 'proposal-2' } },
  { action: 'rejectProposal', payload: { id: 'proposal-2' } },
  { action: 'deleteProposal', payload: { id: 'proposal-1' } },
  { action: 'deleteComment', payload: { id: 'comment-1', proposalId: 'proposal-1' } },
  { action: 'saveFeedbackReply', payload: { id: 'feedback-1', reply: 'reply' } },
  { action: 'deleteFeedback', payload: { id: 'feedback-1' } },
  { action: 'createHomeSection', payload: { title: 'home', content: 'body' } },
  { action: 'deleteHomeSection', payload: { id: 'section-1' } },
] satisfies RightsActionRequest[];
const studentCases = [
  { action: 'createProposal', payload: { title: 'title', content: 'body', category: '其他' } },
  { action: 'createFeedback', payload: { title: '', content: '1234567890123456789', category: '其他', isAnonymous: true } },
  { action: 'addComment', payload: { proposalId: 'proposal-1', content: 'comment', isAnonymous: false } },
  { action: 'setVoteCount', payload: { proposalId: 'proposal-1', count: 2 } },
] satisfies RightsActionRequest[];

async function actionRequest(body: unknown, identity: 'student' | 'admin' = 'student', headers: Readonly<Record<string, string | undefined>> = {}) {
  const seeded = await sessionRequest(fixture.url, identity);
  const overrides = Object.fromEntries(Object.entries(headers).filter((entry): entry is [string, string] => typeof entry[1] === 'string'));
  return new NextRequest('http://localhost/api/rights/actions', {
    method: 'POST', headers: { cookie: seeded.headers.get('cookie') ?? '', origin: 'http://localhost',
      'x-requested-with': 'nehs-web', 'content-type': 'application/json', ...overrides }, body: JSON.stringify(body),
  });
}

test.each(adminCases)('denies student $action before writes', async body => {
  const response = await POST(await actionRequest(body));
  expect(response.status).toBe(403);
  expect(fixture.data.counters.total).toBe(0);
});

test.each([...adminCases, ...studentCases])('executes authorized $action with exact receipt', async body => {
  const request = await actionRequest(body, 'admin');
  const original = globalThis.fetch;
  let written: unknown;
  vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
    if (['POST', 'PATCH'].includes(init?.method ?? '') && String(input).includes('/rest/')) written = JSON.parse(String(init?.body));
    return original(input, init);
  });
  const response = await POST(request);
  expect(response.status).toBe(200);
  const result = await response.json();
  if ('id' in body.payload) expect(result).toEqual({ ok: true, data: { id: body.payload.id } });
  else if (body.action === 'setVoteCount') expect(result).toEqual({ ok: true, data: { id: 'proposal-1', upvotes_count: 2 } });
  else expect(result).toEqual({ ok: true, data: { inserted: true } });
  expect(fixture.data.counters.total).toBe(1);
  expect(response.headers.get('cache-control')).toBe('private, no-store');
  expect(response.headers.has('access-control-allow-origin')).toBe(false);
  const writes: Partial<Record<RightsActionRequest['action'], unknown>> = {
    createProposal: { title: '[其他] title', content: 'body', author_name: 'Fixture admin', status: '待審核', upvotes_count: 0 },
    createFeedback: { title: '123456789012345...', content: '1234567890123456789', category: '其他', is_anonymous: true, author_name: '匿名學生' },
    addComment: { proposal_id: 'proposal-1', content: 'comment', author_name: 'Fixture admin' },
    setVoteCount: { upvotes_count: 2 }, updateProposalControl: { status: '通過', reply: 'reply' },
    approveProposal: { status: '研議中' }, rejectProposal: { status: '被退回' },
    createHomeSection: { title: 'home', content: 'body' },
  };
  if (body.action === 'saveFeedbackReply') expect(written).toEqual({ reply: 'reply', replied_at: expect.any(String) });
  else expect(written).toEqual(writes[body.action]);
  const mutation = fixture.data.requests.find(r => ['POST', 'PATCH', 'DELETE'].includes(r.method) && r.path.startsWith('/rest/'));
  const query = new URL(mutation?.path ?? '', fixture.url).searchParams;
  if ('id' in body.payload) expect(query.get('id')).toBe(`eq.${body.payload.id}`);
  if (body.action === 'deleteComment') expect(query.get('proposal_id')).toBe('eq.proposal-1');
  expect(query.get('select')).toBe('id' in body.payload ? 'id' : body.action === 'setVoteCount' ? 'id,upvotes_count' : null);
});

test.each(studentCases)('executes student $action without admins lookup', async body => {
  fixture.data.tables.admins = [];
  const response = await POST(await actionRequest(body));
  expect(response.status).toBe(200);
  expect(fixture.data.requests.some(r => r.path.startsWith('/rest/v1/admins'))).toBe(false);
});

test('constructs proposal attribution and defaults exclusively on server', async () => {
  await POST(await actionRequest(studentCases[0]));
  expect(fixture.data.tables.proposals.at(-1)).toEqual({ id: 'insert-1', title: '[其他] title', content: 'body',
    author_name: 'Fixture student', status: '待審核', upvotes_count: 0 });
  expect(fixture.data.requests.filter(r => r.path.startsWith('/rest/')).every(r => !r.path.includes('select='))).toBe(true);
});

test('constructs anonymous feedback fallback without storing supplied identity', async () => {
  await POST(await actionRequest(studentCases[1]));
  expect(fixture.data.tables.feedback.at(-1)).toEqual({ id: 'insert-1', title: '123456789012345...',
    content: '1234567890123456789', category: '其他', is_anonymous: true, author_name: '匿名學生' });
});

test('sets server clock and only reply fields for feedback', async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-14T12:00:00Z'));
  try {
    const before = { ...fixture.data.tables.feedback[0] };
    await POST(await actionRequest(adminCases[5], 'admin'));
    expect(fixture.data.tables.feedback[0]).toEqual({ ...before, reply: 'reply', replied_at: '2026-10-14T12:00:00.000Z' });
  } finally { vi.useRealTimers(); }
});

test.each(['proposal-2', 'proposal-3', 'proposal-4', 'missing'])('rejects comment on invisible %s before insert', async proposalId => {
  const response = await POST(await actionRequest({ action: 'addComment', payload: { proposalId, content: 'text', isAnonymous: true } }));
  expect(response.status).toBe(409);
  expect(fixture.data.counters.total).toBe(0);
});

test('updates only vote count with explicit public-status and id filters', async () => {
  const before = { ...fixture.data.tables.proposals[0] };
  await POST(await actionRequest(studentCases[3]));
  expect(fixture.data.tables.proposals[0]).toEqual({ ...before, upvotes_count: 2 });
  const call = fixture.data.requests.find(r => r.method === 'PATCH');
  const url = new URL(call?.path ?? '', fixture.url);
  expect(Object.fromEntries(url.searchParams)).toEqual({ id: 'eq.proposal-1', status: 'in.(研議中,通過,已採納,不採納)', select: 'id,upvotes_count' });
});

test('requires both comment and proposal id for deletion', async () => {
  const response = await POST(await actionRequest({ action: 'deleteComment', payload: { id: 'comment-1', proposalId: 'proposal-2' } }, 'admin'));
  expect(response.status).toBe(409);
  expect(fixture.data.tables.proposal_comments).toHaveLength(1);
  expect(fixture.data.requests.find(r => r.method === 'DELETE')?.path).toContain('proposal_id=eq.proposal-2');
});

test.each([{ rows: [] }, { rows: [{ id: 'proposal-1' }, { id: 'proposal-1' }] }])('never reports success for non-single returning rows', async ({ rows }) => {
  const request = await actionRequest({ action: 'deleteProposal', payload: { id: 'proposal-1' } }, 'admin');
  const original = globalThis.fetch;
  vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => init?.method === 'DELETE'
    ? Promise.resolve(Response.json(rows)) : original(input, init));
  expect((await POST(request)).status).toBe(409);
});

test('never guesses success when returning SELECT is denied', async () => {
  const request = await actionRequest(adminCases[0], 'admin');
  const original = globalThis.fetch;
  let writes = 0;
  vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
    if (init?.method === 'PATCH') { writes++; return Promise.resolve(Response.json({ message: 'SECRET_DB_ERROR' }, { status: 403 })); }
    return original(input, init);
  });
  const response = await POST(request);
  expect(response.status).toBe(503);
  expect(await response.text()).not.toContain('SECRET_DB_ERROR');
  expect(writes).toBe(1);
});

test.each([
  { body: { action: 'unknown', payload: {} }, headers: {}, status: 400 },
  { body: { action: 'setVoteCount', payload: { proposalId: 'proposal-1', count: 2, reply: 'inject' } }, headers: {}, status: 400 },
  { body: { action: 'setVoteCount', payload: { proposalId: 'proposal-1', count: 2, status: '通過' } }, headers: {}, status: 400 },
  { body: studentCases[0], headers: { origin: '' }, status: 403 },
  { body: studentCases[0], headers: { origin: 'null' }, status: 403 },
  { body: studentCases[0], headers: { origin: 'not a URL' }, status: 403 },
  { body: studentCases[0], headers: { origin: 'https://evil.test', 'x-forwarded-host': 'evil.test' }, status: 403 },
  { body: studentCases[0], headers: { 'x-requested-with': '' }, status: 403 },
  { body: studentCases[0], headers: { 'content-type': 'text/plain' }, status: 415 },
])('rejects invalid request $status before writes', async ({ body, headers, status }) => {
  const response = await POST(await actionRequest(body, 'student', headers));
  expect(response.status).toBe(status);
  expect(fixture.data.counters.total).toBe(0);
});

test('rejects malformed JSON before DB mutations', async () => {
  const seeded = await actionRequest(studentCases[0]);
  const request = new NextRequest(seeded.url, { method: 'POST', headers: seeded.headers, body: '{' });
  expect((await POST(request)).status).toBe(400);
  expect(fixture.data.counters.total).toBe(0);
});

test('caps streamed bytes despite a lying Content-Length', async () => {
  const seeded = await actionRequest(studentCases[0]);
  const headers = new Headers(seeded.headers);
  headers.set('content-length', '1');
  const body = new ReadableStream({ start(controller) {
    controller.enqueue(new Uint8Array(32768)); controller.enqueue(new Uint8Array(32769)); controller.close();
  } });
  const request = new NextRequest(seeded.url, { method: 'POST', headers, body });
  expect((await POST(request)).status).toBe(413);
  expect(fixture.data.counters.total).toBe(0);
});

test('denies invalid session before any database writes', async () => {
  const request = await actionRequest(studentCases[0]);
  request.headers.delete('cookie');
  const anonymous = new NextRequest(request.url, { method: 'POST', headers: request.headers, body: JSON.stringify(studentCases[0]) });
  expect((await POST(anonymous)).status).toBe(401);
  expect(fixture.data.counters.total).toBe(0);
});

test('denies forged token with admin metadata before writes', async () => {
  const session = { ...fixtureSession('admin'), access_token: 'invalid.token.signature' };
  const seeded = await sessionRequest(fixture.url, 'admin', session);
  const request = await actionRequest(adminCases[0]);
  request.headers.set('cookie', seeded.headers.get('cookie') ?? '');
  const forged = new NextRequest(request.url, { method: 'POST', headers: request.headers, body: JSON.stringify(adminCases[0]) });
  expect((await POST(forged)).status).toBe(401);
  expect(fixture.data.counters.total).toBe(0);
});

test('rejects absent Origin rather than trusting forwarded host', async () => {
  const request = await actionRequest(studentCases[0]);
  request.headers.delete('origin');
  request.headers.set('x-forwarded-host', 'localhost');
  expect((await POST(request)).status).toBe(403);
  expect(fixture.data.counters.total).toBe(0);
});

test('client distinguishes success with failed refresh without mutation retry', async () => {
  const fetcher = vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ ok: true, data: { inserted: true } }));
  const result = await sendRightsAction(studentCases[0], async () => { throw new TypeError('refresh failed'); });
  expect(result).toMatchObject({ ok: true, refresh: 'failed', message: '已儲存，但清單更新失敗' });
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(fetcher.mock.calls[0]?.[1]?.headers).toEqual({ 'Content-Type': 'application/json', 'X-Requested-With': 'nehs-web' });
});

test.each(['reject', 'disconnect', 'uncertain'] as const)('client distinguishes %s without retry', async mode => {
  const fetcher = vi.spyOn(globalThis, 'fetch');
  if (mode === 'reject') fetcher.mockResolvedValue(Response.json({ ok: false, code: 'FORBIDDEN' }, { status: 403 }));
  else if (mode === 'uncertain') fetcher.mockResolvedValue(Response.json({ ok: false, code: 'UNAVAILABLE' }, { status: 503 }));
  else fetcher.mockRejectedValue(new TypeError('connection lost'));
  expect(await sendRightsAction(studentCases[0])).toMatchObject({ ok: false, code: mode === 'reject' ? 'FORBIDDEN' : 'OUTCOME_UNKNOWN' });
  expect(fetcher).toHaveBeenCalledTimes(1);
});

test('single flight shares only the active operation', async () => {
  let resolve: (response: Response) => void = () => { throw new TypeError('not started'); };
  const fetcher = vi.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise<Response>(r => { resolve = r; }));
  const send = createRightsActionFlight();
  const first = send(studentCases[0]);
  const second = send(studentCases[0]);
  expect(second).toBe(first);
  resolve(Response.json({ ok: true, data: { inserted: true } }));
  await first;
  expect(fetcher).toHaveBeenCalledTimes(1);
});
