import { test, expect, login, appURL } from '../fixtures/security-flow';

test.use({ baseURL: appURL, trace: 'off' });

const EXPECTED_CSP = "base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'";

test('security headers present on live responses while hydration and auth still work', async ({ page, context, request, baseURL }) => {
  const fixtureURL = process.env.FIXTURE_URL;
  if (!fixtureURL || !baseURL) throw new TypeError('Harness URLs required');

  // Live HTTP header assertions against the real Playwright-owned Next server.
  for (const path of ['/', '/proposals', '/feedback', '/api/rights/session', '/api/rights/feedback']) {
    const response = await request.get(`${baseURL}${path}`);
    const headers = response.headers();
    expect(headers['x-frame-options'], path).toBe('DENY');
    expect(headers['x-content-type-options'], path).toBe('nosniff');
    expect(headers['referrer-policy'], path).toBe('strict-origin-when-cross-origin');
    // frame-ancestors 'none' is the enforcement that stops an external iframe
    // from rendering the app; asserted here on every served route.
    expect(headers['content-security-policy'], path).toBe(EXPECTED_CSP);
  }

  // Hydration/auth smoke: no required Next/Supabase resource may be blocked.
  const blocked: string[] = [];
  page.on('console', message => {
    if (message.type() === 'error' && /blocked|content security policy|csp|refused/i.test(message.text())) {
      blocked.push(message.text());
    }
  });
  page.on('pageerror', error => { blocked.push(String(error)); });
  page.on('requestfailed', req => {
    // React strict-mode remounts abort a superseded in-flight fetch; benign.
    if (req.failure()?.errorText === 'net::ERR_ABORTED') return;
    const url = new URL(req.url());
    if (url.origin === baseURL || url.origin === fixtureURL) blocked.push(`requestfailed: ${req.url()}`);
  });

  await login(context, 'student');
  await page.goto('/');
  await expect(page.getByText('Offline fixture announcement', { exact: true })).toBeVisible();

  // Authenticated session still verifies and keeps its no-store cache headers.
  const session = await page.request.get('/api/rights/session');
  expect(session.ok()).toBe(true);
  expect(session.headers()['cache-control']).toContain('no-store');
  expect(blocked).toEqual([]);
});
