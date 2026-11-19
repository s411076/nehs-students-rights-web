import { test, expect, appURL, login, capture } from '../fixtures/security-flow';

test.use({ baseURL: appURL, trace: 'off' });

for (const width of [390, 1440]) {
  for (const colorScheme of ['light', 'dark'] as const) {
    test.describe(`${width}px ${colorScheme}`, () => {
      test.use({ viewport: { width, height: 900 }, colorScheme });
      test('tab return verifies silently and exposes failure and manual retry', async ({ page, context }) => {
        await login(context, 'admin');
        await page.goto('/feedback');
        const submit = page.getByRole('button', { name: '送出建言' });
        const title = page.getByLabel('建言標題');
        await expect(submit).toBeEnabled();
        await title.fill('Retained tab-return draft');
        let releaseFailure = () => {};
        const failure = new Promise<void>(resolve => { releaseFailure = resolve; });
        await page.route('**/api/rights/session', async route => {
          await failure;
          await route.fulfill({ status: 503, json: {} });
        });
        const recheck = page.waitForRequest('**/api/rights/session');
        await page.evaluate(() => { window.dispatchEvent(new Event('visibilitychange')); });
        await recheck;
        await expect(submit).toBeDisabled();
        await expect(page.getByText(/正在重新驗證登入狀態/)).toHaveCount(0);
        await expect(title).toBeEditable();
        await expect(title).toHaveValue('Retained tab-return draft');
        await capture(page, `silent-tab-return-${colorScheme}`);
        releaseFailure();
        await expect(page.getByText(/暫時無法驗證登入狀態。草稿已保留/)).toBeVisible();
        await capture(page, `tab-return-failure-${colorScheme}`);

        await page.unroute('**/api/rights/session');
        let releaseRetry = () => {};
        const retry = new Promise<void>(resolve => { releaseRetry = resolve; });
        await page.route('**/api/rights/session', async route => {
          await retry;
          await route.continue();
        });
        await page.getByRole('button', { name: '重新驗證登入狀態' }).click();
        await expect(page.getByText(/正在重新驗證登入狀態/)).toBeVisible();
        await expect(page.getByRole('button', { name: '驗證中…' })).toBeDisabled();
        await expect(submit).toBeDisabled();
        await capture(page, `tab-return-manual-retry-${colorScheme}`);
        releaseRetry();
        await expect(submit).toBeEnabled();
        await expect(title).toHaveValue('Retained tab-return draft');
        await expect(page.getByText(/正在重新驗證登入狀態|暫時無法驗證登入狀態/)).toHaveCount(0);
      });
    });
  }
}
