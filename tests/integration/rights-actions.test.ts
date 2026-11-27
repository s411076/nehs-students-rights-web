// @vitest-environment node
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { fixtureSession, startSupabaseFixture } from '../fixtures/supabase-server';
import { fakePublishableKey } from '../fixtures/supabase-data';
import { sessionRequest } from '../fixtures/server-auth-request';
vi.mock('server-only', () => ({}));
import { POST } from '../../app/api/rights/actions/route';
import type { RightsActionRequest } from '../../lib/rights/contracts';

let fixture: Awaited<ReturnType<typeof startSupabaseFixture>>;
beforeEach(async () => {
  fixture = await startSupabaseFixture();
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', fixture.url);
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', fakePublishableKey);
});
afterEach(async () => { vi.unstubAllEnvs(); await fixture.close(); });
const adminCases = [
  { action: 'updateProposalControl', payload: { id: '10000000-0000-4000-8000-000000000001', status: '處理中', reply: 'reply', expectedVersion: 1 } },
  { action: 'approveProposal', payload: { id: '10000000-0000-4000-8000-000000000002', expectedVersion: 1 } },
  { action: 'rejectProposal', payload: { id: '10000000-0000-4000-8000-000000000002', expectedVersion: 1 } },
  { action: 'deleteProposal', payload: { id: '10000000-0000-4000-8000-000000000001', expectedVersion: 1 } },
  { action: 'deleteComment', payload: { id: '40000000-0000-4000-8000-000000000001', proposalId: '10000000-0000-4000-8000-000000000001', expectedVersion: 1 } },
  { action: 'saveFeedbackReply', payload: { id: '20000000-0000-4000-8000-000000000001', reply: 'reply', expectedVersion: 1 } },
  { action: 'deleteFeedback', payload: { id: '20000000-0000-4000-8000-000000000001', expectedVersion: 1 } },
  { action: 'createHomeSection', payload: { clientKey: 'abc00000-0000-4000-8000-000000000001', title: 'home', content: 'body' } },
  { action: 'deleteHomeSection', payload: { id: '30000000-0000-4000-8000-000000000001', expectedVersion: 1 } },
] satisfies RightsActionRequest[];
const studentCases = [
  { action: 'createProposal', payload: { clientKey: 'abc00000-0000-4000-8000-000000000001', title: 'title', content: 'body', category: '其他' } },
  { action: 'createFeedback', payload: { clientKey: 'abc00000-0000-4000-8000-000000000001', title: '', content: '1234567890123456789', category: '其他', isAnonymous: true } },
  { action: 'addComment', payload: { clientKey: 'abc00000-0000-4000-8000-000000000001', proposalId: '10000000-0000-4000-8000-000000000001', content: 'comment', isAnonymous: false } },
  { action: 'setVote', payload: { proposalId: '10000000-0000-4000-8000-000000000001', voted: true } },
] satisfies RightsActionRequest[];
async function actionRequest(body: unknown, identity: 'student' | 'admin' = 'student', headers: Readonly<Record<string, string | undefined>> = {}) {
  const seeded = await sessionRequest(fixture.url, identity);
  return new NextRequest('http://localhost/api/rights/actions', {
    method: 'POST', headers: { cookie: seeded.headers.get('cookie') ?? '', origin: 'http://localhost',
      'x-requested-with': 'nehs-web', 'content-type': 'application/json',
      ...Object.fromEntries(Object.entries(headers).filter((entry): entry is [string, string] => typeof entry[1] === 'string')) }, body: JSON.stringify(body),
  });
}
const rpcCases = [
  ['update_proposal_control', { p_id: '10000000-0000-4000-8000-000000000001', p_status: '處理中', p_reply: 'reply', p_expected_version: 1 }],
  ['approve_proposal', { p_id: '10000000-0000-4000-8000-000000000002', p_expected_version: 1 }],
  ['reject_proposal', { p_id: '10000000-0000-4000-8000-000000000002', p_expected_version: 1 }],
  ['delete_proposal', { p_id: '10000000-0000-4000-8000-000000000001', p_expected_version: 1 }],
  ['delete_comment', { p_id: '40000000-0000-4000-8000-000000000001', p_proposal_id: '10000000-0000-4000-8000-000000000001', p_expected_version: 1 }],
  ['save_feedback_reply', { p_id: '20000000-0000-4000-8000-000000000001', p_reply: 'reply', p_expected_version: 1 }],
  ['delete_feedback', { p_id: '20000000-0000-4000-8000-000000000001', p_expected_version: 1 }],
  ['create_home_section', { p_client_key: 'abc00000-0000-4000-8000-000000000001', p_title: 'home', p_content: 'body' }],
  ['delete_home_section', { p_id: '30000000-0000-4000-8000-000000000001', p_expected_version: 1 }],
  ['create_proposal', { p_client_key: 'abc00000-0000-4000-8000-000000000001', p_title: 'title', p_content: 'body', p_category: '其他' }],
  ['create_feedback', { p_client_key: 'abc00000-0000-4000-8000-000000000001', p_title: '', p_content: '1234567890123456789', p_category: '其他', p_is_anonymous: true }],
  ['add_comment', { p_client_key: 'abc00000-0000-4000-8000-000000000001', p_proposal_id: '10000000-0000-4000-8000-000000000001', p_content: 'comment', p_is_anonymous: false }],
  ['set_vote', { p_proposal_id: '10000000-0000-4000-8000-000000000001', p_voted: true }],
] as const;
test.each(adminCases)('denies student $action before mutation RPC', async body => {
  // Given a student; when requesting an admin mutation; then no writes occur.
  const response = await POST(await actionRequest(body));
  expect(response.status).toBe(403);
  expect(fixture.data.counters.total).toBe(0);
  expect(fixture.data.requests.filter(r => r.path.startsWith('/rest/')).map(r => r.path)).toEqual(['/rest/v1/rpc/rights_is_admin']);
});
test.each([...adminCases, ...studentCases].map((body, index) => ({ body, rpc: rpcCases[index] })))('executes $body.action using exact RPC args', async ({ body, rpc }) => {
  // Given an authorized caller; when dispatching; then one scoped RPC produces a typed receipt.
  const request = await actionRequest(body, 'admin');
  const original = globalThis.fetch;
  let written: unknown;
  vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
    if (String(input).includes(`/rpc/rights_${rpc[0]}`)) written = JSON.parse(String(init?.body));
    return original(input, init);
  });
  const response = await POST(request);
  expect(response.status).toBe(200);
  const result = await response.json();
  if ('id' in body.payload) expect(result.data.id).toBe(body.payload.id);
  expect(result.ok).toBe(true);
  expect(written).toEqual(rpc[1]);
  expect(fixture.data.counters.total).toBe(1);
  expect(fixture.data.requests.filter(r => r.path.startsWith('/rest/')).every(r => r.path.startsWith('/rest/v1/rpc/rights_'))).toBe(true);
});
test('returns private, no-store action responses without CORS access', async () => {
  const response = await POST(await actionRequest(adminCases[0], 'admin'));
  expect(response.status).toBe(200);
  expect(response.headers.get('cache-control')).toBe('private, no-store');
  expect(response.headers.has('access-control-allow-origin')).toBe(false);
});
test.each(studentCases)('executes student $action without role RPC', async body => {
  const response = await POST(await actionRequest(body));
  expect(response.status).toBe(200);
  expect(fixture.data.requests.some(r => r.path.includes('rights_is_admin'))).toBe(false);
});
test.each([['PT400', 400], ['22P02', 400], ['PT401', 401], ['PT403', 403], ['42501', 403], ['PT409', 409], ['23505', 409], ['XX000', 503]] as const)('maps database %s to generic %s', async (code, status) => {
  const request = await actionRequest(studentCases[0]);
  const original = globalThis.fetch;
  vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => String(input).includes('/rpc/rights_create_proposal')
    ? Promise.resolve(Response.json({ code, message: 'SECRET_DB_ERROR' }, { status: 400 })) : original(input, init));
  const response = await POST(request);
  expect(response.status).toBe(status);
  expect(await response.text()).not.toContain('SECRET_DB_ERROR');
});
test.each([[], { inserted: true }, { id: 'x', version: 1, secret: 'PRIVATE' }])('rejects malformed RPC receipt %j', async receipt => {
  const request = await actionRequest(studentCases[0]);
  const original = globalThis.fetch;
  vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => String(input).includes('/rpc/rights_create_proposal')
    ? Promise.resolve(Response.json(receipt)) : original(input, init));
  expect((await POST(request)).status).toBe(503);
});
test.each([
  { body: { action: 'setVoteCount', payload: { proposalId: '10000000-0000-4000-8000-000000000001', count: 2 } }, headers: {}, status: 400 },
  { body: { action: 'setVote', payload: { proposalId: '10000000-0000-4000-8000-000000000001', voted: true, status: '處理中' } }, headers: {}, status: 400 },
  { body: studentCases[0], headers: { origin: '' }, status: 403 },
  { body: studentCases[0], headers: { origin: 'null' }, status: 403 },
  { body: studentCases[0], headers: { origin: 'not a URL' }, status: 403 },
  { body: studentCases[0], headers: { origin: 'https://evil.test', 'x-forwarded-host': 'evil.test' }, status: 403 },
  { body: studentCases[0], headers: { 'x-requested-with': '' }, status: 403 },
  { body: studentCases[0], headers: { 'content-type': 'text/plain' }, status: 415 },
])('rejects invalid transport/payload $status before writes', async ({ body, headers, status }) => {
  const response = await POST(await actionRequest(body, 'student', headers));
  expect(response.status).toBe(status);
  expect(fixture.data.counters.total).toBe(0);
});
test('rejects malformed JSON without writes', async () => {
  const seeded = await actionRequest(studentCases[0]);
  expect((await POST(new NextRequest(seeded.url, { method: 'POST', headers: seeded.headers, body: '{' }))).status).toBe(400);
  expect(fixture.data.counters.total).toBe(0);
});
test('caps streamed bytes despite lying Content-Length', async () => {
  const seeded = await actionRequest(studentCases[0]);
  seeded.headers.set('content-length', '1');
  const body = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(65537)); controller.close(); } });
  expect((await POST(new NextRequest(seeded.url, { method: 'POST', headers: seeded.headers, body }))).status).toBe(413);
  expect(fixture.data.counters.total).toBe(0);
});
test.each(['absent', 'forged'] as const)('denies %s identity before mutation RPC', async mode => {
  const request = await actionRequest(adminCases[0]);
  if (mode === 'absent') request.headers.delete('cookie');
  else {
    const seeded = await sessionRequest(fixture.url, 'admin', { ...fixtureSession('admin'), access_token: 'invalid.token.signature' });
    request.headers.set('cookie', seeded.headers.get('cookie') ?? '');
  }
  expect((await POST(new NextRequest(request.url, { method: 'POST', headers: request.headers, body: JSON.stringify(adminCases[0]) }))).status).toBe(401);
  expect(fixture.data.counters.total).toBe(0);
});
test('rejects absent Origin despite trusted-looking forwarded host', async () => {
  const request = await actionRequest(studentCases[0]);
  request.headers.delete('origin'); request.headers.set('x-forwarded-host', 'localhost');
  expect((await POST(request)).status).toBe(403);
  expect(fixture.data.counters.total).toBe(0);
});
