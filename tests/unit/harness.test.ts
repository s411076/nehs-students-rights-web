// @vitest-environment node
import { beforeEach, afterEach, expect, test } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { startSupabaseFixture, fixtureSession } from '../fixtures/supabase-server';
import { fakePublishableKey, fixtureUsers } from '../fixtures/supabase-data';
import type { FixtureIdentity } from '../fixtures/supabase-data';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

let fixture: Awaited<ReturnType<typeof startSupabaseFixture>>;
beforeEach(async () => { fixture = await startSupabaseFixture(); });
afterEach(async () => { await fixture.close(); });

test('verifies token independently when cookie JSON claims admin', async () => {
  const cookie = JSON.stringify({ user: fixtureUsers.admin, isAdmin: true });
  const response = await fetch(`${fixture.url}/auth/v1/user`, { headers: { apikey: fakePublishableKey, Authorization: 'Bearer forged', Cookie: cookie } });
  expect(response.status).toBe(401);
});

test('rejects expired tokens when sent directly to Auth', async () => {
  const response = await fetch(`${fixture.url}/auth/v1/user`, { headers: { apikey: fakePublishableKey, Authorization: `Bearer ${fixtureSession('admin', true).access_token}` } });
  expect(response.status).toBe(401);
});

test('returns verified student when real SDK requests user', async () => {
  const client = createClient(fixture.url, fakePublishableKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const result = await client.auth.getUser(fixtureSession().access_token);
  expect(result.data.user?.email).toBe('student@nehs.hc.edu.tw');
});

test('projects and filters when SDK requests public fields', async () => {
  const client = createClient(fixture.url, fakePublishableKey, { auth: { persistSession: false } });
  const result = await client.from('proposals').select('id,status').in('status', ['處理中']).eq('id', 'proposal-1').limit(1);
  expect(result.data).toEqual([{ id: 'proposal-1', status: '處理中' }]);
});

test('allows unauthorized privileged student mutation when bypassing application', async () => {
  const client = createClient(fixture.url, fakePublishableKey, { global: { headers: { Authorization: `Bearer ${fixtureSession().access_token}` } }, auth: { persistSession: false } });
  const result = await client.from('feedback').update({ reply: 'Unauthorized student reply' }).eq('id', 'feedback-1').select('id,reply');
  expect(result.data).toEqual([{ id: 'feedback-1', reply: 'Unauthorized student reply' }]);
  expect(fixture.data.counters).toEqual({ insert: 0, update: 1, delete: 0, total: 1 });
});

test('resets data and counters when a test resets fixture', () => {
  fixture.data.tables.feedback[0].reply = 'prior test';
  fixture.data.counters.total = 3;
  fixture.data.reset();
  expect(fixture.data.tables.feedback[0].reply).toBe('');
  expect(fixture.data.counters.total).toBe(0);
});

test('counts inserts when student inserts directly through SDK', async () => {
  const client = createClient(fixture.url, fakePublishableKey, { global: { headers: { Authorization: `Bearer ${fixtureSession().access_token}` } }, auth: { persistSession: false } });
  const result = await client.from('home_sections').insert({ title: 'Student direct insert' }).select('title');
  expect(result.data).toEqual([{ title: 'Student direct insert' }]);
  expect(fixture.data.counters.insert).toBe(1);
});

test('counts deletes when student deletes directly through SDK', async () => {
  const client = createClient(fixture.url, fakePublishableKey, { global: { headers: { Authorization: `Bearer ${fixtureSession().access_token}` } }, auth: { persistSession: false } });
  const result = await client.from('feedback').delete().eq('id', 'feedback-1').select('id');
  expect(result.data).toEqual([{ id: 'feedback-1' }]);
  expect(fixture.data.counters.delete).toBe(1);
});

test('rejects invalid refresh grant when supplied forged admin identity', async () => {
  const response = await fetch(`${fixture.url}/auth/v1/token?grant_type=refresh_token`, { method: 'POST', headers: { apikey: fakePublishableKey }, body: JSON.stringify({ refresh_token: 'forged', user: fixtureUsers.admin }) });
  expect(response.status).toBe(401);
});

test.each(['refresh_token', 'pkce'])('exchanges %s grant when valid fixture credentials are supplied', async grant => {
  const body = grant === 'pkce' ? { auth_code: 'fixture-code-student', code_verifier: 'fixture-verifier' } : { refresh_token: 'fixture-refresh-student' };
  const response = await fetch(`${fixture.url}/auth/v1/token?grant_type=${grant}`, { method: 'POST', headers: { apikey: fakePublishableKey }, body: JSON.stringify(body) });
  expect(await response.json()).toMatchObject({ user: { email: 'student@nehs.hc.edu.tw' }, token_type: 'bearer' });
});

test('fails subprocess when unexpected external destination is requested', () => {
  const result = spawnSync(process.execPath, ['--import', resolve('tests/fixtures/offline-network.mjs'), '-e', "fetch('https://unexpected.supabase.invalid/auth/v1/user')"], { encoding: 'utf8' });
  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain('Offline harness blocked external destination');
});

function rpc(name: string, body: Record<string, unknown> = {}, identity?: FixtureIdentity) {
  return fetch(`${fixture.url}/rest/v1/rpc/rights_${name}`, { method: 'POST',
    headers: { apikey: fakePublishableKey, 'Content-Type': 'application/json',
      ...(identity ? { Authorization: `Bearer ${fixtureSession(identity).access_token}` } : {}) }, body: JSON.stringify(body) });
}

test('returns public pages with server votes and redaction when reading guarded RPCs', async () => {
  // Given baseline private and anonymous records; when a guest lists them.
  const proposals = await (await rpc('list_public_proposals')).json();
  const feedback = await (await rpc('list_public_feedback')).json();
  // Then only public DTO fields and the frozen pagination shape are returned.
  expect(proposals).toEqual({ items: [expect.objectContaining({ id: 'proposal-1', version: 1, viewer_voted: false, legacy_upvotes_count: 0 })], nextCursor: null });
  expect(JSON.stringify(proposals)).not.toContain('PRIVATE_SENTINEL');
  expect(feedback.items[0]).not.toHaveProperty('author_name');
  expect(fixture.data.counters.total).toBe(0);
  expect(fixture.data.rpcCounters).toEqual({ read: 2, mutation: 0 });
});

test('paginates more than fifty filtered records without rounding timestamp cursors', async () => {
  // Given synthetic rows seeded only through fixture control.
  const rows = Array.from({ length: 55 }, (_, index) => ({ ...fixture.data.tables.proposals[0],
    id: `page-${String(index).padStart(3, '0')}`, title: 'Pagination needle',
    created_at: `2026-01-01T00:00:00.${String(index).padStart(6, '0')}Z` }));
  await fetch(`${fixture.url}/__fixture/control`, { method: 'POST', body: JSON.stringify({ table: 'proposals', rows }) });
  // When a filtered first page and its continuation are requested.
  const first = await (await rpc('list_public_proposals', { p_limit: 50, p_query: 'needle' })).json();
  const second = await (await rpc('list_public_proposals', { p_limit: 50, p_query: 'needle', p_cursor: first.nextCursor })).json();
  // Then all matching IDs appear once and full microseconds survive the cursor.
  expect(first.nextCursor).toEqual({ id: 'page-005', created_at: '2026-01-01T00:00:00.000005Z' });
  expect([...first.items, ...second.items].map((row: { id: string }) => row.id)).toEqual(rows.map(row => row.id).reverse());
  expect(second.nextCursor).toBeNull();
});

test.each([{ p_limit: 51 }, { p_limit: 0 }, { p_cursor: { id: 'x', created_at: 'bad' } }, { p_query: '😀'.repeat(101) }])('rejects invalid pagination %j without writes', async body => {
  // Given malformed read parameters; when a list RPC receives them.
  const response = await rpc('list_public_proposals', body);
  // Then a deliberate SQLSTATE is returned and no mutation is counted.
  expect(response.status).toBe(400);
  expect(await response.json()).toMatchObject({ code: 'PT400' });
  expect(fixture.data.counters.total).toBe(0);
});

test.each(['outsider', 'unconfirmed', 'student'] as const)('rejects %s admin RPC access independently of permissive raw controls', async identity => {
  // Given a nonadmin provider identity; when a protected mutation is called directly.
  const response = await rpc('save_feedback_reply', { p_id: 'feedback-1', p_reply: 'ATTACK', p_expected_version: 1 }, identity);
  // Then fake RPC authorization denies it without any persisted write.
  expect(response.status).toBe(403);
  expect(await response.json()).toMatchObject({ code: 'PT403' });
  expect(fixture.data.counters.total).toBe(0);
});

test('requires authentication when a guest invokes mutation RPC', async () => {
  // Given no provider token; when voting directly.
  const response = await rpc('set_vote', { p_proposal_id: 'proposal-1', p_voted: true });
  // Then PT401 is observable without a write.
  expect(await response.json()).toMatchObject({ code: 'PT401' });
  expect(fixture.data.counters.total).toBe(0);
});

test('keeps desired votes idempotent per user without changing baseline or content version', async () => {
  // Given an immutable historical baseline, not a previous ledger.
  fixture.data.tables.proposals[0].upvotes_count = 7;
  fixture.data.legacyVotes.set('proposal-1', 7);
  // When two users vote and a duplicate student request arrives before cancellation.
  const body = { p_proposal_id: 'proposal-1', p_voted: true };
  await rpc('set_vote', body, 'student');
  await rpc('set_vote', body, 'admin');
  const duplicate = await (await rpc('set_vote', body, 'student')).json();
  const cancelled = await (await rpc('set_vote', { ...body, p_voted: false }, 'student')).json();
  // Then only actual ballot changes count and other users' votes remain.
  expect(duplicate).toEqual({ id: 'proposal-1', voted: true, upvotes_count: 9 });
  expect(cancelled).toEqual({ id: 'proposal-1', voted: false, upvotes_count: 8 });
  expect(fixture.data.counters.total).toBe(3);
  expect(fixture.data.tables.proposals[0].version).toBe(1);
  const page = await (await rpc('list_public_proposals', {}, 'admin')).json();
  expect(page.items[0]).toMatchObject({ viewer_voted: true, legacy_upvotes_count: 7, upvotes_count: 8 });
});

test('increments versions and rejects stale or already reviewed targets without counting writes', async () => {
  // Given a pending proposal at version one; when it is approved twice.
  const body = { p_id: 'proposal-2', p_expected_version: 1 };
  const approved = await (await rpc('approve_proposal', body, 'admin')).json();
  const stale = await rpc('approve_proposal', body, 'admin');
  const reviewed = await rpc('reject_proposal', { ...body, p_expected_version: 2 }, 'admin');
  const missing = await rpc('delete_feedback', { p_id: 'missing', p_expected_version: 1 }, 'admin');
  // Then receipt/version and all three conflicts are distinct from successful writes.
  expect(approved).toEqual({ id: 'proposal-2', version: 2 });
  for (const response of [stale, reviewed, missing]) expect(await response.json()).toMatchObject({ code: 'PT409' });
  expect(fixture.data.counters.total).toBe(1);
});

test('derives attribution and reply defaults while public anonymous reads stay redacted even for admins', async () => {
  // Given a verified school identity; when anonymous feedback is created.
  const receipt = await (await rpc('create_feedback', { p_title: 'New feedback', p_content: 'Body', p_category: '其他', p_is_anonymous: true }, 'student')).json();
  // Then new attribution is known only through the admin lookup, with explicit reply defaults.
  expect(receipt).toEqual({ inserted: true, id: 'insert-1', version: 1 });
  const publicItem = await (await rpc('get_public_item', { p_kind: 'feedback', p_id: receipt.id }, 'admin')).json();
  expect(publicItem).toMatchObject({ reply: '', replied_at: null, version: 1 });
  expect(publicItem).not.toHaveProperty('author_name');
  expect(await (await rpc('admin_author', { p_kind: 'feedback', p_id: receipt.id }, 'admin')).json()).toEqual({
    attribution: 'known', user_id: 'student', email: 'student@nehs.hc.edu.tw', display_name: 'Fixture student' });
  expect(await (await rpc('admin_author', { p_kind: 'feedback', p_id: 'feedback-1' }, 'admin')).json()).toMatchObject({ attribution: 'legacy_unverified', user_id: null, email: null });
});

test('clears ballots, attribution, faults and revoked tokens when resetting over HTTP', async () => {
  // Given a vote and revoked student token.
  await rpc('set_vote', { p_proposal_id: 'proposal-1', p_voted: true }, 'student');
  await fetch(`${fixture.url}/__fixture/control`, { method: 'POST', body: JSON.stringify({ revoke: 'student', path: '/rest/v1/rpc/rights_list_public_feedback', method: 'POST' }) });
  // When a new test resets the provider.
  await fetch(`${fixture.url}/__fixture/reset`, { method: 'POST' });
  // Then the fresh fixture token works, fault is gone and no ledger leaks across tests.
  expect((await rpc('list_public_feedback')).status).toBe(200);
  expect((await rpc('set_vote', { p_proposal_id: 'proposal-1', p_voted: false }, 'student')).status).toBe(200);
  expect(fixture.data.votes.size).toBe(0);
  expect(fixture.data.authors.size).toBe(0);
  expect(fixture.data.counters.total).toBe(0);
});

test.each([
  { title: '', content: '😀'.repeat(16), expected: '😀'.repeat(15) + '...' },
  { title: '　 ', content: '　Short body　', expected: 'Short body' },
  { title: '', content: '123456789012345', expected: '123456789012345' },
  { title: ' Explicit title ', content: 'Body', expected: 'Explicit title' },
])('derives the SQL feedback title when receiving $title and $content', async ({ title, content, expected }) => {
  // Given valid anonymous feedback with an optional title; when the create RPC runs.
  const response = await rpc('create_feedback', { p_title: title, p_content: content, p_category: '其他', p_is_anonymous: true }, 'student');
  // Then persisted title, identity and defaults follow the SQL create function.
  expect(response.status).toBe(200);
  expect(fixture.data.tables.feedback.at(-1)).toMatchObject({ title: expected, author_name: 'Fixture student', user_id: 'student',
    is_anonymous: true, attribution_trusted: true, reply: '', replied_at: null });
});

test.each([
  { title: ' Request ', expected: '[其他] Request' },
  { title: ' [課程與教學] Existing prefix ', expected: '[課程與教學] Existing prefix' },
])('preserves SQL proposal prefix semantics when receiving $title', async ({ title, expected }) => {
  // Given a school identity and a title; when the proposal is created.
  const response = await rpc('create_proposal', { p_title: title, p_content: 'Body', p_category: '其他' }, 'student');
  // Then a preexisting bracket prefix is preserved rather than duplicated.
  expect(response.status).toBe(200);
  expect(fixture.data.tables.proposals.at(-1)).toMatchObject({ title: expected, status: '待審核', version: 1 });
});

test('keeps admin feedback lists redacted when anonymous authors exist', async () => {
  // Given an anonymous record containing a private author; when an admin lists feedback.
  const page = await (await rpc('list_admin_feedback', {}, 'admin')).json();
  // Then only the separate author lookup may expose attribution, never the list.
  expect(page.items[0]).not.toHaveProperty('author_name');
  expect(JSON.stringify(page)).not.toContain('ANONYMOUS_AUTHOR_SENTINEL');
});

test('records a reply timestamp when an admin clears a reply', async () => {
  // Given a reply draft containing only whitespace; when the save RPC runs.
  const response = await rpc('save_feedback_reply', { p_id: 'feedback-1', p_reply: '　 ', p_expected_version: 1 }, 'admin');
  // Then SQL text normalization and save timestamp apply even to an empty reply.
  expect(await response.json()).toEqual({ id: 'feedback-1', version: 2 });
  expect(fixture.data.tables.feedback[0]).toMatchObject({ reply: '', replied_at: '2026-01-02T00:00:00Z' });
});

test.each(['proposal-2', 'missing'])('returns an empty comment page when proposal %s is not public', async id => {
  // Given a hidden or absent proposal; when its comments are listed.
  const response = await rpc('list_public_comments', { p_proposal_id: id });
  // Then the read returns an empty page rather than a mutation conflict.
  expect(await response.json()).toEqual({ items: [], nextCursor: null });
});
