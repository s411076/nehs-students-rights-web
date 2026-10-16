import { act, fireEvent, render, renderHook, screen, waitFor, within } from '@testing-library/react';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import FeedbackPage from '../../app/feedback/page';
import ProposalsPage from '../../app/proposals/page';
import { useAuth } from '../../components/AuthProvider';
import { parseActionRequest } from '../../lib/rights/validation';
import type { FeedbackPublicDTO } from '../../lib/rights/queries';
import { toFeedbackPublicDTO } from '../../lib/rights/queries';
import { usePublicItemLink } from '../../components/rights/usePublicItemLink';

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
   created_at: '2026-01-01T00:00:00Z', version: 1,
};
// Anonymous public rows never carry author_name; UI must fall back to 匿名學生.
const anonymousRow = {
  id: 'fb-2', title: 'Hidden name', content: 'Anonymous suggestion', category: '其他',
   is_anonymous: true, reply: '', replied_at: null, created_at: '2026-01-01T00:00:00Z', version: 1,
};

function feedbackResponse(rows: unknown[]) {
  return Response.json({ ok: true, data: { items: rows, nextCursor: null } });
}
function actionSuccess(data: unknown = { inserted: true, id: 'new-feedback', version: 1 }) {
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
  return stubFetch((url, init) => {
    if (url.includes('/api/rights/actions')) {
      const parsed = parseActionRequest(JSON.parse(String(init?.body)));
      if (!parsed.ok) throw new TypeError('Invalid test mutation');
      switch (parsed.data.action) {
        case 'saveFeedbackReply': return actionSuccess({ id: parsed.data.payload.id, version: 2 });
        case 'deleteFeedback': return actionSuccess({ id: parsed.data.payload.id, deleted: true });
        case 'createFeedback': return actionSuccess();
        default: throw new TypeError('Unexpected feedback action');
      }
    }
    if (url.includes('/api/rights/feedback')) return feedbackResponse(rows);
    throw new Error(`Unexpected fetch ${url}`);
  });
}

beforeEach(() => {
  mockedAuth.mockReturnValue(studentAuth);
  window.history.replaceState(null, '', '/feedback');
  HTMLElement.prototype.scrollIntoView = vi.fn();
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
  const source = (await Promise.all([path,
    join(process.cwd(), 'app/feedback/FeedbackComposer.tsx'), join(process.cwd(), 'app/feedback/FeedbackCard.tsx'),
    join(process.cwd(), 'components/rights/FeedbackReplyEditor.tsx'), join(process.cwd(), 'components/rights/useRightsMutation.ts'),
  ].map(file => readFile(file, 'utf8')))).join('\n');
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
    action: 'saveFeedbackReply', payload: { id: 'fb-1', reply: 'Official reply text', expectedVersion: 1 },
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
  await waitFor(() => expect(screen.queryByText('Fixture suggestion')).toBeNull());
  expect(confirm).toHaveBeenCalledTimes(1);
  const posted = calls.filter(call => call.url.includes('/api/rights/actions'));
  expect(posted).toHaveLength(1);
  expect(JSON.parse(String(posted[0]?.init?.body))).toEqual({ action: 'deleteFeedback', payload: { id: 'fb-1', expectedVersion: 1 } });
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

test('loads feedback continuations using the exact cursor and keeps prior cards', async () => {
  // Given
  const cursor = { created_at: '2026-01-01T00:00:00.123456Z', id: namedRow.id };
  const calls = stubFetch(url => {
    const next = new URL(url, 'http://localhost').searchParams.has('cursor');
    return Response.json({ ok: true, data: { items: [next ? anonymousRow : namedRow], nextCursor: next ? null : cursor } });
  });
  render(<FeedbackPage />);
  // When
  fireEvent.click(await screen.findByRole('button', { name: '載入更多建言' }));
  // Then
  expect(await screen.findByText('Anonymous suggestion')).toBeVisible();
  expect(screen.getByText('Fixture suggestion')).toBeVisible();
  expect(JSON.parse(new URL(calls.at(-1)?.url ?? '', 'http://localhost').searchParams.get('cursor') ?? 'null')).toEqual(cursor);
});

test('retains a reply draft and its original expectedVersion through conflict and refresh', async () => {
  // Given
  mockedAuth.mockReturnValue(adminAuth);
  let row = namedRow;
  const calls = stubFetch(url => url.includes('/actions')
    ? Response.json({ ok: false, code: 'CONFLICT' }, { status: 409 }) : feedbackResponse([row]));
  render(<FeedbackPage />);
  const input = await screen.findByPlaceholderText('請在此輸入官方回應內容...');
  // When
  fireEvent.change(input, { target: { value: 'Keep my reply draft' } });
  fireEvent.click(screen.getByRole('button', { name: /發布官方回覆/ }));
  await screen.findByRole('alert');
  row = { ...namedRow, version: 2, reply: 'Another moderator reply' };
  fireEvent.click(screen.getByRole('button', { name: '重新載入最新資料' }));
  await screen.findByText('Another moderator reply');
  fireEvent.click(screen.getByRole('button', { name: /發布官方回覆/ }));
  // Then
  await waitFor(() => expect(calls.filter(call => call.url.includes('/actions'))).toHaveLength(2));
  expect(input).toHaveValue('Keep my reply draft');
  expect(calls.filter(call => call.url.includes('/actions')).map(call => JSON.parse(String(call.init?.body)).payload.expectedVersion)).toEqual([1, 1]);
  expect(screen.getByRole('alert')).toHaveTextContent(/草稿已保留.*重新載入/);
});

test('resolves an off-page feedback hash through the visibility-checked item endpoint', async () => {
  // Given
  window.history.replaceState(null, '', '/feedback#item-fb-2');
  const calls = stubFetch(url => url.includes('/api/rights/items') ? Response.json({ ok: true, data: anonymousRow }) : feedbackResponse([namedRow]));
  // When
  render(<FeedbackPage />);
  // Then
  expect(await screen.findByText('Anonymous suggestion')).toBeVisible();
  const request = calls.find(call => call.url.includes('/api/rights/items'));
  expect(new URL(request?.url ?? '', 'http://localhost').searchParams.get('kind')).toBe('feedback');
  expect(new URL(request?.url ?? '', 'http://localhost').searchParams.get('id')).toBe('fb-2');
  expect(HTMLElement.prototype.scrollIntoView).toHaveBeenCalledWith({ block: 'start' });
});

test.each([studentAuth, adminAuth])('keeps public anonymous attribution redacted before deliberate admin reveal (%s)', async auth => {
  // Given
  mockedAuth.mockReturnValue(auth);
  const calls = feedbackListFetch([{ ...anonymousRow, author_name: 'IDENTITY_SENTINEL', user_id: 'PRIVATE_UUID', email: 'private@example.com' }]);
  // When
  render(<FeedbackPage />);
  await screen.findByText('Anonymous suggestion');
  // Then
  expect(document.body.textContent).not.toMatch(/IDENTITY_SENTINEL|PRIVATE_UUID|private@example.com/);
  expect(calls.some(call => call.url.includes('/authors'))).toBe(false);
  if (!auth.isAdmin) expect(screen.queryByRole('button', { name: /查看作者/ })).toBeNull();
});

test('recovers an off-page feedback conflict through targeted reload and explicit draft adoption', async () => {
  // Given an off-page public card and a concurrent moderator edit.
  mockedAuth.mockReturnValue(adminAuth);
  window.history.replaceState(null, '', '/feedback#item-fb-2');
  let remote = { ...anonymousRow, reply: 'Original targeted reply' };
  const calls = stubFetch((url, init) => {
    if (url.includes('/items?')) return Response.json({ ok: true, data: remote });
    if (url.includes('/actions')) {
      const request = parseActionRequest(JSON.parse(String(init?.body)));
      if (!request.ok || request.data.action !== 'saveFeedbackReply') throw new TypeError('Unexpected recovery action');
      const { expectedVersion, reply } = request.data.payload;
      if (expectedVersion !== remote.version) return Response.json({ ok: false, code: 'CONFLICT' }, { status: 409 });
      remote = { ...remote, reply, version: remote.version + 1 };
      return actionSuccess({ id: remote.id, version: remote.version });
    }
    return feedbackResponse([namedRow]);
  });
  render(<FeedbackPage />);
  await screen.findByText('Original targeted reply');
  const card = document.getElementById('item-fb-2');
  if (!card) throw new TypeError('Missing linked feedback');
  const editor = within(card);
  fireEvent.change(editor.getByRole('textbox'), { target: { value: 'Unmerged targeted draft' } });
  remote = { ...remote, reply: 'Latest targeted reply', version: 2 };
  fireEvent.click(editor.getByRole('button', { name: /發布官方回覆/ }));
  await editor.findByRole('alert');
  // When the conflicted off-page card reloads, the target must be read again.
  fireEvent.click(editor.getByRole('button', { name: '重新載入最新資料' }));
  // Then its draft stays on version 1 until the moderator explicitly adopts version 2.
  expect(await editor.findByText('Latest targeted reply')).toBeVisible();
  expect(editor.getByRole('textbox')).toHaveValue('Unmerged targeted draft');
  fireEvent.click(editor.getByRole('button', { name: /發布官方回覆/ }));
  await waitFor(() => expect(editor.getByRole('button', { name: /發布官方回覆/ })).toBeEnabled());
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  fireEvent.click(editor.getByRole('button', { name: '捨棄草稿並使用最新內容' }));
  expect(editor.getByRole('textbox')).toHaveValue('Latest targeted reply');
  fireEvent.change(editor.getByRole('textbox'), { target: { value: 'Merged targeted reply' } });
  fireEvent.click(editor.getByRole('button', { name: /發布官方回覆/ }));
  expect(await editor.findByRole('status')).toHaveTextContent('操作已成功完成。');
  expect(editor.getByRole('textbox')).toHaveValue('Merged targeted reply');
  expect(calls.filter(call => call.url.includes('/actions')).map(call => JSON.parse(String(call.init?.body)).payload.expectedVersion)).toEqual([1, 1, 2]);
  expect(calls.filter(call => call.url.includes('/items?'))).toHaveLength(3);
});

test.each(['deleted', 'forbidden'] as const)('clears a cached public feedback target when reload finds it %s', async outcome => {
  // Given a previously visible linked card, with no private-list fallback.
  mockedAuth.mockReturnValue(adminAuth);
  window.history.replaceState(null, '', '/feedback#item-fb-2');
  let visible = true;
  const calls = stubFetch(url => {
    if (url.includes('/items?')) return visible ? Response.json({ ok: true, data: anonymousRow })
      : outcome === 'deleted' ? Response.json({ ok: true, data: null })
      : Response.json({ ok: false, code: 'FORBIDDEN' }, { status: 403 });
    return feedbackResponse([namedRow]);
  });
  render(<FeedbackPage />);
  await screen.findByText(anonymousRow.content);
  const card = document.getElementById('item-fb-2');
  if (!card) throw new TypeError('Missing linked feedback');
  // When visibility is rechecked.
  visible = false;
  fireEvent.click(within(card).getByRole('button', { name: '重新載入最新資料' }));
  // Then the public cache is gone, and no admin/author read is attempted.
  await waitFor(() => expect(document.getElementById('item-fb-2')).toBeNull());
  expect(await screen.findByRole('alert')).toBeVisible();
  expect(calls.filter(call => call.url.includes('/items?'))).toHaveLength(2);
  expect(calls.some(call => /\/admin\/|\/authors/.test(call.url))).toBe(false);
});

test('rechecks a feedback hash when its list row moves off page without losing the draft or looping', async () => {
  // Given a hash target initially included in the first list page.
  mockedAuth.mockReturnValue(adminAuth);
  window.history.replaceState(null, '', '/feedback#item-fb-1');
  let moved = false;
  const cursor = { created_at: '2026-01-01T00:00:00.123456Z', id: anonymousRow.id };
  const calls = stubFetch(url => {
    const target: FeedbackPublicDTO = moved ? { ...namedRow, reply: 'Moved latest reply', version: 2 } : namedRow;
    if (url.includes('/items?')) return Response.json({ ok: true, data: target });
    return Response.json({ ok: true, data: { items: moved ? [anonymousRow] : [namedRow], nextCursor: moved ? cursor : null } });
  });
  render(<FeedbackPage />);
  const input = await screen.findByRole('textbox', { name: /回覆「Fixture feedback」/ });
  fireEvent.change(input, { target: { value: 'Draft before list movement' } });
  const initialTargetReads = calls.filter(call => call.url.includes('/items?')).length;
  // When a first-page refresh pushes the hash target off page.
  moved = true;
  fireEvent.click(screen.getByRole('button', { name: '重新載入最新資料' }));
  // Then a new public target read restores the card and its original draft.
  expect(await screen.findByText('Moved latest reply')).toBeVisible();
  expect(screen.getByRole('textbox', { name: /回覆「Fixture feedback」/ })).toHaveValue('Draft before list movement');
  expect(screen.getByRole('button', { name: '捨棄草稿並使用最新內容' })).toBeVisible();
  expect(calls.filter(call => call.url.includes('/items?'))).toHaveLength(initialTargetReads + 1);
  expect(calls.filter(call => call.url.includes('/feedback?'))).toHaveLength(2);
});

test('returns an unavailable targeted refresh instead of claiming an unknown read succeeded', async () => {
  // Given a cached public target and an unavailable reload.
  window.history.replaceState(null, '', '/feedback#item-fb-2');
  let unavailable = false;
  stubFetch(() => unavailable ? Response.json({ ok: false, code: 'UNAVAILABLE' }, { status: 503 })
    : Response.json({ ok: true, data: anonymousRow }));
  const view = renderHook(() => usePublicItemLink('feedback', [], toFeedbackPublicDTO));
  await waitFor(() => expect(view.result.current.target?.id).toBe(anonymousRow.id));
  // When an explicit refresh cannot confirm current visibility or content.
  unavailable = true;
  await act(async () => {
    // Then the failure is returned to the caller and the cached card is cleared.
    expect(await view.result.current.refresh()).toMatchObject({ ok: false, code: 'UNAVAILABLE' });
  });
  expect(view.result.current.target).toBeNull();
  expect(view.result.current.message).not.toBe('');
});

test.each(['identity', 'generation', 'hash', 'request'] as const)('discards targeted refresh completions after the %s changes', async change => {
  // Given a targeted reload that outlives its request/auth/hash scope.
  mockedAuth.mockReturnValue(adminAuth);
  window.history.replaceState(null, '', '/feedback#item-fb-2');
  let finish: (response: Response) => void = () => { throw new TypeError('Missing delayed target'); };
  let reads = 0;
  stubFetch(url => {
    reads++;
    if (reads === 2) return new Promise<Response>(resolve => { finish = resolve; });
    const id = new URL(url, 'http://localhost').searchParams.get('id');
    if (!id) throw new TypeError('Missing public target ID');
    return Response.json({ ok: true, data: { ...anonymousRow, id, content: reads === 1 ? 'Initial public target' : 'Fresh public target' } });
  });
  const view = renderHook(() => usePublicItemLink('feedback', [], toFeedbackPublicDTO));
  await waitFor(() => expect(view.result.current.target?.content).toBe('Initial public target'));
  const pending = view.result.current.refresh();
  // When a newer scope or request completes first.
  switch (change) {
    case 'identity': {
      const identity = { ...adminAuth.identity, id: 'other-admin' };
      mockedAuth.mockReturnValue({ ...adminAuth, identity, user: identity });
      view.rerender();
      break;
    }
    case 'generation': mockedAuth.mockReturnValue({ ...adminAuth, generation: 3 }); view.rerender(); break;
    case 'hash': act(() => {
      window.history.replaceState(null, '', '/feedback#item-fb-3');
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    }); break;
    case 'request': await act(async () => { await view.result.current.refresh(); }); break;
    default: throw new TypeError(`Unexpected scope change: ${change satisfies never}`);
  }
  await waitFor(() => expect(view.result.current.target?.content).toBe('Fresh public target'));
  await act(async () => {
    finish(Response.json({ ok: true, data: { ...anonymousRow, content: 'Stale public target' } }));
    // Then even a successful old response is unavailable to its stale caller.
    expect(await pending).toMatchObject({ ok: false, code: 'UNAVAILABLE' });
  });
  expect(view.result.current.target?.content).toBe('Fresh public target');
});

test.each(['feedback', 'proposal'] as const)('recovers the %s draft and original base through in-page retry after a failed target refresh', async kind => {
  // Given an off-page public draft and a later transient read failure.
  mockedAuth.mockReturnValue(adminAuth);
  const target = kind === 'feedback' ? { ...anonymousRow, reply: 'Original public reply' } : {
    id: 'retry-proposal', title: 'Retry proposal', content: 'Public proposal body', author_name: 'Student',
    status: '研議中', reply: 'Original public reply', version: 1, upvotes_count: 0,
    viewer_voted: false, legacy_upvotes_count: 0, created_at: '2026-01-01T00:00:00Z',
  };
  const path = kind === 'feedback' ? '/feedback' : '/proposals';
  window.history.replaceState(null, '', `${path}#item-${target.id}`);
  let unavailable = false;
  let retrying = false;
  let finishRetry: (response: Response) => void = () => { throw new TypeError('Missing pending public retry'); };
  const calls = stubFetch(url => {
    const pathname = new URL(url, 'http://localhost').pathname;
    if (pathname === '/api/rights/items') {
      if (unavailable) return Response.json({ ok: false, code: 'UNAVAILABLE' }, { status: 503 });
      if (retrying) return new Promise<Response>(resolve => { finishRetry = resolve; });
      return Response.json({ ok: true, data: target });
    }
    if (pathname === '/api/rights/actions') return Response.json({ ok: false, code: 'CONFLICT' }, { status: 409 });
    if (pathname === '/api/rights/feedback') return feedbackResponse([namedRow]);
    if (pathname === '/api/rights/proposals/pending') return feedbackResponse([
      { ...target, title: 'Private pending alternative', content: 'Private pending body', status: '待審核' },
    ]);
    if (pathname === '/api/rights/proposals' || pathname.endsWith('/comments')) return feedbackResponse([]);
    throw new TypeError(`Unexpected recovery request: ${url}`);
  });
  render(kind === 'feedback' ? <FeedbackPage /> : <ProposalsPage />);
  const card = (await screen.findByText(target.title)).closest('[id^="item-"]');
  if (!(card instanceof HTMLElement)) throw new TypeError('Missing initial public card');
  fireEvent.change(within(card).getByRole('textbox', { name: /回覆/ }), { target: { value: 'Draft retained through retry' } });
  unavailable = true;
  fireEvent.click(within(card).getByRole('button', { name: '重新載入最新資料' }));
  await waitFor(() => expect(card).not.toBeInTheDocument());
  expect(await screen.findByRole('alert')).toHaveTextContent('無法載入連結項目');
  expect(screen.queryByText(target.title)).toBeNull();
  const retry = screen.getByRole('button', { name: '重新載入連結項目' });
  // When the public read is retried in-page, the card stays cleared while it is pending.
  unavailable = false; retrying = true;
  fireEvent.click(retry);
  expect(screen.queryByText(target.title)).toBeNull();
  expect(screen.getByRole('alert')).toHaveTextContent('無法載入連結項目');
  await act(async () => { finishRetry(Response.json({ ok: true, data: { ...target, reply: 'Latest public reply', version: 2 } })); });
  // Then the successful public read remounts the same draft without rebasing version 1.
  const restored = (await screen.findByText(target.title)).closest('[id^="item-"]');
  if (!(restored instanceof HTMLElement)) throw new TypeError('Missing restored public card');
  const editor = within(restored);
  expect(editor.getByRole('textbox', { name: /回覆/ })).toHaveValue('Draft retained through retry');
  expect(editor.getByText('Latest public reply')).toBeVisible();
  expect(editor.getByRole('button', { name: '捨棄草稿並使用最新內容' })).toBeVisible();
  expect(screen.queryByRole('button', { name: '重新載入連結項目' })).toBeNull();
  fireEvent.click(editor.getByRole('button', { name: /發布官方回覆|儲存修改/ }));
  await editor.findByRole('alert');
  const posted = calls.find(call => call.url.includes('/actions'));
  expect(parseActionRequest(JSON.parse(String(posted?.init?.body)))).toMatchObject({ ok: true, data: {
    action: kind === 'feedback' ? 'saveFeedbackReply' : 'updateProposalControl',
    payload: { id: target.id, reply: 'Draft retained through retry', expectedVersion: 1 },
  } });
  expect(calls.filter(call => call.url.includes('/items?'))).toHaveLength(3);
  expect(calls.filter(call => call.url.includes('/proposals/pending?'))).toHaveLength(kind === 'proposal' ? 1 : 0);
  expect(calls.some(call => /\/admin\/|\/authors/.test(call.url))).toBe(false);
  expect(window.location.hash).toBe(`#item-${target.id}`);
});

test.each(['feedback', 'proposal'] as const)('omits the %s linked-item retry when the hash target is invalid', async kind => {
  // Given an invalid fragment and healthy public lists.
  window.history.replaceState(null, '', `/${kind === 'feedback' ? 'feedback' : 'proposals'}#item-`);
  const calls = stubFetch(() => feedbackResponse([]));
  // When the public page validates its hash.
  render(kind === 'feedback' ? <FeedbackPage /> : <ProposalsPage />);
  // Then it explains the invalid link without an unusable retry or a targeted read.
  expect(await screen.findByRole('alert')).toHaveTextContent('連結格式不正確。');
  expect(screen.queryByRole('button', { name: '重新載入連結項目' })).toBeNull();
  expect(calls.some(call => call.url.includes('/items?'))).toBe(false);
});
