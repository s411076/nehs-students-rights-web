// @vitest-environment node
import { expect, test } from 'vitest';
import nextConfig from '../../next.config';

// Baseline browser defense-in-depth only — this is NOT a strict XSS policy.
// There is intentionally no default-src/script-src, no nonce architecture,
// and no HSTS, so Next.js inline scripts/styles and the Supabase browser SDK
// keep working without per-request nonce plumbing. `frame-ancestors 'none'`
// is what stops an external iframe from rendering the app; script execution
// itself is NOT locked down by this CSP.

const EXPECTED_CSP = "base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'";

test('next config serves the exact baseline security headers on all routes', async () => {
  expect(typeof nextConfig.headers).toBe('function');
  const routes = await nextConfig.headers!();
  const allRoutes = routes.find(route => route.source === '/:path*');
  expect(allRoutes).toBeDefined();
  const headers = Object.fromEntries(
    allRoutes!.headers.map(({ key, value }) => [key.toLowerCase(), value]),
  );
  // Missing-header negative assertions: each must fail if its header is removed.
  expect(headers['x-frame-options']).toBe('DENY');
  expect(headers['x-content-type-options']).toBe('nosniff');
  expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
  expect(headers['content-security-policy']).toBe(EXPECTED_CSP);
});

test('baseline stays compatible: no HSTS, nonce, or script lockdown', async () => {
  const routes = await nextConfig.headers!();
  const allRoutes = routes.find(route => route.source === '/:path*');
  const headers = Object.fromEntries(
    allRoutes!.headers.map(({ key, value }) => [key.toLowerCase(), value]),
  );
  expect(headers['strict-transport-security']).toBeUndefined();
  expect(headers['content-security-policy']).not.toMatch(/default-src|script-src|nonce/i);
});
