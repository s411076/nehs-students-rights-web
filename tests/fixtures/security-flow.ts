import { test, expect, type APIRequestContext, type BrowserContext } from '@playwright/test';
import { seedSessionCookies } from './browser-auth';
import type { FixtureIdentity } from './supabase-data';

export const appURL = 'http://localhost:4173';
const fixtureURL = 'http://127.0.0.1:4174';
export { test, expect };
test.beforeEach(async ({ request, page }) => {
  expect((await request.post(`${fixtureURL}/__fixture/reset`)).ok()).toBe(true);
  page.on('dialog', dialog => dialog.accept());
});

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('Expected fixture object');
  return Object.fromEntries(Object.entries(value));
}

export async function state(request: APIRequestContext) {
  const raw = record(await (await request.get(`${fixtureURL}/__fixture/state`)).json());
  const counters = record(raw.counters);
  if (typeof counters.total !== 'number' || !Array.isArray(raw.requests)) throw new TypeError('Invalid fixture state');
  const requests = raw.requests.map(value => {
    const entry = record(value);
    if (typeof entry.path !== 'string' || typeof entry.method !== 'string') throw new TypeError('Invalid query log');
    return { path: entry.path, method: entry.method };
  });
  const tables = record(raw.tables);
  return { total: counters.total, requests, rows: (table: string) => {
    const rows = tables[table];
    if (!Array.isArray(rows)) throw new TypeError('Invalid fixture table');
    return rows.map(record);
  } };
}

export async function control(request: APIRequestContext, value: Record<string, unknown>) {
  expect((await request.post(`${fixtureURL}/__fixture/control`, { data: value })).ok()).toBe(true);
}

export async function login(context: BrowserContext, identity: FixtureIdentity) {
  await seedSessionCookies(context, { appURL, fixtureURL, identity });
}
