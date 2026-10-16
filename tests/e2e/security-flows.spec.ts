import { test, expect, appURL, login, forgedCookies, post, state, control, capture } from '../fixtures/security-flow';

test.use({ baseURL: appURL, trace: 'off' });
import { moderation, delayedLogout } from '../fixtures/security-operations';

const privileged = [
  { action: 'saveFeedbackReply', payload: { id: 'feedback-1', reply: 'ATTACK', expectedVersion: 1 } },
  { action: 'deleteFeedback', payload: { id: 'feedback-1', expectedVersion: 1 } },
  { action: 'approveProposal', payload: { id: 'proposal-2', expectedVersion: 1 } },
  { action: 'rejectProposal', payload: { id: 'proposal-2', expectedVersion: 1 } },
  { action: 'deleteProposal', payload: { id: 'proposal-1', expectedVersion: 1 } },
  { action: 'updateProposalControl', payload: { id: 'proposal-1', status: '通過', reply: 'ATTACK', expectedVersion: 1 } },
  { action: 'deleteComment', payload: { id: 'comment-1', proposalId: 'proposal-1', expectedVersion: 1 } },
  { action: 'createHomeSection', payload: { title: 'ATTACK', content: 'ATTACK' } },
  { action: 'deleteHomeSection', payload: { id: 'section-1', expectedVersion: 1 } },
] as const;
const createProposal = { action: 'createProposal', payload: { title: 'Student request', content: 'Student content', category: '其他' } } as const;

test.use({ viewport: { width: 1440, height: 900 } });

for (const viewport of [{ width: 390, height: 844 }, { width: 1440, height: 900 }]) {
  test.describe(`${viewport.width}px`, () => {
    test.use({ viewport });
    test('guest public search excludes private records and anonymous authors', async ({ page, context }) => {
      // Given a guest and a permissive provider containing private sentinel fields.
      // When public HTML/JSON and the actual search UI are loaded.
      for (const path of ['/', '/proposals', '/feedback', '/admin']) {
        const response = await context.request.get(`${appURL}${path}`, { maxRedirects: 0 });
        const text = await response.text();
        expect(text).not.toMatch(/PRIVATE_SENTINEL|ANONYMOUS_AUTHOR_SENTINEL|Fixture 待審核|Fixture 被退回/);
      }
      const feedback = await context.request.get(`${appURL}/api/rights/feedback`);
      expect(feedback.status()).toBe(200);
      expect(await feedback.text()).not.toMatch(/author_name|ANONYMOUS_AUTHOR_SENTINEL|PRIVATE_SENTINEL/);
      await page.goto('/');
      await expect(page.getByText('Offline fixture announcement', { exact: true })).toBeVisible();
      const search = page.getByPlaceholder(/搜尋/);
      await search.fill('Fixture');
      await expect(page.getByText('Fixture 研議中', { exact: true })).toBeVisible();
      // Then neither hidden status nor private field reaches the rendered search.
      await expect(page.locator('body')).not.toContainText('Fixture 待審核');
      await expect(page.locator('body')).not.toContainText('Fixture 被退回');
      await capture(page, `guest-search-${viewport.width}`);
    });
  });
}

test('admin reply save and confirmed clear complete through real routes', async ({ page, context, request }) => {
  // Given SDK-generated chunked admin cookies.
  await login(context, 'admin');
  await page.goto('/admin');
  const editor = page.getByLabel('官方回覆', { exact: true });
  await expect(editor).toBeVisible();
  // When a reply is saved and subsequently cleared through confirmation.
  await editor.fill('Browser official reply');
  await page.getByRole('button', { name: '發布/更新回覆' }).click();
  await expect(page.getByRole('status')).toContainText('成功');
  expect((await state(request)).rows('feedback')[0]?.reply).toBe('Browser official reply');
  await capture(page, 'admin-saved-1440');
  await editor.fill('');
  const confirmation = page.waitForEvent('dialog');
  await page.getByRole('button', { name: '發布/更新回覆' }).click();
  expect((await confirmation).type()).toBe('confirm');
  await expect.poll(async () => (await state(request)).total).toBe(2);
  // Then the provider contains an empty reply, not a silently ignored write.
  expect((await state(request)).rows('feedback')[0]?.reply).toBe('');
  await capture(page, 'admin-cleared-1440');
});
for (const identity of ['guest', 'student', 'outsider', 'unconfirmed'] as const) {
  test(`${identity} cannot read or mutate privileged data`, async ({ page, context, request }) => {
    // Given anonymous, eligible nonadmin, or ineligible verified provider identities.
    if (identity !== 'guest') await login(context, identity);
    // When calling protected HTTP surfaces directly, independent of UI visibility.
    const admin = await context.request.get(`${appURL}/admin`, { maxRedirects: 0 });
    expect(admin.status()).toBe(identity === 'guest' ? 307 : 404);
    expect(await admin.text()).not.toContain('ANONYMOUS_AUTHOR_SENTINEL');
    expect((await state(request)).requests.filter(entry => entry.path.startsWith('/rest/v1/feedback'))).toHaveLength(0);
    expect((await state(request)).requests.filter(entry => entry.path.startsWith('/rest/v1/rpc/rights_list_admin_feedback'))).toHaveLength(0);
    expect((await context.request.get(`${appURL}/api/rights/proposals/pending`)).status()).toBe(identity === 'guest' ? 401 : 403);
    for (const action of privileged) expect((await post(context, action)).status()).toBe(identity === 'guest' ? 401 : 403);
    if (identity !== 'student') expect((await post(context, createProposal)).status()).toBe(identity === 'guest' ? 401 : 403);
    // Then the permissive provider has received zero mutations and UI remains nonprivileged.
    expect((await state(request)).total).toBe(0);
    await page.goto('/proposals');
    await expect(page.getByRole('heading', { name: /熱門學生提案/ })).toBeVisible();
    await expect(page.getByRole('heading', { name: /待審核提案區/ })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /儲存修改/ })).toHaveCount(0);
    if (identity !== 'student') await expect(page.getByRole('button', { name: '送出提案' })).toHaveCount(0);
    await capture(page, `${identity}-proposals`);
  });
}

test('crafted origin, payload, private target and stale auth requests never mutate', async ({ context, request }) => {
  // Given a student whose provider accepts arbitrary authenticated table mutations.
  await login(context, 'student');
  // When crossing request validation, visibility and fresh-auth boundaries.
  for (const origin of [null, 'null', 'https://foreign.example.test']) expect((await post(context, createProposal, origin)).status()).toBe(403);
  expect((await post(context, { ...createProposal, payload: { ...createProposal.payload, author_name: 'FORGED', status: '通過' } })).status()).toBe(400);
  for (const proposalId of ['proposal-2', 'proposal-3', 'missing']) {
    expect((await post(context, { action: 'addComment', payload: { proposalId, content: 'ATTACK', isAnonymous: false } })).status()).toBe(409);
  }
  await control(request, { revoke: 'student' });
  expect((await post(context, createProposal)).status()).toBe(401);
  // Then every rejected request precedes downstream mutation.
  expect((await state(request)).total).toBe(0);
});

test('forged clipboard JWT, localStorage and cookie claims cannot authenticate', async ({ page, context, request }) => {
  // Given attacker-controlled browser storage, cookie and clipboard.
  const jwt = `eyJhbGciOiJub25lIn0.${Buffer.from(JSON.stringify({ sub: 'admin', email: 'admin@nehs.hc.edu.tw', role: 'admin' })).toString('base64url')}.forged`;
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await forgedCookies(context, jwt);
  await page.addInitScript(token => {
    localStorage.setItem('supabase.auth.token', JSON.stringify({ access_token: token, user: { email: 'admin@nehs.hc.edu.tw' } }));
    localStorage.setItem('voted_proposals', '["proposal-1"]');
  }, jwt);
  // When opening protected profile and submitting a crafted mutation.
  await page.goto('/profile');
  await page.evaluate(token => navigator.clipboard.writeText(token), jwt);
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(jwt);
  await expect(page.getByTestId('profile-ownership-unavailable')).toHaveCount(0);
  await expect(page.locator('main')).not.toContainText('admin@nehs.hc.edu.tw');
  expect((await post(context, privileged[0])).status()).toBe(401);
  // Then no token claim becomes trusted identity or ownership query.
  expect((await state(request)).total).toBe(0);
  expect((await state(request)).requests.filter(entry => entry.path.startsWith('/rest/v1/proposals'))).toHaveLength(0);
});

test('student profile makes zero ownership queries and submission authors are server-derived', async ({ page, context, request }) => {
  // Given a provider-verified student.
  await login(context, 'student');
  await page.goto('/profile');
  await expect(page.getByTestId('profile-ownership-unavailable')).toBeVisible();
  expect((await state(request)).requests.filter(entry => entry.path.startsWith('/rest/v1/proposals'))).toHaveLength(0);
  // When creating a proposal, anonymous comment and anonymous feedback in the real UI.
  await page.goto('/proposals');
  await page.getByPlaceholder('例如：關於圖書館開館時間建議...').fill('Browser proposal');
  await page.getByPlaceholder('請詳細說明您的想法或建議...').fill('Browser proposal body');
  await page.getByRole('button', { name: '送出提案' }).click();
  await expect.poll(async () => (await state(request)).total).toBe(1);
  await expect(page.getByRole('button', { name: '送出提案' })).toBeEnabled();
  await page.getByPlaceholder('寫下您的看法與建議...').fill('Browser anonymous comment');
  await page.getByRole('checkbox', { name: /匿名留言/ }).check();
  await page.getByRole('button', { name: '送出留言' }).click();
  await expect.poll(async () => (await state(request)).total).toBe(2);
  await page.goto('/feedback');
  await page.getByLabel('建言標題').fill('Browser feedback');
  await page.getByLabel('寶貴意見內容').fill('Browser feedback body');
  await page.getByRole('checkbox', { name: /匿名發布/ }).check();
  await page.getByRole('button', { name: '送出建言' }).click();
  await expect(page.locator('main').getByRole('status')).toContainText('成功');
  // Then database writes contain only server-authored identity and private pending stays hidden.
  const snapshot = await state(request);
  expect(snapshot.total).toBe(3);
  expect(snapshot.rows('proposals').find(row => row.title === '[環境與設備] Browser proposal')).toMatchObject({ author_name: 'Fixture student', status: '待審核', upvotes_count: 0 });
   expect(snapshot.rows('proposal_comments').find(row => row.content === 'Browser anonymous comment')).toMatchObject({ author_name: 'Fixture student', is_anonymous: true });
  expect(await (await context.request.get(`${appURL}/api/rights/feedback`)).text()).not.toContain('ANONYMOUS_AUTHOR_SENTINEL');
  await capture(page, 'student-feedback');
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
  await capture(page, 'vote-uncertain');
});

test('confirmed vote and cancellation keep zero literal and ignore forged local markers', async ({ page, context, request }) => {
  // Given a verified student with a zero-vote proposal.
   await login(context, 'student');
   await page.addInitScript(() => localStorage.setItem('voted_proposals:student', '["proposal-1"]'));
  await page.goto('/proposals');
  const vote = page.getByRole('button', { name: /👍/ });
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

test('failed provider loads and writes remain explicit with drafts retained', async ({ page, context, request }) => {
  // Given an admin with deterministic upstream read failure.
  await login(context, 'admin');
   await control(request, { path: '/rest/v1/rpc/rights_list_public_feedback', method: 'POST' });
  // When loading public and protected feedback then attempting a failed save.
  expect((await context.request.get(`${appURL}/api/rights/feedback`)).status()).toBe(503);
  await page.goto('/feedback');
  await expect(page.getByText('無法載入建言，請稍後再試。')).toBeVisible();
   await capture(page, 'load-failure');
   await control(request, { path: '/rest/v1/rpc/rights_list_admin_feedback', method: 'POST' });
  await page.goto('/admin');
  await expect(page.locator('main').getByRole('alert')).toBeVisible();
  await control(request, { clear: true });
  await page.goto('/admin');
  await page.getByLabel('官方回覆', { exact: true }).fill('Retain failed reply');
   await control(request, { path: '/rest/v1/rpc/rights_save_feedback_reply', method: 'POST' });
  await page.getByRole('button', { name: '發布/更新回覆' }).click();
  // Then no successful write is claimed and the exact draft remains editable.
  await expect(page.locator('main').getByRole('alert')).toContainText('無法確認');
  await expect(page.getByLabel('官方回覆', { exact: true })).toHaveValue('Retain failed reply');
  expect((await state(request)).total).toBe(0);
  await capture(page, 'write-failure');
});

test('admin moderation and announcements persist while zero-row operations conflict', async ({ page, context, request }) => {
  // Given verified admin; when exercising moderation UI and nonexistent targets; then inspect receipts and provider state.
  await moderation(page, context, request);
});

test('delayed admin response cannot restore privilege after asynchronous logout', async ({ page, context }) => {
  // Given delayed admin data; when logout settles; then old data cannot restore privilege.
  await delayedLogout(page, context);
});

test('logout failure hides privileges immediately and reports an explicit failure', async ({ page, context }) => {
  // Given verified admin and a provider logout failure.
  await login(context, 'admin');
  await page.goto('/');
  await expect(page.getByRole('button', { name: /登出/ })).toBeVisible();
  await page.route('**/auth/v1/logout*', route => route.fulfill({ status: 400, json: { message: 'Injected logout failure' } }));
  const failure = page.waitForResponse(response => response.url().includes('/auth/v1/logout') && response.status() === 400);
  // When the user attempts to logout.
  await page.getByRole('button', { name: /登出/ }).click();
  await failure;
  // Then navigation does not falsely claim success and privileged navbar controls stay hidden.
  await expect(page.getByTestId('operation-status')).toContainText('登出失敗');
  await expect(page.getByRole('button', { name: /登出/ })).toHaveCount(0);
  await expect(page.getByRole('link', { name: /後台管理/ })).toHaveCount(0);
  await capture(page, 'logout-failure');
});
