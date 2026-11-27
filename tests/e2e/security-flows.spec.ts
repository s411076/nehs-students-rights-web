import { test, expect, login, state, control } from '../fixtures/security-flow';

test('unavailable feedback totals do not display a zero badge', async ({ page, request }) => {
  await control(request, { method: 'POST', path: '/rest/v1/rpc/rights_queue_page' });
  await page.goto('/feedback');
  await expect(page.getByText('無法載入建言，請稍後再試。')).toBeVisible();
  await expect(page.getByRole('tab', { name: /^全部/ })).toHaveText('全部—總筆數無法取得');
});

test('verified profile shows the ownership limitation without fetching proposals', async ({ page, context, request }) => {
  await login(context, 'student');
  await page.goto('/profile');
  await expect(page.getByTestId('profile-ownership-unavailable')).toBeVisible();
  const reads = (await state(request)).requests.filter(entry => entry.path.startsWith('/rest/v1/'));
  expect(Array.from(new Set(reads.map(entry => entry.path)))).toEqual(['/rest/v1/rpc/rights_is_admin']);
});

test('admin reply save and confirmed clear complete through real routes', async ({ page, context, request }) => {
  // Given SDK-generated chunked admin cookies.
  await login(context, 'admin');
  await page.goto('/feedback');
  const editor = page.getByRole('textbox', { name: '回覆「Fixture feedback」', exact: true });
  await expect(editor).toBeVisible();
  await expect(page.getByRole('tab', { name: /^待回覆/ })).toHaveAttribute('aria-selected', 'true');
  // When a reply is saved and subsequently cleared through confirmation.
  await editor.fill('Browser official reply');
  await page.getByRole('button', { name: '發布官方回覆' }).press('Enter');
  const result = page.getByRole('status', { name: '清單操作結果' });
  await expect(result).toContainText(/Fixture feedback.*成功/);
  await expect(result).toBeFocused();
  await expect(page.getByRole('tab', { name: /^待回覆/ })).toHaveAttribute('aria-selected', 'true');
  await expect(editor).toHaveCount(0);
  await expect(page.getByText('目前沒有待回覆建言', { exact: true })).toBeVisible();
  expect((await state(request)).rows('feedback')[0]?.reply).toBe('Browser official reply');
  await expect(page.getByRole('tab', { name: /^待回覆/ })).toHaveText('待回覆0');
  await expect(page.getByRole('tab', { name: /^已回覆/ })).toHaveText('已回覆1');

  await page.getByRole('tab', { name: /^已回覆/ }).click();
  await expect(editor).toHaveValue('Browser official reply');

  await editor.fill('');
  const confirmation = page.waitForEvent('dialog');
  await page.getByRole('button', { name: '發布官方回覆' }).click();
  expect((await confirmation).type()).toBe('confirm');
  await expect.poll(async () => (await state(request)).total).toBe(2);
  // Then the provider contains an empty reply, not a silently ignored write.
  expect((await state(request)).rows('feedback')[0]?.reply).toBe('');
  await expect(page.getByText('尚無官方回覆', { exact: true })).toBeVisible();
  await page.getByRole('tab', { name: /^待回覆/ }).click();
  await expect(editor).toHaveValue('');
});

test('vote commit then disconnect shows uncertainty and never retries the POST', async ({ page, context, request }) => {
  // Given a verified student and a real public proposal with zero votes.
  await login(context, 'student');
  await page.goto('/proposals');
  const vote = page.getByRole('button', { name: /覆議\/聯署|已聯署/ });
  await expect(vote.locator('span')).toHaveText('0');
  let posts = 0;
  // When the real backend commits but its response is lost.
  await page.route('**/api/rights/actions', async route => {
    posts++;
    const response = await route.fetch({ maxRetries: 0 });
    expect(response.status()).toBe(200);
    await route.abort('connectionreset');
  });
  await vote.evaluate(button => {
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  // Then one mutation committed and bounded recovery restores authoritative server vote state.
  await expect(page.locator('main').getByRole('alert')).toContainText('無法確認是否已儲存');
  await expect(vote).toBeEnabled();
  await expect(vote.locator('span')).toHaveText('1');
  await expect(vote).toContainText('已聯署');
  expect(posts).toBe(1);
  expect((await state(request)).total).toBe(1);
  expect(await page.evaluate(() => localStorage.getItem('voted_proposals:student'))).toBeNull();
});

test('confirmed vote and cancellation keep zero literal and ignore forged local markers', async ({ page, context, request }) => {
  // Given a verified student with a zero-vote proposal.
  await login(context, 'student');
  await page.addInitScript(() => localStorage.setItem('voted_proposals:student', '["10000000-0000-4000-8000-000000000001"]'));
  await page.goto('/proposals');
  const vote = page.getByRole('button', { name: /覆議\/聯署|已聯署/ });
  await expect(vote.locator('span')).toHaveText('0');
  // When rapidly voting then cancelling after the confirmed receipt.
  await vote.evaluate(button => {
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  await expect(vote).toContainText('已聯署');
  expect((await state(request)).total).toBe(1);
  await page.reload();
  await expect(vote).toContainText('已聯署');
  await vote.click();
  // Then the receipt restores zero independently of the forged browser marker.
  await expect(vote.locator('span')).toHaveText('0');
  await expect(vote).toBeEnabled();
  expect((await state(request)).total).toBe(2);
  await page.reload();
  await expect(vote).toContainText('覆議/聯署');
  await expect(vote.locator('span')).toHaveText('0');
});

test('student resends a pending proposal after its receipt is lost', async ({ page, context, request }) => {
  await login(context, 'student');
  await page.goto('/proposals');
  await page.getByLabel('提案標題').fill('Lost receipt');
  await page.getByLabel('寶貴意見內容').fill('Only one pending proposal');
  await page.route('**/api/rights/actions', async route => {
    expect((await route.fetch()).ok()).toBe(true);
    await route.abort('failed');
  }, { times: 1 });
  const send = page.getByRole('button', { name: '送出提案' });
  await send.click();
  await expect(page.locator('main').getByRole('alert')).toContainText('可以再次送出未修改的草稿，不會重複新增');

  await send.click();
  await expect(page.getByLabel('提案標題')).toHaveValue('');
  const snapshot = await state(request);
  expect(snapshot.rows('proposals').filter(row => row.content === 'Only one pending proposal')).toHaveLength(1);
  expect(snapshot.requests.filter(entry => entry.path.endsWith('/rights_create_proposal'))).toHaveLength(2);
});
