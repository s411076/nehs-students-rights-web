import { test, expect } from '@playwright/test';

test('stored search history hydrates without losing text typed before JavaScript loads', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message.split('\n')[0]));

  await page.goto('/');
  const search = page.getByRole('textbox', { name: '搜尋全站提案與建言' });
  await search.fill('午餐');
  await expect(page.getByText('找不到符合「午餐」的提案或建言。')).toBeVisible();
  await search.press('Enter');
  await search.clear();
  const recent = page.getByRole('button', { name: '午餐', exact: true });
  await expect(recent).toBeVisible();
  await page.reload();
  await expect(recent).toBeVisible();

  const releaseScripts = Promise.withResolvers<void>();
  await page.route('**/_next/static/**/*.js', async route => {
    await releaseScripts.promise;
    await route.continue();
  });
  try {
    await page.reload({ waitUntil: 'commit' });
    await expect(recent).toHaveCount(0);
    await search.pressSequentially('體育');
    await expect(search).toHaveValue('體育');
  } finally {
    releaseScripts.resolve();
  }

  await page.waitForLoadState('load');
  await expect(search).toHaveValue('體育');
  await expect(search).toBeFocused();
  await expect(page.getByText('找不到符合「體育」的提案或建言。')).toBeVisible();
  await search.press('Enter');
  await search.clear();
  await expect(page.getByRole('button', { name: '體育', exact: true })).toBeVisible();
  await expect(recent).toBeVisible();
  expect(errors).toEqual([]);
});
