import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import FeedbackPage from '../../app/feedback/page';
import { useAuth } from '../../components/AuthProvider';

vi.mock('../../components/AuthProvider', () => ({ useAuth: vi.fn() }));
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: () => ({
      select: () => ({
        order: async () => ({ data: [], error: null }),
        eq: async () => ({ data: [], error: null }),
      }),
      insert: async () => ({ error: null }),
      update: () => ({ eq: async () => ({ error: null }) }),
      delete: () => ({ eq: async () => ({ error: null }) }),
    }),
    auth: {
      getSession: async () => ({ data: { session: null } }),
      getUser: async () => ({ data: { user: null } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
    },
  }),
}));
const mockedAuth = vi.mocked(useAuth);

const studentAuth = {
  status: 'verified' as const,
  identity: { id: 'student', email: 'student@nehs.hc.edu.tw', displayName: 'Fixture student', isAdmin: false },
  user: { id: 'student', email: 'student@nehs.hc.edu.tw', displayName: 'Fixture student', isAdmin: false },
  isAdmin: false,
  isLoggedIn: true,
  generation: 1,
};
const adminAuth = {
  status: 'verified' as const,
  identity: { id: 'admin', email: 'admin@nehs.hc.edu.tw', displayName: 'Fixture admin', isAdmin: true },
  user: { id: 'admin', email: 'admin@nehs.hc.edu.tw', displayName: 'Fixture admin', isAdmin: true },
  isAdmin: true,
  isLoggedIn: true,
  generation: 2,
};
const anonymousAuth = {
  status: 'anonymous' as const, identity: null, user: null, isAdmin: false, isLoggedIn: false, generation: 3,
};

const namedRow = {
  id: 'fb-1', title: 'Fixture feedback', content: 'Fixture suggestion', category: '其他',
  is_anonymous: false, author_name: 'Fixture student', reply: '', replied_at: null,
  created_at: '2026-01-01T00:00:00Z',
};
// Anonymous public rows never carry author_name; UI must fall back to 匿名學生.
const anonymousRow = {
  id: 'fb-2', title: 'Hidden name', content: 'Anonymous suggestion', category: '其他',
  is_anonymous: true, reply: '', replied_at: null, created_at: '2026-01-01T00:00:00Z',
};

function feedbackResponse(rows: unknown[]) {
  return Response.json({ ok: true, data: rows });
}
function actionSuccess(data: unknown = { inserted: true }) {
  return Response.json({ ok: true, data });
}
function actionFailure() {
  // Backend messages must never reach the screen.
  return Response.json({ ok: false, code: 'FORBIDDEN', message: 'BACKEND_SENTINEL_MUST_NOT_RENDER' }, { status: 403 });
}

function stubFetch(handler: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  const calls: { url: string; init?: RequestInit }[] = [];
  vi.stubGlobal('fetch', async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    calls.push({ url, init });
    return handler(url, init);
  });
  return calls;
}

function feedbackListFetch(rows: unknown[] = [namedRow, anonymousRow]) {
  return stubFetch(url => {
    if (url.includes('/api/rights/actions')) return actionSuccess();
    if (url.includes('/api/rights/feedback')) return feedbackResponse(rows);
    throw new Error(`Unexpected fetch ${url}`);
  });
}

beforeEach(() => {
  mockedAuth.mockReturnValue(studentAuth);
  localStorage.clear();
  // Lets the legacy direct-SDK page load so failures are behavioral, not import errors.
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://127.0.0.1:1');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'legacy-red-only-key');
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

test('source hygiene: no direct browser writes, admin constants, or storage fallbacks', async () => {
  // Given the rewritten page source
  const path = join(process.cwd(), 'app/feedback/page.tsx');
  const source = await readFile(path, 'utf8');
  // Then all privileged writes go through server actions, never the browser SDK.
  expect(source).not.toMatch(/from\(['"]feedback['"]\)\.(insert|update|delete)/);
  expect(source).not.toMatch(/@supabase\/supabase-js/);
  expect(source).not.toMatch(/ADMIN_EMAILS|nehs\.hc\.edu\.tw/);
  expect(source).not.toMatch(/localStorage|document\.cookie|onAuthStateChange|getSession/);
  expect(source).not.toMatch(/author_name:\s*authorName/);
  // And the page consumes the provider plus the public/actions APIs.
  expect(source).toMatch(/useAuth\(\)/);
  expect(source).toMatch(/\/api\/rights\/feedback|RIGHTS_FEEDBACK_PATH/);
  expect(source).toMatch(/sendRightsAction|createRightsActionFlight/);
});

test('verified student posts named feedback; payload carries boolean flag, author server-derived', async () => {
  // Given
  const calls = feedbackListFetch([namedRow]);
  render(<FeedbackPage />);
  await screen.findByText('Fixture suggestion');
  // When
  fireEvent.change(screen.getByPlaceholderText('請詳細說明您的想法或建議...'), { target: { value: 'Named student body text' } });
  fireEvent.click(screen.getByRole('button', { name: '送出建言' }));
  // Then
  await screen.findByRole('status');
  const posted = calls.filter(call => call.url.includes('/api/rights/actions'));
  expect(posted).toHaveLength(1);
  const body = JSON.parse(String(posted[0]?.init?.body));
  expect(body).toEqual({
    action: 'createFeedback',
    payload: { title: expect.any(String), content: 'Named student body text', category: expect.any(String), isAnonymous: false },
  });
  expect(typeof body.payload.isAnonymous).toBe('boolean');
  expect(body.payload).not.toHaveProperty('author_name');
  expect(calls.some(call => call.url.includes('/rest/'))).toBe(false);
});

test('verified student posts anonymously without leaking author identity', async () => {
  // Given
  const calls = feedbackListFetch([]);
  render(<FeedbackPage />);
  await screen.findByText('目前尚無意見回饋。');
  // When
  fireEvent.change(screen.getByPlaceholderText('請詳細說明您的想法或建議...'), { target: { value: 'Anonymous body text here' } });
  fireEvent.click(screen.getByText(/匿名發布/));
  fireEvent.click(screen.getByRole('button', { name: '送出建言' }));
  // Then
  await screen.findByRole('status');
  const posted = calls.filter(call => call.url.includes('/api/rights/actions'));
  expect(posted).toHaveLength(1);
  const body = JSON.parse(String(posted[0]?.init?.body));
  expect(body.payload.isAnonymous).toBe(true);
  expect(body.payload).not.toHaveProperty('author_name');
});

test('verified admin replies with success', async () => {
  // Given
  mockedAuth.mockReturnValue(adminAuth);
  const replied = { ...namedRow, reply: '', replied_at: null };
  const calls = feedbackListFetch([replied]);
  render(<FeedbackPage />);
  await screen.findByText('Fixture suggestion');
  // When
  fireEvent.change(screen.getByPlaceholderText('請在此輸入官方回應內容...'), { target: { value: 'Official reply text' } });
  fireEvent.click(screen.getByRole('button', { name: /發布官方回覆/ }));
  // Then
  await screen.findByRole('status');
  const posted = calls.filter(call => call.url.includes('/api/rights/actions'));
  expect(posted).toHaveLength(1);
  expect(JSON.parse(String(posted[0]?.init?.body))).toEqual({
    action: 'saveFeedbackReply', payload: { id: 'fb-1', reply: 'Official reply text' },
  });
});

test('verified admin deletes with success after confirmation', async () => {
  // Given
  mockedAuth.mockReturnValue(adminAuth);
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
  const calls = feedbackListFetch([namedRow]);
  render(<FeedbackPage />);
  await screen.findByText('Fixture suggestion');
  // When
  fireEvent.click(screen.getByRole('button', { name: /刪除建言/ }));
  // Then
  await screen.findByRole('status');
  expect(confirm).toHaveBeenCalledTimes(1);
  const posted = calls.filter(call => call.url.includes('/api/rights/actions'));
  expect(posted).toHaveLength(1);
  expect(JSON.parse(String(posted[0]?.init?.body))).toEqual({ action: 'deleteFeedback', payload: { id: 'fb-1' } });
});

test('forged storage grants no admin actions and no posting form', async () => {
  // Given forged browser storage plus a server denial
  mockedAuth.mockReturnValue(anonymousAuth);
  localStorage.setItem('forged-auth', JSON.stringify({ user: adminAuth.identity, access_token: 'forged' }));
  feedbackListFetch([namedRow]);
  // When
  render(<FeedbackPage />);
  await screen.findByText('Fixture suggestion');
  // Then the forged role never surfaces privileged UI.
  expect(screen.queryByText(/學權組管理員/)).toBeNull();
  expect(screen.queryByRole('button', { name: /刪除建言/ })).toBeNull();
  expect(screen.queryByPlaceholderText('請在此輸入官方回應內容...')).toBeNull();
  expect(screen.queryByRole('button', { name: '送出建言' })).toBeNull();
  expect(screen.getByText(/請登入後即可發表建言/)).toBeInTheDocument();
});

test('role loss hides admin actions for a verified non-admin', async () => {
  // Given
  mockedAuth.mockReturnValue(studentAuth);
  feedbackListFetch([namedRow]);
  // When
  render(<FeedbackPage />);
  await screen.findByText('Fixture suggestion');
  // Then
  expect(screen.queryByRole('button', { name: /刪除建言/ })).toBeNull();
  expect(screen.queryByPlaceholderText('請在此輸入官方回應內容...')).toBeNull();
});

test('failed submit shows error without success and retains input text', async () => {
  // Given
  stubFetch(url => {
    if (url.includes('/api/rights/actions')) return actionFailure();
    return feedbackResponse([namedRow]);
  });
  render(<FeedbackPage />);
  await screen.findByText('Fixture suggestion');
  // When
  const box = screen.getByPlaceholderText('請詳細說明您的想法或建議...');
  fireEvent.change(box, { target: { value: 'Kept body text here' } });
  fireEvent.click(screen.getByRole('button', { name: '送出建言' }));
  // Then zero-row failure is never reported as success, text is retained.
  const alert = await screen.findByRole('alert');
  expect(alert).toBeInTheDocument();
  expect(screen.queryByRole('status')).toBeNull();
  expect(box).toHaveValue('Kept body text here');
  expect(document.body.textContent).not.toContain('BACKEND_SENTINEL_MUST_NOT_RENDER');
});

test('anonymous rows never expose the author sentinel and fall back to 匿名學生', async () => {
  // Given a public row without any author_name key
  feedbackListFetch([{ ...anonymousRow, author_name: undefined }]);
  // When
  render(<FeedbackPage />);
  // Then
  const card = (await screen.findByText('Anonymous suggestion')).closest('div');
  expect(card).not.toBeNull();
  expect(within(card as HTMLElement).getByText(/匿名學生/)).toBeInTheDocument();
  expect(document.body.textContent).not.toContain('ANONYMOUS_AUTHOR_SENTINEL');
});

test('loading, error, and empty states stay distinct', async () => {
  // Given a delayed list response
  let resolveList!: (response: Response) => void;
  const gate = new Promise<Response>(done => { resolveList = done; });
  stubFetch(url => {
    if (url.includes('/api/rights/feedback')) return gate;
    return actionSuccess();
  });
  render(<FeedbackPage />);
  // Then loading is its own state before error or empty.
  expect(await screen.findByText(/載入中/)).toBeInTheDocument();
  expect(screen.queryByText('目前尚無意見回饋。')).toBeNull();
  // When the list fails
  resolveList(Response.json({ ok: false, code: 'UNAVAILABLE', message: 'BACKEND_SENTINEL_MUST_NOT_RENDER' }, { status: 503 }));
  // Then error is distinct, offers retry, and leaks no backend message.
  await screen.findByText(/無法載入建言/);
  expect(screen.queryByText('目前尚無意見回饋。')).toBeNull();
  expect(document.body.textContent).not.toContain('BACKEND_SENTINEL_MUST_NOT_RENDER');
  // When retried with zero rows
  vi.stubGlobal('fetch', async (input: string | URL | Request) =>
    String(typeof input === 'string' ? input : (input as Request).url).includes('/api/rights/actions')
      ? actionSuccess() : feedbackResponse([]));
  fireEvent.click(screen.getByRole('button', { name: /重新載入/ }));
  await screen.findByText('目前尚無意見回饋。');
  expect(screen.queryByText(/無法載入建言/)).toBeNull();
});

test('clearing a nonempty reply requires confirmation', async () => {
  // Given
  mockedAuth.mockReturnValue(adminAuth);
  const withReply = { ...namedRow, reply: 'Existing official reply', replied_at: '2026-01-02T00:00:00Z' };
  const calls = feedbackListFetch([withReply]);
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
  render(<FeedbackPage />);
  await screen.findByText('Existing official reply');
  const box = screen.getByPlaceholderText('請在此輸入官方回應內容...');
  // When clearing is cancelled
  fireEvent.change(box, { target: { value: '' } });
  fireEvent.click(screen.getByRole('button', { name: /發布官方回覆/ }));
  // Then confirmation gates the destructive clear and nothing is sent.
  await waitFor(() => expect(confirm).toHaveBeenCalledTimes(1));
  expect(calls.filter(call => call.url.includes('/api/rights/actions'))).toHaveLength(0);
  // When confirmed
  confirm.mockReturnValue(true);
  fireEvent.click(screen.getByRole('button', { name: /發布官方回覆/ }));
  await screen.findByRole('status');
  expect(calls.filter(call => call.url.includes('/api/rights/actions'))).toHaveLength(1);
});

test('invalid input is rejected client-side with text retained and no mutation sent', async () => {
  // Given
  const calls = feedbackListFetch([namedRow]);
  render(<FeedbackPage />);
  await screen.findByText('Fixture suggestion');
  // When submitting an empty body
  const box = screen.getByPlaceholderText('請詳細說明您的想法或建議...');
  fireEvent.change(box, { target: { value: '   ' } });
  fireEvent.click(screen.getByRole('button', { name: '送出建言' }));
  // Then validation rejects before any mutation, keeping the draft.
  await screen.findByRole('alert');
  expect(screen.queryByRole('status')).toBeNull();
  expect(calls.filter(call => call.url.includes('/api/rights/actions'))).toHaveLength(0);
  expect(box).toHaveValue('   ');
});

test('double submit sends a single mutation (single-flight)', async () => {
  // Given a slow action response
  let resolveAction!: (response: Response) => void;
  const gate = new Promise<Response>(done => { resolveAction = done; });
  const calls = stubFetch(url => {
    if (url.includes('/api/rights/actions')) return gate;
    return feedbackResponse([namedRow]);
  });
  render(<FeedbackPage />);
  await screen.findByText('Fixture suggestion');
  fireEvent.change(screen.getByPlaceholderText('請詳細說明您的想法或建議...'), { target: { value: 'Single flight body text' } });
  // When submitted twice while the first flight is pending
  const submit = screen.getByRole('button', { name: '送出建言' });
  fireEvent.click(submit);
  fireEvent.click(submit);
  resolveAction(actionSuccess());
  // Then only one mutation flight ran.
  await screen.findByRole('status');
  await waitFor(() => expect(calls.filter(call => call.url.includes('/api/rights/actions'))).toHaveLength(1));
});
