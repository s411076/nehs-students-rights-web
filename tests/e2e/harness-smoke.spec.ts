import { test, expect } from '@playwright/test';
import { seedSessionCookies } from '../fixtures/browser-auth';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

test('harness smoke renders real home and records offline SDK requests', async ({ page, context, request, baseURL }) => {
  const fixtureURL = process.env.FIXTURE_URL;
  if (!fixtureURL || !baseURL) throw new TypeError('Harness URLs required');
  await request.post(`${fixtureURL}/__fixture/reset`);
  const external: string[] = [];
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin !== baseURL && url.origin !== fixtureURL) { external.push(url.origin); await route.abort('blockedbyclient'); return; }
    await route.continue();
  });
  const cookies = await seedSessionCookies(context, { appURL: baseURL, fixtureURL });
  expect(cookies.some(cookie => cookie.name.startsWith('sb-') && cookie.name.endsWith('.0'))).toBe(true);
  await page.goto('/');
  await expect(page.getByText('Offline fixture announcement', { exact: true })).toBeVisible();
  await expect.poll(async () => {
    const state = await (await request.get(`${fixtureURL}/__fixture/state`)).json();
    return state.requests.some((entry: { path: string }) => entry.path.startsWith('/rest/v1/home_sections'));
  }).toBe(true);
  expect(external).toEqual([]);
  await page.screenshot({ path: resolve('.omo/evidence/source-security-remediation/task-1/home.png'), fullPage: true });
  const state = await (await request.get(`${fixtureURL}/__fixture/state`)).json();
  await writeFile(resolve('.omo/evidence/source-security-remediation/task-1/requests.json'), JSON.stringify({
    counters: state.counters,
    requests: state.requests.map((entry: { method: string; path: string }) => ({ method: entry.method, path: entry.path })),
  }, null, 2));
});
