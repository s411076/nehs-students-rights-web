import { test, expect, login, appURL } from '../fixtures/security-flow';

test.use({ baseURL: appURL, trace: 'off' });
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

test('harness smoke renders real home and records offline SDK requests', async ({ page, context, request, baseURL }) => {
  const fixtureURL = process.env.FIXTURE_URL;
  if (!fixtureURL || !baseURL) throw new TypeError('Harness URLs required');
  await login(context, 'student');
  const cookies = await context.cookies();
  expect(cookies.some(cookie => cookie.name.startsWith('sb-') && cookie.name.endsWith('.0'))).toBe(true);
  await page.goto('/');
  await expect(page.getByText('Offline fixture announcement', { exact: true })).toBeVisible();
  await expect.poll(async () => {
    const state = await (await request.get(`${fixtureURL}/__fixture/state`)).json();
    return state.requests.some((entry: { path: string }) => entry.path.startsWith('/rest/v1/rpc/rights_list_home_sections'));
  }).toBe(true);
  await page.screenshot({ path: resolve('.omo/evidence/source-security-remediation/task-1/home.png'), fullPage: true });
  const state = await (await request.get(`${fixtureURL}/__fixture/state`)).json();
  await writeFile(resolve('.omo/evidence/source-security-remediation/task-1/requests.json'), JSON.stringify({
    counters: state.counters,
    requests: state.requests.map((entry: { method: string; path: string }) => ({ method: entry.method, path: entry.path })),
  }, null, 2));
});
