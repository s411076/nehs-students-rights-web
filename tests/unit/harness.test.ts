// @vitest-environment node
import { beforeEach, afterEach, expect, test } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { startSupabaseFixture, fixtureSession } from '../fixtures/supabase-server';
import { fakePublishableKey, fixtureUsers } from '../fixtures/supabase-data';
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
  const result = await client.from('proposals').select('id,status').in('status', ['研議中']).eq('id', 'proposal-1').limit(1);
  expect(result.data).toEqual([{ id: 'proposal-1', status: '研議中' }]);
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
