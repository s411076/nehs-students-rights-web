import { test as base, expect } from '@playwright/test';
import type { APIRequestContext, BrowserContext, Page } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { seedSessionCookies } from './browser-auth';
import type { FixtureIdentity } from './supabase-data';
import { createChunks, stringToBase64URL } from '@supabase/ssr';
import { fixtureSession } from './supabase-server';

export const evidence = resolve('.omo/evidence/source-security-remediation/task-14');
const configuredApp = process.env.HARNESS_APP_URL;
const configuredProvider = process.env.FIXTURE_URL;
if (!configuredApp || !configuredProvider) throw new TypeError('Security regression requires harness URLs');
export const appURL = configuredApp.replace('127.0.0.1', 'localhost');
export const fixtureURL = configuredProvider;

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

export async function forgedCookies(context: BrowserContext, token: string) {
  await login(context, 'student');
  const cookie = (await context.cookies()).find(value => value.name.endsWith('auth-token.0'));
  if (!cookie) throw new TypeError('Expected SDK chunked session cookie');
  await context.clearCookies();
  const session = { ...fixtureSession('admin'), access_token: token, refresh_token: 'forged-refresh' };
  const chunks = createChunks(cookie.name.replace(/\.0$/, ''), `base64-${stringToBase64URL(JSON.stringify(session))}`);
  await context.addCookies(chunks.map(value => ({ ...value, url: appURL, sameSite: 'Lax' })));
}

export async function post(context: BrowserContext, data: unknown, origin: string | null = appURL) {
  return context.request.post(`${appURL}/api/rights/actions`, {
    headers: { 'X-Requested-With': 'nehs-web', ...(origin === null ? {} : { Origin: origin }) }, data,
  });
}

export async function capture(page: Page, name: string) {
  await page.screenshot({ path: resolve(evidence, `${name}-${page.viewportSize()?.width}.png`), fullPage: true });
}

export const test = base.extend<{ networkAudit: void }>({
  networkAudit: [async ({ context, page, request }, run, info) => {
    await mkdir(evidence, { recursive: true });
    const directory = resolve(evidence, `${info.titlePath.join('-').replace(/[^a-zA-Z0-9-]/g, '_')}`);
    await mkdir(directory, { recursive: true });
    await context.tracing.start({ screenshots: true, snapshots: true, sources: true });
    await request.post(`${fixtureURL}/__fixture/reset`);
    await control(request, { defaults: true });
    const traffic: string[] = [];
    const external: string[] = [];
    await context.route('**/*', async route => {
      const url = new URL(route.request().url());
      traffic.push(url.href);
      if (url.origin !== appURL && url.origin !== fixtureURL) {
        external.push(url.href); await route.abort('blockedbyclient'); return;
      }
      await route.continue();
    });
    page.on('dialog', dialog => { void dialog.accept(); });
    try { await run(); } finally {
      const log = await state(request);
      await writeFile(resolve(directory, 'traffic.json'),
        JSON.stringify({ browser: traffic, external, server: log.requests, mutations: log.total,
          serverNetworkPolicy: 'offline-network.mjs blocks non-loopback fetch/http/https' }, null, 2));
      await page.screenshot({ path: resolve(directory, 'final.png'), fullPage: true });
      await writeFile(resolve(directory, 'visible.txt'), await page.locator('body').innerText());
      await context.tracing.stop({ path: resolve(directory, 'trace.zip') });
      expect(external).toEqual([]);
    }
  }, { auto: true }],
});
test.use({ baseURL: appURL, browserName: 'chromium', trace: 'off' });
export { expect };
