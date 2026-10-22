import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import ProposalsPage from '../../app/proposals/page';
import type { AuthContextValue } from '../../components/AuthProvider';
import { pendingQueuePage, proposalQueuePage, queuePage } from '../fixtures/queue-pages';

const state = vi.hoisted(() => {
  const anonymous = (): AuthContextValue => ({ status: 'anonymous', identity: null, user: null, generation: 0, isLoggedIn: false, isAdmin: false });
  return { auth: anonymous(),
    reads: vi.fn(), publicRead: vi.fn(), commentRead: vi.fn(), itemRead: vi.fn(), requests: vi.fn(), select: vi.fn(), filter: vi.fn(), update: vi.fn(),
   publicRows: [{ id: 'p1', title: 'Public proposal', content: 'Body', author_name: 'Student', status: '處理中', upvotes_count: 0, reply: 'Official reply', created_at: '2026-10-14', version: 1, viewer_voted: false, legacy_upvotes_count: 0 }],
   comments: [{ id: 'c1', proposal_id: 'p1', content: 'Existing comment', author_name: '匿名學生', created_at: '2026-10-14', version: 1 }],
  };
});
function verified(isAdmin = false) {
  const identity = { id: 'student', email: 'student@nehs.hc.edu.tw', displayName: 'Student', isAdmin };
  state.auth = { status: 'verified', identity, user: identity, generation: state.auth.generation + 1, isLoggedIn: true, isAdmin };
}
vi.mock('../../components/AuthProvider', () => ({ useAuth: () => state.auth }));
function client() {
  return {
    auth: { getSession: async () => ({ data: { session: null } }), getUser: async () => ({ data: { user: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) },
    from(table: string) {
      const query = {
        select: (columns: string) => { state.select(table, columns); return query; },
        update: (...args: unknown[]) => { state.update(table, ...args); return query; },
        in: (column: string, values: string[]) => { state.filter(table, column, values); return query; },
        neq: () => query, eq: () => query,
         order: async () => table === 'proposals' ? state.publicRead() : { data: state.comments, error: null },
      };
      return query;
    },
  };
}
vi.mock('@supabase/supabase-js', () => ({ createClient: () => client() }));
vi.mock('../../lib/supabase', () => ({ createClient: () => client() }));
vi.mock('../../lib/rights/client', () => ({
  readRights: async (path: string, parse: (value: unknown) => unknown) => {
    try {
      let data: unknown;
      const url = new URL(path, 'http://localhost');
      if (url.pathname === '/api/rights/queue' && url.searchParams.get('kind') === 'pending') {
        const result = await state.reads(path, parse);
        if (!result.ok) return result;
        data = Array.isArray(result.data) ? pendingQueuePage(result.data, path) : result.data;
      } else if (path.includes('/comments')) {
        data = await state.commentRead(path);
      } else if (path.startsWith('/api/rights/items')) {
        data = await state.itemRead(path);
      } else {
        const result = await state.publicRead(path);
        if (result.error) return { ok: false, code: 'UNAVAILABLE' };
        data = Array.isArray(result.data) ? proposalQueuePage(result.data, path) : result.data;
      }
      const parsed = parse(data);
      return parsed === null ? { ok: false, code: 'UNAVAILABLE' } : { ok: true, data: parsed };
    } catch (error) {
      if (!(error instanceof Error)) throw error;
      return { ok: false, code: 'UNAVAILABLE' };
    }
  },
  sendRightsAction: (...args: unknown[]) => state.requests(...args),
  createRightsActionFlight: () => state.requests,
}));
beforeEach(() => {
   window.history.replaceState(null, '', '/proposals');
   HTMLElement.prototype.scrollIntoView = vi.fn();
   state.auth = { status: 'anonymous', identity: null, user: null, generation: 0, isLoggedIn: false, isAdmin: false };
   state.publicRead.mockReset().mockImplementation(async () => ({ data: state.publicRows, error: null }));
   state.commentRead.mockReset().mockImplementation(async () => ({ items: state.comments, nextCursor: null }));
   state.itemRead.mockReset().mockResolvedValue(null);
  state.reads.mockReset().mockResolvedValue({ ok: true, data: [{ ...state.publicRows[0], id: 'pending', title: 'Private pending', status: '待審核' }] });
  state.requests.mockReset().mockResolvedValue({ ok: true, data: {}, refresh: 'updated' });
  state.select.mockClear(); state.filter.mockClear(); state.update.mockClear();
  vi.spyOn(window, 'alert').mockImplementation(() => {});
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});
afterEach(() => { localStorage.clear(); document.cookie = 'auth-token=; Max-Age=0'; vi.restoreAllMocks(); });

test.each(['storage', 'jwt', 'cookie'])('withholds admin controls for forged %s identity', async kind => {
  // Given: the trusted provider says anonymous, regardless of browser claims.
  const jwt = `eyJhbGciOiJub25lIn0.${btoa(JSON.stringify({ email: 's411076@nehs.hc.edu.tw' }))}.fake`;
  if (kind === 'storage') localStorage.setItem('forged-auth', JSON.stringify({ user: { email: 's411076@nehs.hc.edu.tw' } }));
  if (kind === 'jwt') localStorage.setItem('forged-token', jwt);
  if (kind === 'cookie') document.cookie = `auth-token=${jwt}`;
  // When
  render(<ProposalsPage />);
  await screen.findAllByText('Public proposal');
  await act(async () => {});
  // Then
  expect(screen.queryByText(/待審核提案區/)).toBeNull();
  expect(screen.queryByText(/管理員控制台/)).toBeNull();
  expect(screen.queryByPlaceholderText('例如：關於圖書館開館時間建議...')).toBeNull();
  expect(state.reads).not.toHaveBeenCalled();
});

test('creates a student proposal using only raw input, leaving identity/status/count to the server', async () => {
  // Given
  verified(); render(<ProposalsPage />);
  // When
  fireEvent.change(screen.getByPlaceholderText('例如：關於圖書館開館時間建議...'), { target: { value: '  Draft  ' } });
  fireEvent.change(screen.getByPlaceholderText('請詳細說明您的想法或建議...'), { target: { value: '  New body  ' } });
  fireEvent.click(screen.getByRole('button', { name: '送出提案' }));
  // Then
  await waitFor(() => expect(state.requests).toHaveBeenCalledWith({ action: 'createProposal', payload: { title: 'Draft', content: 'New body', category: '環境與設備' } }, expect.any(Function)));
  await waitFor(() => expect(screen.getByPlaceholderText('例如：關於圖書館開館時間建議...')).toHaveValue(''));
  expect(state.reads).not.toHaveBeenCalled();
});

test('keeps a submitted draft until the action promise confirms receipt', async () => {
  // Given
  verified();
  let confirmReceipt: (result: unknown) => void = () => { throw new Error('Missing receipt'); };
  state.requests.mockReturnValueOnce(new Promise(resolve => { confirmReceipt = resolve; }));
  render(<ProposalsPage />);
  const title = screen.getByPlaceholderText('例如：關於圖書館開館時間建議...');
  fireEvent.change(title, { target: { value: 'Await receipt' } });
  fireEvent.change(screen.getByPlaceholderText('請詳細說明您的想法或建議...'), { target: { value: 'Body' } });
  // When
  fireEvent.click(screen.getByRole('button', { name: '送出提案' }));
  // Then
  expect(state.requests).toHaveBeenCalledTimes(1);
  expect(title).toHaveValue('Await receipt');
  expect(window.alert).not.toHaveBeenCalled();
  await act(async () => { confirmReceipt({ ok: true, data: {}, refresh: 'updated' }); });
  expect(title).toHaveValue('');
  expect(window.alert).toHaveBeenCalledTimes(1);
});

test.each([true, false])('preserves the anonymous comment option (%s) through the action helper', async anonymous => {
  // Given
  verified(); render(<ProposalsPage />);
  const input = await screen.findByPlaceholderText('寫下您的看法與建議...');
  await screen.findByText('Existing comment');
  // When
  fireEvent.change(input, { target: { value: '  Comment draft  ' } });
  if (anonymous) fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.click(screen.getByRole('button', { name: '送出留言' }));
  // Then
  await waitFor(() => expect(state.requests).toHaveBeenCalledWith({ action: 'addComment', payload: { proposalId: 'p1', content: 'Comment draft', isAnonymous: anonymous } }, expect.any(Function)));
  await waitFor(() => expect(input).toHaveValue(''));
});

test.each(['FORBIDDEN', 'OUTCOME_UNKNOWN'])('preserves proposal draft and shows an explicit %s failure', async code => {
  // Given
  verified(); state.requests.mockResolvedValue({ ok: false, code, message: 'Explicit failure' });
  render(<ProposalsPage />);
  const input = screen.getByPlaceholderText('例如：關於圖書館開館時間建議...');
  fireEvent.change(input, { target: { value: 'Keep draft' } });
  fireEvent.change(screen.getByPlaceholderText('請詳細說明您的想法或建議...'), { target: { value: 'Keep body' } });
  // When
  fireEvent.click(screen.getByRole('button', { name: '送出提案' }));
  // Then
  expect(await screen.findByRole('alert')).toHaveTextContent('Explicit failure');
  expect(input).toHaveValue('Keep draft');
});

test('validates overlong comments with the shared validator before any mutation', async () => {
  // Given
  verified(); render(<ProposalsPage />);
  const input = await screen.findByPlaceholderText('寫下您的看法與建議...');
  fireEvent.change(input, { target: { value: '😀'.repeat(1001) } });
  // When
  fireEvent.click(screen.getByRole('button', { name: '送出留言' }));
  // Then
  expect(await screen.findByRole('alert')).toBeVisible();
  expect(state.requests).not.toHaveBeenCalled();
  expect(input).toHaveValue('😀'.repeat(1001));
});

test.each([
   ['approveProposal', '核准上架', { id: 'pending', expectedVersion: 1 }],
   ['rejectProposal', '退回提案', { id: 'pending', expectedVersion: 1 }],
   ['updateProposalControl', '儲存修改', { id: 'p1', status: '處理中', reply: 'Official reply', expectedVersion: 1 }],
   ['deleteProposal', '刪除', { id: 'p1', expectedVersion: 1 }],
   ['deleteComment', /刪除留言/, { id: 'c1', proposalId: 'p1', expectedVersion: 1 }],
] as const)('routes admin %s through the allowlisted helper', async (action, button, payload) => {
  // Given
  verified(true); render(<ProposalsPage />);
  await screen.findByText('Existing comment'); await screen.findByText('Private pending');
  // When
  fireEvent.click(screen.getByRole('button', { name: button }));
  // Then
   await waitFor(() => expect(state.requests).toHaveBeenCalledWith({ action, payload }, action === 'deleteProposal' ? undefined : expect.any(Function)));
});

test.each([true, false])('requires confirmation before clearing an existing official reply (%s)', async confirmed => {
  // Given
  verified(true); vi.mocked(window.confirm).mockReturnValue(confirmed);
  render(<ProposalsPage />);
  fireEvent.change(await screen.findByPlaceholderText('輸入官方回覆內容...'), { target: { value: '  ' } });
  // When
  fireEvent.click(screen.getByRole('button', { name: '儲存修改' }));
  // Then
  expect(window.confirm).toHaveBeenCalled();
   if (confirmed) await waitFor(() => expect(state.requests).toHaveBeenCalledWith({ action: 'updateProposalControl', payload: { id: 'p1', status: '處理中', reply: '', expectedVersion: 1 } }, expect.any(Function)));
  else expect(state.requests).not.toHaveBeenCalled();
});

test('reports deleteComment rejection without removing the displayed comment', async () => {
  // Given
  verified(true); state.requests.mockResolvedValue({ ok: false, code: 'FORBIDDEN', message: 'Comment deletion denied' });
  render(<ProposalsPage />); await screen.findByText('Existing comment');
  // When
  fireEvent.click(screen.getByRole('button', { name: /刪除留言/ }));
  // Then
  expect(await screen.findByRole('alert')).toHaveTextContent('Comment deletion denied');
  expect(screen.getByText('Existing comment')).toBeVisible();
});

test('discards a delayed pending response after logout, including when admin is subsequently restored', async () => {
  // Given
  let resolve: (value: unknown) => void = () => { throw new Error('Not initialized'); };
  state.reads.mockReturnValueOnce(new Promise(done => { resolve = done; }));
  verified(true); const view = render(<ProposalsPage />);
  await waitFor(() => expect(state.reads).toHaveBeenCalledTimes(1));
  // When
  state.auth = { status: 'anonymous', identity: null, user: null, generation: 2, isLoggedIn: false, isAdmin: false };
  view.rerender(<ProposalsPage />);
  await act(async () => resolve({ ok: true, data: [{ ...state.publicRows[0], id: 'stale', title: 'Stale private', status: '待審核' }] }));
  verified(true); view.rerender(<ProposalsPage />);
  // Then
  await screen.findByText('Private pending');
  expect(screen.queryByText('Stale private')).toBeNull();
});

test('excludes private states and uses only per-proposal public comment endpoints', async () => {
  // Given
  const publicRow = state.publicRows[0];
   state.publicRows.push(...['待審核', '被退回'].map(status => ({ ...state.publicRows[0], id: status, title: status + ' hidden', status })));
  // When
  render(<ProposalsPage />);
  // Then
  try {
    await screen.findByText('Existing comment');
    expect(screen.queryByText(/hidden/)).toBeNull();
     expect(state.select).not.toHaveBeenCalled();
     expect(state.filter).not.toHaveBeenCalled();
      expect(state.publicRead).toHaveBeenCalledWith(expect.stringContaining('/api/rights/queue?kind=proposal&filter=all&limit=20'));
  } finally { if (publicRow) state.publicRows.splice(0, state.publicRows.length, publicRow); }
});

test('sends desired vote state without browser-authored totals or database writes', async () => {
  // Given
   state.requests.mockResolvedValueOnce({ ok: true, data: { id: 'p1', voted: true, upvotes_count: 1 }, refresh: 'updated' });
  verified(); render(<ProposalsPage />);
  await screen.findByText('Public proposal');
  // When
  fireEvent.click(screen.getByRole('button', { name: /覆議\/聯署/ }));
  // Then
   await waitFor(() => expect(state.requests).toHaveBeenCalledExactlyOnceWith({ action: 'setVote', payload: { proposalId: 'p1', voted: true } }, undefined));
  expect(state.update).not.toHaveBeenCalled();
});

test.each(['malformed', 'rejected', 'provider-error', 'null'])('reports a %s public read without an empty list or unhandled rejection', async kind => {
  // Given
  if (kind === 'rejected') state.publicRead.mockRejectedValue(new TypeError('Read rejected'));
  else state.publicRead.mockResolvedValue({ data: kind === 'null' ? null : { malformed: true }, error: kind === 'provider-error' ? { message: 'Denied' } : null });
  const unhandled = vi.fn();
  process.on('unhandledRejection', unhandled);
  try {
    // When
    render(<ProposalsPage />);
    // Then
    expect(await screen.findByRole('alert')).toHaveTextContent('提案清單更新失敗');
    await new Promise<void>(resolve => setImmediate(resolve));
    expect(unhandled).not.toHaveBeenCalled();
    expect(screen.queryByText('目前尚無公開提案。')).toBeNull();
    expect(screen.getByRole('button', { name: '重試公開提案' })).toBeVisible();
  } finally { process.off('unhandledRejection', unhandled); }
});

test('shows independent loading states before either list read settles', () => {
  // Given
  verified(true);
  state.publicRead.mockReturnValue(new Promise(() => {}));
  state.reads.mockReturnValue(new Promise(() => {}));
  // When
  render(<ProposalsPage />);
  // Then
  expect(screen.getByText('公開提案載入中…')).toBeVisible();
  expect(screen.getByText('待審核提案載入中…')).toBeVisible();
  expect(screen.queryByText(/目前尚無/)).toBeNull();
});

test.each(['FORBIDDEN', 'UNAVAILABLE'])('keeps healthy public proposals visible when pending read is %s', async code => {
  // Given
  verified(true); state.reads.mockResolvedValue({ ok: false, code, message: 'Pending denied' });
  // When
  render(<ProposalsPage />);
  // Then
  expect(await screen.findByRole('alert')).toHaveTextContent('待審核提案清單更新失敗');
  expect(await screen.findByText('Public proposal')).toBeVisible();
  expect(screen.queryByText('目前尚無等待審核的提案。')).toBeNull();
  expect(screen.getByRole('button', { name: '重試待審核提案' })).toBeVisible();
});

test('shows empty lists only after successful zero-row reads', async () => {
  // Given
  verified(true); state.publicRead.mockResolvedValue({ data: [], error: null });
  state.reads.mockResolvedValue({ ok: true, data: [] });
  // When
  render(<ProposalsPage />);
  // Then
  expect(await screen.findByText('目前尚無公開提案。')).toBeVisible();
  expect(await screen.findByText('目前尚無等待審核的提案。')).toBeVisible();
  expect(screen.queryByRole('alert')).toBeNull();
});

test('recovers a failed public list through its retry without rereading pending proposals', async () => {
  // Given
  verified(true); state.publicRead.mockResolvedValueOnce({ data: [], error: { message: 'Failed' } });
  render(<ProposalsPage />);
  const retry = await screen.findByRole('button', { name: '重試公開提案' });
  // When
  fireEvent.click(retry);
  // Then
  expect(await screen.findByText('Public proposal')).toBeVisible();
  expect(screen.queryByRole('alert')).toBeNull();
  expect(state.reads).toHaveBeenCalledTimes(1);
});

test('confirms receipt and review without promising profile review-status after creation', async () => {
  // Given
  verified(); render(<ProposalsPage />);
  fireEvent.change(screen.getByPlaceholderText('例如：關於圖書館開館時間建議...'), { target: { value: 'New proposal' } });
  fireEvent.change(screen.getByPlaceholderText('請詳細說明您的想法或建議...'), { target: { value: 'New body' } });
  // When
  fireEvent.click(screen.getByRole('button', { name: '送出提案' }));
  // Then
  await waitFor(() => expect(window.alert).toHaveBeenCalledWith(expect.stringMatching(/已收到.*審核/)));
  expect(window.alert).not.toHaveBeenCalledWith(expect.stringMatching(/個人資料|查看審核狀態/));
});

test('retries a rejected pending read independently of the healthy public list', async () => {
  // Given
  verified(true); state.reads.mockRejectedValueOnce(new TypeError('Pending read rejected'));
  render(<ProposalsPage />);
  const retry = await screen.findByRole('button', { name: '重試待審核提案' });
  await screen.findByText('Public proposal');
  // When
  fireEvent.click(retry);
  // Then
  expect(await screen.findByText('Private pending')).toBeVisible();
  expect(screen.queryByRole('alert')).toBeNull();
  expect(state.publicRead).toHaveBeenCalledTimes(1);
});

test('discards a rejected public read from a previous auth generation', async () => {
  // Given
  let rejectRead: (reason: Error) => void = () => { throw new Error('Not initialized'); };
  state.publicRead.mockReturnValueOnce(new Promise((_resolve, reject) => { rejectRead = reject; }));
  const view = render(<ProposalsPage />);
  // When
  verified(); view.rerender(<ProposalsPage />);
  await screen.findByText('Public proposal');
  await act(async () => rejectRead(new TypeError('Stale failure')));
  // Then
  expect(screen.queryByRole('alert')).toBeNull();
  expect(screen.getByText('Public proposal')).toBeVisible();
});

test('owns a rejected mutation event without clearing the draft or claiming receipt', async () => {
  // Given
  verified(); state.requests.mockRejectedValueOnce(new TypeError('Action rejected'));
  render(<ProposalsPage />);
  const title = screen.getByPlaceholderText('例如：關於圖書館開館時間建議...');
  fireEvent.change(title, { target: { value: 'Keep draft' } });
  fireEvent.change(screen.getByPlaceholderText('請詳細說明您的想法或建議...'), { target: { value: 'Keep body' } });
  // When
  fireEvent.click(screen.getByRole('button', { name: '送出提案' }));
  // Then
  expect(await screen.findByRole('alert')).toHaveTextContent('無法確認是否已儲存');
  expect(title).toHaveValue('Keep draft');
  expect(window.alert).not.toHaveBeenCalled();
});

test('returns typed UNAVAILABLE to refresh callers when the public parser throws', async () => {
  // Given
  verified();
  state.requests.mockImplementationOnce(async (_request: unknown, refresh: () => Promise<unknown>) => {
    expect(await refresh()).toMatchObject({ ok: false, code: 'UNAVAILABLE' });
    return { ok: true, data: {}, refresh: 'failed', message: '已儲存，但清單更新失敗' };
  });
  render(<ProposalsPage />); await screen.findByText('Public proposal');
  state.publicRead.mockResolvedValueOnce({ data: { malformed: true }, error: null });
  fireEvent.change(screen.getByPlaceholderText('例如：關於圖書館開館時間建議...'), { target: { value: 'New proposal' } });
  fireEvent.change(screen.getByPlaceholderText('請詳細說明您的想法或建議...'), { target: { value: 'New body' } });
  // When
  fireEvent.click(screen.getByRole('button', { name: '送出提案' }));
  // Then
  await waitFor(() => expect(window.alert).toHaveBeenCalled());
  expect(screen.getByRole('button', { name: '重試公開提案' })).toBeVisible();
  expect(screen.queryByText('目前尚無公開提案。')).toBeNull();
});

test('pages public and pending proposals independently while keeping previously loaded cards', async () => {
  // Given
  verified(true);
  const cursor = { created_at: '2026-10-14T00:00:00.123456Z', id: 'p1' };
  state.publicRead.mockImplementation(async (path: string) => ({ data: queuePage(path.includes('cursor=')
    ? [{ ...state.publicRows[0], id: 'p2', title: 'Older public' }] : state.publicRows, {
      total: 2, counts: { all: 2, processing: 2, closed: 0 }, nextCursor: path.includes('cursor=') ? null : cursor,
    }), error: null }));
  state.reads.mockImplementation(async (path: string) => ({ ok: true, data: queuePage([{ ...state.publicRows[0],
     id: path.includes('cursor=') ? 'pending-2' : 'pending', title: path.includes('cursor=') ? 'Older pending' : 'Private pending', status: '待審核' }],
    { total: 2, counts: { pending: 2 }, nextCursor: path.includes('cursor=') ? null : cursor }) }));
  render(<ProposalsPage />);
  // When
  fireEvent.click(await screen.findByRole('button', { name: '載入更多公開提案' }));
  fireEvent.click(await screen.findByRole('button', { name: '載入更多待審核提案' }));
  // Then
  expect(await screen.findByText('Older public')).toBeVisible();
  expect(await screen.findByText('Older pending')).toBeVisible();
  expect(screen.getByText('Public proposal')).toBeVisible();
  expect(screen.getByText('Private pending')).toBeVisible();
  expect(JSON.parse(new URL(state.publicRead.mock.calls.at(-1)?.[0], 'http://localhost').searchParams.get('cursor') ?? 'null')).toEqual(cursor);
});

test('continues comments per proposal without a cross-proposal cap', async () => {
  // Given
  state.publicRead.mockResolvedValue({ data: [...state.publicRows, { ...state.publicRows[0], id: 'p2', title: 'Second proposal' }], error: null });
  state.commentRead.mockImplementation(async (path: string) => {
    const url = new URL(path, 'http://localhost');
    const proposalId = url.pathname.includes('/p2/') ? 'p2' : 'p1';
    const more = url.searchParams.has('cursor');
    return { items: [{ ...state.comments[0], id: `${proposalId}-${more}`, proposal_id: proposalId, content: `${proposalId} comment ${more ? 'next' : 'first'}` }],
      nextCursor: more ? null : { created_at: '2026-10-14T00:00:00.123456Z', id: `${proposalId}-first` } };
  });
  render(<ProposalsPage />);
  await screen.findByText('p2 comment first');
  // When
  fireEvent.click(await screen.findByRole('button', { name: '載入更多留言：Public proposal' }));
  // Then
  expect(await screen.findByText('p1 comment next')).toBeVisible();
  expect(screen.getByText('p1 comment first')).toBeVisible();
  expect(screen.getByText('p2 comment first')).toBeVisible();
  expect(state.commentRead.mock.calls.filter(([path]) => String(path).includes('/p2/'))).toHaveLength(1);
});

test('retains control draft baseVersion when newer proposal content is reloaded', async () => {
  // Given
  verified(true);
  state.requests.mockResolvedValue({ ok: false, code: 'CONFLICT', message: 'Conflict' });
  render(<ProposalsPage />);
  const input = await screen.findByPlaceholderText('輸入官方回覆內容...');
  // When
  fireEvent.change(input, { target: { value: 'My unreconciled reply' } });
  fireEvent.click(screen.getByRole('button', { name: '儲存修改' }));
  await screen.findByRole('alert');
  state.publicRead.mockResolvedValue({ data: [{ ...state.publicRows[0], version: 2, reply: 'New server reply' }], error: null });
  fireEvent.click(screen.getByRole('button', { name: '重新載入最新資料' }));
  await screen.findByText('New server reply');
  fireEvent.click(screen.getByRole('button', { name: '儲存修改' }));
  // Then
  await waitFor(() => expect(state.requests).toHaveBeenCalledTimes(2));
  expect(input).toHaveValue('My unreconciled reply');
  expect(state.requests.mock.calls.map(([request]) => request.payload.expectedVersion)).toEqual([1, 1]);
  expect(screen.getByRole('alert')).toHaveTextContent(/草稿已保留.*重新載入/);
});

test('fails closed on an unknown public status instead of querying its comments', async () => {
  // Given
  state.publicRead.mockResolvedValue({ data: queuePage([{ ...state.publicRows[0], status: 'unknown', title: 'Hidden unknown' }],
    { total: 1, counts: { all: 1, processing: 1, closed: 0 } }), error: null });
  // When
  render(<ProposalsPage />);
  // Then
  expect(await screen.findByRole('alert')).toHaveTextContent('提案清單更新失敗');
  expect(screen.queryByText('Hidden unknown')).toBeNull();
  expect(state.commentRead).not.toHaveBeenCalled();
});

test.each([true, false])('fetches off-page proposal hashes only through public visibility (visible=%s)', async visible => {
  // Given
  window.history.replaceState(null, '', '/proposals#item-off-page');
  state.itemRead.mockResolvedValue({ ...state.publicRows[0], id: 'off-page', title: 'Targeted proposal', status: visible ? '處理中' : '待審核' });
  // When
  render(<ProposalsPage />);
  // Then
  await waitFor(() => expect(state.itemRead).toHaveBeenCalledOnce());
  if (visible) expect(await screen.findByText('Targeted proposal')).toBeVisible();
  else { await screen.findByRole('alert'); expect(screen.queryByText('Targeted proposal')).toBeNull(); }
  expect(state.reads).not.toHaveBeenCalled();
});

test('retains proposal control and anonymous comment drafts when a newer insert moves the twentieth row off page', async () => {
  // Given a full page with dirty control fields and a separate anonymous comment.
  verified(true);
  const target = state.publicRows[0];
  if (!target) throw new TypeError('Missing proposal fixture');
  const first = Array.from({ length: 19 }, (_, index) => ({ ...target, id: `first-${index}`, title: `First ${index}` }));
  let moved = false;
  const cursor = { created_at: '2026-10-14T00:00:00.123456Z', id: 'first-18' };
  state.publicRead.mockImplementation(async (path: string) => ({ data: queuePage(path.includes('cursor=')
    ? [{ ...target, version: 2, status: '處理中', reply: 'New server control' }]
    : moved ? [{ ...target, id: 'new', title: 'New inserted proposal' }, ...first] : [...first, target],
    { total: moved ? 21 : 20, counts: { all: moved ? 21 : 20, processing: moved ? 21 : 20, closed: 0 },
      nextCursor: moved && !path.includes('cursor=') ? cursor : null }), error: null }));
  state.commentRead.mockResolvedValue({ items: [], nextCursor: null });
  state.requests.mockResolvedValue({ ok: false, code: 'CONFLICT', message: 'Conflict' });
  render(<ProposalsPage />);
  await screen.findByText(target.title);
  const card = document.getElementById(`item-${target.id}`);
  if (!card) throw new TypeError('Missing twentieth proposal');
  const editor = within(card);
  fireEvent.change(editor.getByRole('textbox', { name: /官方回覆/ }), { target: { value: 'Unsaved proposal reply' } });
  fireEvent.change(editor.getByRole('combobox'), { target: { value: '已結案' } });
  fireEvent.change(editor.getByRole('textbox', { name: /新增留言/ }), { target: { value: 'Unsaved anonymous comment' } });
  fireEvent.click(editor.getByRole('checkbox'));
  // When a refresh unmounts the row, followed by its continuation remount.
  moved = true;
  fireEvent.click(editor.getByRole('button', { name: '重新載入最新資料' }));
  await screen.findByText('New inserted proposal');
  expect(document.getElementById(`item-${target.id}`)).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: '載入更多公開提案' }));
  await screen.findByText(target.title);
  const restored = document.getElementById(`item-${target.id}`);
  if (!restored) throw new TypeError('Missing restored proposal');
  const drafts = within(restored);
  // Then all row-owned input is retained, with no silent version rebase.
  expect(drafts.getByRole('textbox', { name: /官方回覆/ })).toHaveValue('Unsaved proposal reply');
  expect(drafts.getByRole('combobox')).toHaveValue('已結案');
  expect(drafts.getByRole('textbox', { name: /新增留言/ })).toHaveValue('Unsaved anonymous comment');
  expect(drafts.getByRole('checkbox')).toBeChecked();
  fireEvent.click(drafts.getByRole('button', { name: /儲存修改/ }));
  await drafts.findByRole('alert');
  expect(state.requests).toHaveBeenCalledWith({ action: 'updateProposalControl', payload: {
    id: target.id, status: '已結案', reply: 'Unsaved proposal reply', expectedVersion: 1,
  } }, expect.any(Function));
  expect(JSON.parse(new URL(state.publicRead.mock.calls[2]?.[0], 'http://localhost').searchParams.get('cursor') ?? 'null')).toEqual(cursor);
});

test('clears proposal control and comment drafts on identity changes even without a generation change', async () => {
  // Given distinct unsaved drafts in the first admin's page scope.
  verified(true);
  const view = render(<ProposalsPage />);
  fireEvent.change(await screen.findByPlaceholderText('輸入官方回覆內容...'), { target: { value: 'First admin reply' } });
  fireEvent.change(screen.getByRole('combobox', { name: /提案狀態/ }), { target: { value: '已結案' } });
  fireEvent.change(screen.getByPlaceholderText('寫下您的看法與建議...'), { target: { value: 'First admin comment' } });
  fireEvent.click(screen.getByRole('checkbox'));
  const previous = state.auth;
  const identity = { id: 'other-admin', email: 'other-admin@nehs.hc.edu.tw', displayName: 'Other', isAdmin: true };
  // When a different verified user owns the same page and entities.
  state.auth = { status: 'verified', identity, user: identity, generation: previous.generation, isLoggedIn: true, isAdmin: true };
  view.rerender(<ProposalsPage />);
  // Then no old-user state is visible, including when the previous user returns.
  expect(await screen.findByPlaceholderText('輸入官方回覆內容...')).toHaveValue('Official reply');
  expect(screen.getByRole('combobox', { name: /提案狀態/ })).toHaveValue('處理中');
  expect(screen.getByPlaceholderText('寫下您的看法與建議...')).toHaveValue('');
  expect(screen.getByRole('checkbox')).not.toBeChecked();
  state.auth = previous; view.rerender(<ProposalsPage />);
  expect(await screen.findByPlaceholderText('輸入官方回覆內容...')).toHaveValue('Official reply');
  expect(screen.getByPlaceholderText('寫下您的看法與建議...')).toHaveValue('');
});

test.each(['hidden', 'deleted'] as const)('clears a cached proposal target on %s reload without falling back to its pending row', async outcome => {
  // Given public and private reads for the same linked ID.
  verified(true);
  const target = { ...state.publicRows[0], id: 'off-page', title: 'Previously public target' };
  window.history.replaceState(null, '', '/proposals#item-off-page');
  state.itemRead.mockResolvedValue(target);
  state.reads.mockResolvedValue({ ok: true, data: [{ ...target, title: 'Private pending version', status: '待審核' }] });
  render(<ProposalsPage />);
  const card = (await screen.findByText(target.title)).closest('[id^="item-"]');
  if (!(card instanceof HTMLElement)) throw new TypeError('Missing public target');
  // When the public endpoint no longer permits the item.
  state.itemRead.mockResolvedValue(outcome === 'deleted' ? null : { ...target, status: '待審核' });
  fireEvent.click(within(card).getByRole('button', { name: '重新載入最新資料' }));
  // Then only the independently authorized pending section may keep its private row.
  await waitFor(() => expect(card).not.toBeInTheDocument());
  expect(screen.queryByText(target.title)).toBeNull();
  expect(screen.getByText('Private pending version')).toBeVisible();
  expect(state.itemRead).toHaveBeenCalledTimes(2);
  expect(state.reads).toHaveBeenCalledTimes(1);
});
