import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import HomePage from '../../app/page';
import { AuthProvider } from '../../components/AuthProvider';

const sdk = vi.hoisted(() => {
  const store = {
    fromTables: [] as string[],
    selects: [] as string[],
    tables: {} as Record<string, unknown>,
    callCounts: {} as Record<string, number>,
    pending: {} as Record<string, Array<(value: { data: unknown; error: unknown }) => void>>,
    authUser: null as null | { email: string; user_metadata: Record<string, string> },
    listener: undefined as ((event: string) => void) | undefined,
  };
  function resolveTable(table: string): Promise<{ data: unknown; error: unknown }> {
    store.callCounts[table] = (store.callCounts[table] ?? 0) + 1;
    const raw = store.tables[table];
    const entry: unknown = typeof raw === 'function' ? raw(store.callCounts[table]) : raw;
    if (entry && typeof entry === 'object' && 'deferred' in entry) {
      return new Promise((resolve) => {
        const pending = store.pending[table] ?? [];
        store.pending[table] = pending;
        pending.push(resolve);
      });
    }
    if (entry && typeof entry === 'object' && 'error' in entry) {
      return Promise.resolve({ data: null, error: entry.error });
    }
    return Promise.resolve({ data: entry ?? [], error: null });
  }
  const client = {
    auth: {
      onAuthStateChange: (listener: (event: string) => void) => {
        store.listener = listener;
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      },
      getSession: vi.fn(async () => ({ data: { session: null }, error: null })),
      getUser: vi.fn(async (): Promise<{ data: { user: unknown }; error: unknown }> => ({ data: { user: store.authUser }, error: null })),
      signInWithOAuth: vi.fn(async (): Promise<unknown> => ({ data: {}, error: null })),
    },
    from: (table: string) => {
      store.fromTables.push(table);
      throw new TypeError('Browser database access is forbidden');
    },
  };
  return { store, client, resolveTable };
});
const authState = vi.hoisted(() => ({
  real: false,
  value: {
    status: 'anonymous',
    identity: null,
    user: null,
    isAdmin: false,
    isLoggedIn: false,
    generation: 0,
  } as {
    status: string;
    identity: { id: string; email: string; displayName: string; isAdmin: boolean } | null;
    user: { id: string; email: string; displayName: string; isAdmin: boolean } | null;
    isAdmin: boolean;
    isLoggedIn: boolean;
    generation: number;
  },
}));
const nav = vi.hoisted(() => ({ push: vi.fn() }));

function motionPreference(matches = false) {
  const events = new EventTarget();
  const query = {
    matches,
    media: '(prefers-reduced-motion: reduce)',
    addEventListener: events.addEventListener.bind(events),
    removeEventListener: events.removeEventListener.bind(events),
    dispatchEvent: events.dispatchEvent.bind(events),
  };
  vi.stubGlobal('matchMedia', vi.fn(() => query));
  return query;
}

vi.mock('../../components/AuthProvider', async importOriginal => {
  const actual = await importOriginal<typeof import('../../components/AuthProvider')>();
  return { ...actual, useAuth: () => {
    const useSelectedAuth = authState.real ? actual.useAuth : () => authState.value;
    return useSelectedAuth();
  } };
});
vi.mock('@/lib/supabase', () => ({ createClient: () => sdk.client }));
vi.mock('canvas-confetti', () => ({ default: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: nav.push }) }));

const student = { id: 'stu', email: 'stu@nehs.hc.edu.tw', displayName: '學生', isAdmin: false };
const admin = { id: 'adm', email: 'adm@nehs.hc.edu.tw', displayName: '管理員', isAdmin: true };
function asStudent(generation = 1) {
  authState.value = { status: 'verified', identity: student, user: student, isAdmin: false, isLoggedIn: true, generation };
}
function asAdmin(generation = 1) {
  authState.value = { status: 'verified', identity: admin, user: admin, isAdmin: true, isLoggedIn: true, generation };
}
function asAnonymous(generation = 0) {
  authState.value = { status: 'anonymous', identity: null, user: null, isAdmin: false, isLoggedIn: false, generation };
}

const publicProposal = () => ({
  id: 'p-1', title: '鞦韆整修提案', content: '操場鞦韆需要整修',
   author_name: '王小明', status: '研議中', upvotes_count: 3, reply: '', created_at: '2026-01-01T00:00:00Z', version: 1, viewer_voted: false, legacy_upvotes_count: 3,
});
const pendingProposal = () => ({ ...publicProposal(), id: 'p-2', title: '鞦韆秘密提案', status: '待審核', upvotes_count: 0 });
const rejectedProposal = () => ({ ...publicProposal(), id: 'p-3', title: '鞦韆拆除提案', status: '被退回', upvotes_count: 0 });
const unknownProposal = () => ({ ...publicProposal(), id: 'p-4', title: '鞦韆幽靈提案', status: '已刪除', upvotes_count: 0 });
const namedFeedback = () => ({
  id: 'f-1', title: '午餐建言', content: '午餐份量不足希望改善', category: '環境與設備',
   is_anonymous: false, author_name: '李小華', reply: '', replied_at: null, created_at: '2026-02-01T00:00:00Z', version: 1,
});
const anonFeedback = () => ({
  id: 'f-2', title: '社團經費建言', content: '希望增加社團經費', category: '學聯與活動',
   is_anonymous: true, reply: '', replied_at: null, created_at: '2026-02-02T00:00:00Z', version: 1,
});
const section = () => ({ id: 's-1', title: '開學公告', content: '歡迎回來', created_at: '2026-01-05T00:00:00Z', version: 1 });

const ACTION_STATUS: Record<string, number> = {
  INVALID_PAYLOAD: 400, UNAUTHORIZED: 401, FORBIDDEN: 403, CONFLICT: 409,
  PAYLOAD_TOO_LARGE: 413, UNSUPPORTED_MEDIA: 415, UNAVAILABLE: 503,
};
function stubFetch(handler: (url: string, init: RequestInit | undefined) => Response | Promise<Response>) {
  const fetcher = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const parsed = new URL(url, 'http://localhost');
    const table = parsed.pathname === '/api/rights/proposals' ? 'proposals'
      : parsed.pathname === '/api/rights/home-sections' ? 'home_sections' : null;
    if (table) {
      const result = await sdk.resolveTable(table);
      if (result.error || !Array.isArray(result.data)) return rightsBody({ ok: false, code: 'UNAVAILABLE' });
      const query = (parsed.searchParams.get('query') ?? '').toLowerCase();
      const rows = result.data.filter(row => typeof row === 'object' && row !== null &&
        (table !== 'proposals' || ('status' in row && ['研議中', '通過', '已採納', '不採納'].includes(String(row.status)))) &&
        (!query || ('title' in row && String(row.title).toLowerCase().includes(query)) || ('content' in row && String(row.content).toLowerCase().includes(query))));
      return rightsBody({ ok: true, data: { items: rows, nextCursor: null } });
    }
    const response = await handler(url, init);
    if (parsed.pathname !== '/api/rights/feedback') return response;
    const body = await response.clone().json();
    if (!body.ok || !Array.isArray(body.data)) return response;
    const query = (parsed.searchParams.get('query') ?? '').toLowerCase();
    return rightsBody({ ok: true, data: { items: body.data.filter((row: { title: string; content: string }) =>
      !query || row.title.toLowerCase().includes(query) || row.content.toLowerCase().includes(query)), nextCursor: null } });
  });
  vi.stubGlobal('fetch', fetcher);
  return fetcher;
}
function rightsBody(body: { ok: boolean; code?: string; data?: unknown }) {
  return Response.json(body, { status: body.ok ? 200 : (ACTION_STATUS[body.code ?? ''] ?? 500) });
}

beforeEach(() => {
  motionPreference();
  asAnonymous(0);
  authState.real = false;
  sdk.store.listener = undefined;
  sdk.store.fromTables.length = 0;
  sdk.store.selects.length = 0;
  for (const key of Object.keys(sdk.store.tables)) delete sdk.store.tables[key];
  for (const key of Object.keys(sdk.store.callCounts)) delete sdk.store.callCounts[key];
  for (const key of Object.keys(sdk.store.pending)) delete sdk.store.pending[key];
  sdk.store.authUser = null;
  sdk.client.auth.getSession.mockReset().mockResolvedValue({ data: { session: null }, error: null });
  sdk.client.auth.getUser.mockReset().mockResolvedValue({ data: { user: null }, error: null });
  sdk.client.auth.signInWithOAuth.mockReset().mockResolvedValue({ data: {}, error: null });
  window.history.replaceState(null, '', '/');
  sessionStorage.clear();
  nav.push.mockClear();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

test('excludes pending, rejected and unknown proposals from public search', async () => {
  // Given a mix of public and non-public proposals sharing one keyword
  asStudent();
  sdk.store.tables.proposals = [publicProposal(), pendingProposal(), rejectedProposal(), unknownProposal()];
  sdk.store.tables.home_sections = [];
  stubFetch((url) =>
    url.includes('/api/rights/feedback') ? rightsBody({ ok: true, data: [] }) : rightsBody({ ok: false, code: 'UNAVAILABLE' }),
  );
  // When searching the shared keyword
  render(<HomePage />);
  fireEvent.change(screen.getByPlaceholderText(/輸入關鍵字搜尋/), { target: { value: '鞦韆' } });
  // Then only the public proposal is discoverable
  expect(await screen.findByText('鞦韆整修提案')).toBeInTheDocument();
  expect(screen.queryByText('鞦韆秘密提案')).toBeNull();
  expect(screen.queryByText('鞦韆拆除提案')).toBeNull();
  expect(screen.queryByText('鞦韆幽靈提案')).toBeNull();
});

test('loads public feedback through the feedback API and never exposes the anonymous author sentinel', async () => {
  // Given named and anonymous public feedback behind the API
  asStudent();
  sdk.store.tables.proposals = [];
  sdk.store.tables.home_sections = [];
  const fetcher = stubFetch((url) =>
    url.includes('/api/rights/feedback')
      ? rightsBody({ ok: true, data: [namedFeedback(), anonFeedback()] })
      : rightsBody({ ok: false, code: 'UNAVAILABLE' }),
  );
  // When searching feedback content
  render(<HomePage />);
  fireEvent.change(screen.getByPlaceholderText(/輸入關鍵字搜尋/), { target: { value: '經費' } });
  // Then the API supplies the rows, the table is never read directly, and no sentinel leaks
  expect(await screen.findByText('社團經費建言')).toBeInTheDocument();
  expect(fetcher).toHaveBeenCalledWith(expect.stringContaining('/api/rights/feedback'), expect.anything());
  expect(sdk.store.fromTables).not.toContain('feedback');
  expect(document.body.textContent).not.toContain('匿名學生');
});

test('never queries the admins roster; role comes from the provider', async () => {
  // Given a signed-in session (forcing the legacy roster path on unfixed code)
  asStudent();
  sdk.store.authUser = { email: 'stu@nehs.hc.edu.tw', user_metadata: {} };
  sdk.store.tables.proposals = [];
  sdk.store.tables.home_sections = [];
  stubFetch(() => rightsBody({ ok: true, data: [] }));
  // When the home page loads any list
  render(<HomePage />);
  await screen.findByText('目前沒有首頁公告。');
  // Then no independent admins roster lookup remains
  expect(sdk.store.fromTables).toEqual([]);
});

test('hides announcement creation and deletion from ordinary users', async () => {
  // Given an ordinary signed-in user and one announcement
  asStudent();
  sdk.store.tables.proposals = [];
  sdk.store.tables.home_sections = [section()];
  stubFetch(() => rightsBody({ ok: true, data: [] }));
  // When the page finishes loading
  render(<HomePage />);
  expect(await screen.findByText('開學公告')).toBeInTheDocument();
  // Then no announcement write affordance exists
  expect(screen.queryByText(/新增首頁動態欄位/)).toBeNull();
  expect(screen.queryByRole('button', { name: /發布到首頁/ })).toBeNull();
  expect(screen.queryByRole('button', { name: /刪除/ })).toBeNull();
});

test('publishes an announcement once as admin and refreshes the list after confirmed success', async () => {
  // Given an admin and the allowlisted action endpoint
  asAdmin();
  sdk.store.tables.proposals = [];
  sdk.store.tables.home_sections = [section()];
  const posted: unknown[] = [];
  stubFetch((url, init) => {
    if (url.includes('/api/rights/actions')) {
      posted.push(JSON.parse(init?.body as string));
      return rightsBody({ ok: true, data: { inserted: true, id: 'new-section', version: 1 } });
    }
    return rightsBody({ ok: true, data: [] });
  });
  // When publishing (double click proves the pending guard)
  render(<HomePage />);
  expect(await screen.findByText('開學公告')).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('欄位標題'), { target: { value: '新公告' } });
  fireEvent.change(screen.getByLabelText('欄位內容與公告細節'), { target: { value: '這是新公告內容' } });
  const publish = screen.getByRole('button', { name: /發布到首頁/ });
  fireEvent.click(publish);
  fireEvent.click(publish);
  // Then exactly one exact-envelope request succeeds, inputs clear, and the list refreshes
  await waitFor(() => expect(posted).toHaveLength(1));
  expect(posted[0]).toEqual({
    action: 'createHomeSection',
    payload: { title: '新公告', content: '這是新公告內容' },
  });
  expect(await screen.findByText('首頁欄位發布成功！')).toBeInTheDocument();
  expect((screen.getByPlaceholderText('欄位標題...') as HTMLInputElement).value).toBe('');
  expect(sdk.store.callCounts.home_sections).toBeGreaterThan(1);
});

test('validates announcement title and body before contacting the server', async () => {
  // Given an admin with a blank title
  asAdmin();
  sdk.store.tables.proposals = [];
  sdk.store.tables.home_sections = [];
  const fetcher = stubFetch(() => rightsBody({ ok: true, data: [] }));
  // When submitting without a usable title
  render(<HomePage />);
  await screen.findByRole('button', { name: /發布到首頁/ });
  fireEvent.change(screen.getByPlaceholderText('欄位標題...'), { target: { value: '   ' } });
  fireEvent.change(screen.getByPlaceholderText('欄位內容與公告細節...'), { target: { value: '內容' } });
  fireEvent.click(screen.getByRole('button', { name: /發布到首頁/ }));
  // Then no action request leaves the browser and a validation message appears
  expect(fetcher).not.toHaveBeenCalledWith(expect.stringContaining('/api/rights/actions'), expect.anything());
  expect(await screen.findByText(/有效的標題/)).toBeInTheDocument();
});

test('reports a denied or zero-row announcement delete without success fiction', async () => {
  // Given an admin and a delete that matches zero rows
  asAdmin();
  sdk.store.tables.proposals = [];
  sdk.store.tables.home_sections = [section()];
  window.confirm = vi.fn(() => true);
  stubFetch((url, init) => {
    if (url.includes('/api/rights/actions')) {
      expect(JSON.parse(init?.body as string)).toEqual({
        action: 'deleteHomeSection',
        payload: { id: 's-1', expectedVersion: 1 },
      });
      return rightsBody({ ok: false, code: 'CONFLICT' });
    }
    return rightsBody({ ok: true, data: [] });
  });
  // When confirming deletion
  render(<HomePage />);
  expect(await screen.findByText('開學公告')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /刪除/ }));
  // Then the denial surfaces, nothing claims success, and the row stays
  expect(await screen.findByText(/資料狀態已變更/)).toBeInTheDocument();
  expect(screen.queryByText('已刪除首頁欄位')).toBeNull();
  expect(screen.getByText('開學公告')).toBeInTheDocument();
});

test('shows a retryable error for a failed source without blanking the others', async () => {
  // Given failing proposals alongside healthy announcements and feedback
  asStudent();
  sdk.store.tables.proposals = { error: { message: 'boom' } };
  sdk.store.tables.home_sections = [section()];
  stubFetch((url) =>
    url.includes('/api/rights/feedback')
      ? rightsBody({ ok: true, data: [namedFeedback()] })
      : rightsBody({ ok: false, code: 'UNAVAILABLE' }),
  );
  // When searching while one source fails
  render(<HomePage />);
  expect(await screen.findByText('開學公告')).toBeInTheDocument();
  fireEvent.change(screen.getByPlaceholderText(/輸入關鍵字搜尋/), { target: { value: '午餐' } });
  // Then the failure is an error with retry — not zero-fiction — and feedback still shows
  expect(await screen.findByText(/提案載入失敗/)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /重試提案/ })).toBeInTheDocument();
  expect(screen.queryByText(/找不到符合/)).toBeNull();
  expect(screen.getByText('午餐建言')).toBeInTheDocument();
  // And retrying recovers the failed source
  sdk.store.tables.proposals = [publicProposal()];
  fireEvent.click(screen.getByRole('button', { name: /重試提案/ }));
  fireEvent.change(screen.getByPlaceholderText(/輸入關鍵字搜尋/), { target: { value: '鞦韆' } });
  expect(await screen.findByText('鞦韆整修提案')).toBeInTheDocument();
});

test('ignores stale load completions after the auth generation changes', async () => {
  // Given an admin load that never resolves before logout
  asAdmin(7);
  sdk.store.tables.proposals = [];
  sdk.store.tables.home_sections = { deferred: true };
  stubFetch(() => rightsBody({ ok: true, data: [] }));
  const view = render(<HomePage />);
  // When the generation advances (logout) and a fresh load starts
  asAnonymous(8);
  sdk.store.tables.home_sections = [{ ...section(), id: 's-fresh', title: '最新公告' }];
  view.rerender(<HomePage />);
  expect(await screen.findByText('最新公告')).toBeInTheDocument();
  // And the stale generation-7 response arrives late
  await act(async () => {
    (sdk.store.pending.home_sections ?? []).splice(0).forEach((resolve) => {
      resolve({ data: [{ ...section(), title: '過期公告' }], error: null });
    });
  });
  // Then the stale payload never replaces current data
  expect(screen.queryByText('過期公告')).toBeNull();
  expect(screen.getByText('最新公告')).toBeInTheDocument();
});

test('preserves the public search UI for signed-out visitors', async () => {
  // Given a visitor without a session
  asAnonymous(0);
  sdk.store.tables.proposals = [publicProposal()];
  sdk.store.tables.home_sections = [];
  stubFetch((url) =>
    url.includes('/api/rights/feedback') ? rightsBody({ ok: true, data: [] }) : rightsBody({ ok: false, code: 'UNAVAILABLE' }),
  );
  // When opening the home page
  render(<HomePage />);
  // Then one login entry and the full-site search box remain
  expect(await screen.findAllByRole('button', { name: /登入/ })).toHaveLength(1);
  fireEvent.change(screen.getByPlaceholderText(/輸入關鍵字搜尋/), { target: { value: '鞦韆' } });
  expect(await screen.findByText('鞦韆整修提案')).toBeInTheDocument();
});

test('starts school-hinted Google OAuth from the single login entry', async () => {
  // Given a signed-out visitor on the home page
  stubFetch(() => rightsBody({ ok: true, data: [] }));
  render(<HomePage />);
  // When using the shared school-account login entry
  fireEvent.click(screen.getByRole('button', { name: /以學校帳號登入/ }));
  // Then the same Google provider, current-origin redirect and domain hint are used
  await waitFor(() => expect(sdk.client.auth.signInWithOAuth).toHaveBeenCalledExactlyOnceWith({
    provider: 'google',
    options: { redirectTo: window.location.origin, queryParams: { hd: 'nehs.hc.edu.tw' } },
  }));
});

test('keeps the single login entry locked while OAuth is starting and awaiting navigation', async () => {
  // Given an OAuth start that remains pending until the provider responds
  let finishOAuth: (value: unknown) => void = () => { throw new Error('Missing OAuth start'); };
  sdk.client.auth.signInWithOAuth.mockImplementation(() => new Promise(resolve => { finishOAuth = resolve; }));
  stubFetch(() => rightsBody({ ok: true, data: [] }));
  render(<HomePage />);
  const login = screen.getByRole('button', { name: /以學校帳號登入/ });
  // When a visitor tries to start OAuth twice
  fireEvent.click(login);
  fireEvent.click(login);
  // Then pending feedback replaces the label and prevents a duplicate start
  expect(screen.getByRole('button', { name: /登入中/ })).toBeDisabled();
  expect(sdk.client.auth.signInWithOAuth).toHaveBeenCalledTimes(1);
  await act(async () => { finishOAuth({ data: {}, error: null }); });
  expect(login).toBeDisabled();
});

test('keeps the login button stationary with no motion timers', async () => {
  // Given a signed-out visitor regardless of system motion preference
  motionPreference(false);
  stubFetch(() => rightsBody({ ok: true, data: [] }));
  vi.useFakeTimers();
  await act(async () => { render(<HomePage />); });
  const login = screen.getByRole('button', { name: /以學校帳號登入/ });
  act(() => { vi.advanceTimersByTime(1000); });
  // Then the button never moves and schedules no animation timers
  expect(login.style.transform).toBe('');
  expect(vi.getTimerCount()).toBe(0);
  vi.useRealTimers();
});

test('offers recent searches with a clear control', async () => {
  // Given a cleared local history and a submitted keyword
  window.localStorage.clear();
  stubFetch(() => rightsBody({ ok: true, data: [] }));
  render(<HomePage />);
  const box = screen.getByRole('textbox', { name: /搜尋全站提案與建言/ });
  fireEvent.change(box, { target: { value: '午餐' } });
  const form = box.closest('form');
  expect(form).not.toBeNull();
  fireEvent.submit(form!);
  // When the field is emptied, the recent keyword returns as a shortcut
  fireEvent.change(box, { target: { value: '' } });
  expect(screen.getByRole('button', { name: '午餐' })).toBeInTheDocument();
  // And clearing removes the shortcut without touching the field label
  fireEvent.click(screen.getByRole('button', { name: '清除' }));
  expect(screen.queryByRole('button', { name: '午餐' })).not.toBeInTheDocument();
  expect(screen.getByRole('textbox', { name: /搜尋全站提案與建言/ })).toBeInTheDocument();
  window.localStorage.clear();
});

test('names the public search field and exposes results as focusable item deep-links', async () => {
  // Given public proposals and feedback matching the same keyword
  sdk.store.tables.proposals = [publicProposal()];
  stubFetch(() => rightsBody({ ok: true, data: [{ ...namedFeedback(), title: '鞦韆建言' }] }));
  render(<HomePage />);
  // When searching through the visibly labelled field
  fireEvent.change(screen.getByRole('textbox', { name: /搜尋全站提案與建言/ }), { target: { value: '鞦韆' } });
  // Then native links retain both destinations and accept keyboard focus
  const proposal = await screen.findByRole('link', { name: /鞦韆整修提案/ });
  const feedback = await screen.findByRole('link', { name: /鞦韆建言/ });
  expect(proposal).toHaveAttribute('href', '/proposals#item-p-1');
  expect(feedback).toHaveAttribute('href', '/feedback#item-f-1');
  proposal.focus();
  expect(proposal).toHaveFocus();
  feedback.focus();
  expect(feedback).toHaveFocus();
});

test('retries an unavailable identity service without presenting an anonymous login card', async () => {
  // Given an unavailable identity check and a narrow reload stub
  authState.value.status = 'unavailable';
  const reload = vi.fn();
  const location = { ...window.location, reload };
  vi.stubGlobal('window', new Proxy(window, {
    get: (target, key) => key === 'location' ? location : Reflect.get(target, key, target),
  }));
  stubFetch(() => rightsBody({ ok: true, data: [] }));
  render(<HomePage />);
  expect(screen.getByRole('alert')).toHaveTextContent(/登入服務暫時無法使用/);
  expect(screen.queryByRole('button', { name: /以學校帳號登入/ })).toBeNull();
  // When the visitor retries service verification
  fireEvent.click(screen.getByRole('button', { name: /重試身分驗證/ }));
  // Then a single full reload delegates identity verification to the existing provider
  await waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
});

test('explains an ineligible identity separately from login failure without an OAuth return', async () => {
  // Given a provider-rejected identity with no OAuth result parameters
  authState.value.status = 'ineligible';
  stubFetch(() => rightsBody({ ok: true, data: [] }));
  // When the home page opens
  render(<HomePage />);
  // Then the eligibility reason is visible and a school-account retry remains available
  expect(screen.getByRole('alert')).toHaveTextContent(/登入資格不符/);
  expect(screen.queryByText(/登入失敗/)).toBeNull();
  expect(screen.getAllByRole('button', { name: /以學校帳號登入/ })).toHaveLength(1);
});

test.each([
  { name: 'provider error', search: '?error=access_denied&error_description=denied', user: null, status: 'anonymous', message: /登入失敗/ },
  { name: 'replayed code', search: '?code=replayed', user: null, status: 'anonymous', message: /登入失敗/ },
  { name: 'missing code/session', search: '', user: null, status: 'anonymous', message: /登入失敗/ },
  { name: 'outside identity', search: '?code=outside', user: { email: 'x@example.com', email_confirmed_at: 'now' }, status: 'ineligible', message: /登入資格不符/ },
  { name: 'unconfirmed identity', search: '?code=unconfirmed', user: { email: 'x@nehs.hc.edu.tw', email_confirmed_at: null }, status: 'ineligible', message: /登入資格不符/ },
  { name: 'transport failure', search: '?code=offline', user: null, status: 'unavailable', message: /登入服務暫時無法使用/ },
])('root reports $name after consuming the return and preserves unrelated URL state', async scenario => {
  window.history.replaceState(null, '', `/${scenario.search}${scenario.search ? '&' : '?'}keep=yes#section`);
  sessionStorage.setItem('just_logged_in', 'true');
  authState.value.status = 'loading';
  sdk.client.auth.getUser.mockResolvedValue({ data: { user: scenario.user }, error: null });
  if (scenario.name === 'transport failure') sdk.client.auth.getUser.mockRejectedValue(new TypeError('offline'));
  stubFetch(() => rightsBody({ ok: true, data: [] }));
  const view = render(<HomePage />);
  await waitFor(() => expect(window.location.search).toBe('?keep=yes'));
  authState.value.status = scenario.status;
  authState.value.generation++;
  view.rerender(<HomePage />);
  expect(await screen.findByText(scenario.message)).toBeInTheDocument();
  expect(window.location.hash).toBe('#section');
  expect(sdk.client.auth.getSession).toHaveBeenCalledTimes(1);
  expect(sdk.client.auth.getUser).toHaveBeenCalledTimes(1);
  expect(sessionStorage.getItem('just_logged_in')).toBeNull();
});

test.each(['rejection', 'error result'])('root observes OAuth start %s instead of an unhandled click promise', async scenario => {
  stubFetch(() => rightsBody({ ok: true, data: [] }));
  if (scenario === 'rejection') sdk.client.auth.signInWithOAuth.mockRejectedValue(new TypeError('offline'));
  else sdk.client.auth.signInWithOAuth.mockResolvedValue({ error: new Error('denied') });
  render(<HomePage />);
  fireEvent.click(screen.getByRole('button', { name: /以學校帳號登入/ }));
  expect(await screen.findByText(/登入失敗/)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /以學校帳號登入/ })).toBeEnabled();
  expect(sessionStorage.getItem('just_logged_in')).toBeNull();
});

test('actual provider preserves root OAuth outcome across a generation-keyed remount after URL cleanup', async () => {
  authState.real = true;
  window.history.replaceState(null, '', '/?code=outside&keep=yes#section');
  sdk.client.auth.getUser.mockResolvedValue({ data: { user: { email: 'x@example.com', email_confirmed_at: 'now' } }, error: null });
  let finishVerification: (response: Response) => void = () => { throw new Error('Missing verification'); };
  const pending = new Promise<Response>(resolve => { finishVerification = resolve; });
  const fetcher = stubFetch(url => url.includes('/api/rights/session') ? pending : rightsBody({ ok: true, data: [] }));
  render(<AuthProvider><HomePage /></AuthProvider>);
  await waitFor(() => expect(window.location.search).toBe('?keep=yes'));
  const originalRoot = screen.getByPlaceholderText(/輸入關鍵字搜尋/);
  act(() => { sdk.store.listener?.('SIGNED_IN'); });
  await waitFor(() => expect(fetcher.mock.calls.filter(([url]) => String(url).includes('/api/rights/session'))).toHaveLength(2));
  await act(async () => { finishVerification(Response.json({ error: 'ineligible_identity' }, { status: 403 })); });
  expect(await screen.findByText(/登入資格不符/)).toBeInTheDocument();
  expect(screen.getByPlaceholderText(/輸入關鍵字搜尋/)).not.toBe(originalRoot);
  expect(sdk.client.auth.getSession).toHaveBeenCalledTimes(1);
  expect(sdk.client.auth.getUser).toHaveBeenCalledTimes(1);
  expect(window.location.hash).toBe('#section');
});

test('queries both complete public sources before paging and appends only the requested search continuation', async () => {
  // Given
  asStudent();
  const cursor = { created_at: '2026-01-01T00:00:00.123456Z', id: 'p-1' };
  const fetcher = vi.fn(async (input: string | URL | Request) => {
    const url = new URL(String(input), 'http://localhost');
    if (url.pathname === '/api/rights/home-sections') return rightsBody({ ok: true, data: { items: [], nextCursor: null } });
    const more = url.searchParams.has('cursor');
    const items = url.pathname === '/api/rights/proposals'
      ? [{ ...publicProposal(), id: more ? 'p-next' : 'p-1', title: more ? '鞦韆第二頁' : '鞦韆整修提案' }]
      : [{ ...namedFeedback(), title: '鞦韆建言' }];
    return rightsBody({ ok: true, data: { items, nextCursor: url.pathname === '/api/rights/proposals' && !more ? cursor : null } });
  });
  vi.stubGlobal('fetch', fetcher);
  render(<HomePage />);
  // When
  fireEvent.change(screen.getByLabelText(/搜尋全站提案與建言/), { target: { value: '鞦韆' } });
  fireEvent.click(await screen.findByRole('button', { name: '載入更多提案搜尋結果' }));
  // Then
  expect(await screen.findByText('鞦韆第二頁')).toBeVisible();
  expect(screen.getByText('鞦韆整修提案')).toBeVisible();
  expect(screen.getByText('鞦韆建言')).toBeVisible();
  const reads = fetcher.mock.calls.map(([path]) => new URL(String(path), 'http://localhost'))
    .filter(url => url.pathname !== '/api/rights/home-sections');
  expect(reads).toHaveLength(3);
  expect(reads.every(url => url.searchParams.get('query') === '鞦韆' && url.searchParams.get('limit') === '20')).toBe(true);
  expect(JSON.parse(reads.at(-1)?.searchParams.get('cursor') ?? 'null')).toEqual(cursor);
  expect(screen.getByText(/已載入搜尋結果/)).toHaveTextContent('3 筆');
});

test('loads the next announcement page without dropping already rendered announcements', async () => {
  // Given
  asStudent();
  vi.stubGlobal('fetch', async (input: string | URL | Request) => {
    const more = new URL(String(input), 'http://localhost').searchParams.has('cursor');
    return rightsBody({ ok: true, data: { items: [{ ...section(), id: more ? 's-2' : 's-1', title: more ? '較早公告' : '開學公告' }],
      nextCursor: more ? null : { created_at: '2026-01-05T00:00:00Z', id: 's-1' } } });
  });
  render(<HomePage />);
  // When
  fireEvent.click(await screen.findByRole('button', { name: '載入更多公告' }));
  // Then
  expect(await screen.findByText('較早公告')).toBeVisible();
  expect(screen.getByText('開學公告')).toBeVisible();
  expect(screen.queryByRole('button', { name: '載入更多公告' })).toBeNull();
});
