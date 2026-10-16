import type { APIRequestContext, BrowserContext, Page } from '@playwright/test';
import { expect, appURL, login, post, state, capture } from './security-flow';

export async function moderation(page: Page, context: BrowserContext, request: APIRequestContext) {
  await login(context, 'admin');
  await page.goto('/proposals');
  await expect(page.getByText('Fixture 待審核', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: /核可發布/ }).click();
  await expect(page.getByRole('button', { name: /核可發布/ })).toHaveCount(0);
  expect((await state(request)).rows('proposals').find(row => row.id === 'proposal-2')?.status).toBe('研議中');
  const card = page.locator('[id^="item-"]').filter({ has: page.getByRole('heading', { name: 'Fixture 研議中', exact: true }) });
  await card.getByLabel('提案狀態：Fixture 研議中', { exact: true }).selectOption('通過');
  await card.getByLabel('官方回覆：Fixture 研議中', { exact: true }).fill('Moderation reply');
  await card.getByRole('button', { name: /儲存修改/ }).click();
  await expect(card.getByText('Moderation reply', { exact: true })).toBeVisible();
  await card.getByRole('button', { name: '刪除留言：Fixture comment', exact: true }).click();
  await expect(card.getByText('Fixture comment', { exact: true })).toHaveCount(0);
  await capture(page, 'admin-moderation');
  await card.getByRole('button', { name: /刪除/, exact: false }).click();
  await expect(page.getByRole('heading', { name: 'Fixture 研議中', exact: true })).toHaveCount(0);
  await page.goto('/');
  await page.getByPlaceholder('欄位標題...').fill('Browser announcement');
  await page.getByPlaceholder('欄位內容與公告細節...').fill('Browser announcement body');
  await page.getByRole('button', { name: '發布到首頁' }).click();
  await expect(page.getByText('Browser announcement', { exact: true })).toBeVisible();
  await capture(page, 'admin-announcement');
  const announcement = page.locator('div').filter({ has: page.getByText('Browser announcement', { exact: true }) })
    .filter({ has: page.getByRole('button', { name: /刪除/ }) }).last();
  await announcement.getByRole('button', { name: /刪除/ }).click();
  await expect(page.getByText('Browser announcement', { exact: true })).toHaveCount(0);
  expect((await state(request)).total).toBe(6);
  expect((await post(context, { action: 'createProposal', payload: { title: 'Reject in browser', content: 'Moderation test', category: '其他' } })).status()).toBe(200);
  await page.goto('/proposals');
  await expect(page.getByRole('button', { name: /退回提案/ })).toBeVisible();
  await page.getByRole('button', { name: /退回提案/ }).click();
  await expect(page.getByRole('button', { name: /退回提案/ })).toHaveCount(0);
  expect((await state(request)).rows('proposals').find(row => row.title === '[其他] Reject in browser')?.status).toBe('被退回');
  await page.goto('/admin');
  await page.getByRole('button', { name: '刪除建言', exact: true }).click();
  await expect(page.getByText('目前沒有收到建言。', { exact: true })).toBeVisible();
  expect((await state(request)).total).toBe(9);
  for (const action of [
    { action: 'rejectProposal', payload: { id: 'missing', expectedVersion: 1 } },
    { action: 'deleteFeedback', payload: { id: 'missing', expectedVersion: 1 } },
    { action: 'saveFeedbackReply', payload: { id: 'missing', reply: 'missing', expectedVersion: 1 } },
  ]) {
    const response = await post(context, action);
    expect(response.status()).toBe(409);
    expect(await response.text()).toContain('CONFLICT');
  }
}

export async function delayedLogout(page: Page, context: BrowserContext) {
  await login(context, 'admin');
  let releasePending: (() => void) | undefined;
  let seenPending: (() => void) | undefined;
  const pendingSeen = new Promise<void>(resolve => { seenPending = resolve; });
  const pendingGate = new Promise<void>(resolve => { releasePending = resolve; });
  await page.route('**/api/rights/proposals/pending*', async route => {
    const response = await route.fetch();
    seenPending?.();
    await pendingGate;
    await route.fulfill({ response });
  });
  let releaseLogout: (() => void) | undefined;
  const logoutGate = new Promise<void>(resolve => { releaseLogout = resolve; });
  await page.route('**/auth/v1/logout*', async route => {
    await logoutGate;
    await route.fulfill({ status: 200, json: {} });
  });
  await page.goto('/proposals');
  await pendingSeen;
  const logout = page.getByRole('button', { name: /登出/ });
  await expect(logout).toBeVisible();
  await logout.click();
  await expect(page.getByTestId('operation-status')).toContainText('登出中');
  await expect(logout).toHaveCount(0);
  await expect(page.getByRole('link', { name: /後台管理/ })).toHaveCount(0);
  releaseLogout?.();
  await page.waitForURL(`${appURL}/`);
  releasePending?.();
  await expect(page.getByRole('heading', { name: /待審核提案區/ })).toHaveCount(0);
  expect((await context.request.get(`${appURL}/api/rights/session`)).status()).toBe(401);
  await capture(page, 'logout-delayed-admin');
}
