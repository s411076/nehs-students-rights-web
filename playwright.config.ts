import { defineConfig } from '@playwright/test';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

if (!process.env.HARNESS_APP_URL || !process.env.FIXTURE_URL) {
  const ports = spawnSync(process.execPath, [resolve('tests/fixtures/ports.mjs')], { encoding: 'utf8' });
  if (ports.status !== 0) throw new TypeError(ports.stderr);
  const [appPort, fixturePort] = ports.stdout.trim().split(',').map(Number);
  process.env.HARNESS_APP_URL = `http://127.0.0.1:${appPort}`;
  process.env.FIXTURE_URL = `http://127.0.0.1:${fixturePort}`;
}
const baseURL = process.env.HARNESS_APP_URL;
const fixtureURL = process.env.FIXTURE_URL;
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
  reporter: [['list'], ['./tests/fixtures/evidence-reporter.ts']],
  timeout: 60_000,
  outputDir: '.omo/evidence/source-security-remediation/task-1/playwright',
  use: { baseURL, trace: 'on', serviceWorkers: 'block' },
  webServer: [
    { command: `node --experimental-strip-types tests/fixtures/run-supabase.mjs`, env: { ...env, FIXTURE_PORT: String(fixturePort) }, url: `${fixtureURL}/__fixture/health`, reuseExistingServer: false },
    { command: `npm run dev -- --hostname 127.0.0.1 --port ${appPort}`, env, url: baseURL, reuseExistingServer: false, timeout: 120_000 },
  ],
});
