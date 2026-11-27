import { defineConfig } from '@playwright/test';
import { resolve } from 'node:path';

const baseURL = 'http://localhost:4173';
const fixtureURL = 'http://127.0.0.1:4174';
process.env.FIXTURE_URL = fixtureURL;
const appPort = new URL(baseURL).port;
const fixturePort = new URL(fixtureURL).port;
const env = {
  NEXT_PUBLIC_SUPABASE_URL: fixtureURL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'sb_publishable_offline_fixture_only',
  SUPABASE_URL: fixtureURL,
  SUPABASE_ANON_KEY: 'sb_publishable_offline_fixture_only',
  NEXT_TELEMETRY_DISABLED: '1',
  NODE_OPTIONS: `--import=${resolve('tests/fixtures/offline-network.mjs')}`,
  NEXT_FONT_GOOGLE_MOCKED_RESPONSES: resolve('tests/fixtures/google-fonts.cjs'),
};

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'list',
  timeout: 60_000,
  use: { baseURL, trace: 'retain-on-failure', serviceWorkers: 'block' },
  webServer: [
    { command: `node --experimental-strip-types tests/fixtures/run-supabase.mjs`, env: { ...env, FIXTURE_PORT: String(fixturePort) }, url: `${fixtureURL}/__fixture/health`, reuseExistingServer: false },
    { command: `npm run dev -- --hostname 127.0.0.1 --port ${appPort}`, env, url: baseURL, reuseExistingServer: false, timeout: 120_000 },
  ],
});
