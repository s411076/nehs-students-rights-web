import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import ProposalsPage from '../../app/proposals/page';
import type { AuthContextValue } from '../../components/AuthProvider';
import { parseActionRequest } from '../../lib/rights/validation';

const state = vi.hoisted((): { auth: AuthContextValue; count: number; voted: boolean } => ({
  auth: { status: 'anonymous', identity: null, user: null, generation: 0, isLoggedIn: false, isAdmin: false },
  count: 4, voted: false,
}));
vi.mock('../../components/AuthProvider', () => ({ useAuth: () => state.auth }));
function login(id = 'alice', generation = 1) {
  const identity = { id, email: `${id}@nehs.hc.edu.tw`, displayName: id, isAdmin: false };
  state.auth = { status: 'verified', identity, user: identity, generation, isLoggedIn: true, isAdmin: false };
}
function deferred() {
  let resolve: (response: Response) => void = () => { throw new Error('Uninitialized'); };
  let reject: (error: Error) => void = () => { throw new Error('Uninitialized'); };
  const promise = new Promise<Response>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const success = (count: number, voted = true) => Response.json({ ok: true, data: { id: 'p1', voted, upvotes_count: count } });
const rows = () => ['p1', 'p2'].map(id => ({
  id, title: id, content: 'Body', status: '研議中', upvotes_count: state.count, viewer_voted: state.voted,
  legacy_upvotes_count: 4, version: 1, author_name: 'Student', reply: '', created_at: '2026-10-14T00:00:00Z',
}));
function installFetch(mutate: () => Promise<Response> | Response) {
  const fetcher = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input), 'http://localhost');
    if (init?.method === 'POST') return mutate();
    if (url.pathname === '/api/rights/items') return Response.json({ ok: true, data: rows().find(row => row.id === url.searchParams.get('id')) });
    return Response.json({ ok: true, data: { items: url.pathname.endsWith('/comments') ? [] : rows(), nextCursor: null } });
  });
  vi.stubGlobal('fetch', fetcher);
  return fetcher;
}
const vote = (id = 'p1') => within(screen.getByText(id).closest('div.p-5') ?? document.body).getByRole('button', { name: /覆議\/聯署|已聯署/ });
beforeEach(() => {
  login(); state.count = 4; state.voted = false; localStorage.clear();
  window.history.replaceState(null, '', '/proposals');
  vi.spyOn(window, 'alert').mockImplementation(() => {});
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

test('single-flights repeated clicks independently per proposal without persisting optimism', async () => {
  // Given
  const pending = deferred(); const fetcher = installFetch(() => pending.promise);
  render(<ProposalsPage />); await screen.findByText('p1');
  // When
  act(() => { vote().click(); vote().click(); vote('p2').click(); vote('p2').click(); });
  // Then
  const posts = fetcher.mock.calls.filter(([, init]) => init?.method === 'POST');
  expect(posts).toHaveLength(2);
  expect(posts.map(([, init]) => JSON.parse(String(init?.body)))).toEqual([
    { action: 'setVote', payload: { proposalId: 'p1', voted: true } },
    { action: 'setVote', payload: { proposalId: 'p2', voted: true } },
  ]);
  expect(localStorage.getItem('voted_proposals:alice')).toBeNull();
  await act(async () => pending.resolve(success(5)));
});

test.each([false, true])('keeps the server ballot and exact count after a rejected add/cancel (voted=%s)', async voted => {
  // Given
  state.voted = voted;
  localStorage.setItem('voted_proposals:alice', voted ? '[]' : '["p1"]');
  installFetch(() => Response.json({ ok: false, code: 'CONFLICT' }, { status: 409 }));
  render(<ProposalsPage />); await screen.findByText('p1');
  // When
  fireEvent.click(vote()); await screen.findByRole('alert');
  // Then
  expect(vote()).toHaveTextContent(voted ? '已聯署' : '覆議/聯署');
  expect(vote().querySelector('span')).toHaveTextContent('4');
  expect(vote()).toHaveAttribute('aria-pressed', String(voted));
});

test.each([false, true])('uses the receipt ballot without ever writing local vote authority (cancel=%s)', async cancel => {
  // Given
  state.voted = cancel;
  const pending = deferred(); installFetch(() => pending.promise);
  const storage = vi.spyOn(Storage.prototype, 'setItem');
  render(<ProposalsPage />); await screen.findByText('p1');
  // When
  fireEvent.click(vote()); await act(async () => pending.resolve(success(cancel ? 4 : 5, !cancel)));
  // Then
  expect(vote().querySelector('span')).toHaveTextContent(cancel ? '4' : '5');
  expect(vote()).toHaveTextContent(cancel ? '覆議/聯署' : '已聯署');
  expect(storage).not.toHaveBeenCalled();
});

test.each(['disconnect', 'timeout'])('reconciles both count and viewer state without resending after %s', async kind => {
  // Given
  const pending = deferred(); const fetcher = installFetch(() => pending.promise);
  render(<ProposalsPage />); await screen.findByText('p1');
  // When
  fireEvent.click(vote()); state.count = 9; state.voted = true;
  await act(async () => pending.reject(new DOMException('Lost receipt', kind === 'timeout' ? 'TimeoutError' : 'NetworkError')));
  // Then
  expect(screen.getByRole('alert')).toHaveTextContent('無法確認是否已儲存');
  expect(vote()).toHaveTextContent('已聯署');
  expect(vote().querySelector('span')).toHaveTextContent('9');
  expect(fetcher.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1);
  expect(fetcher.mock.calls.some(([path]) => String(path).includes('/api/rights/items?'))).toBe(true);
});

test('ignores forged and malformed storage and discards a prior-user completion', async () => {
  // Given
  localStorage.setItem('voted_proposals', '["p1"]');
  localStorage.setItem('voted_proposals:alice', '["p1"]');
  localStorage.setItem('voted_proposals:bob', '["p1",1]');
  const pending = deferred(); installFetch(() => pending.promise);
  const view = render(<ProposalsPage />); await screen.findByText('p1');
  expect(vote()).toHaveTextContent('覆議/聯署');
  // When
  fireEvent.click(vote()); login('bob', 2); view.rerender(<ProposalsPage />);
  await act(async () => pending.resolve(success(18)));
  // Then
  expect(vote()).toHaveTextContent('覆議/聯署');
  expect(vote().querySelector('span')).toHaveTextContent('4');
  expect(localStorage.getItem('voted_proposals:alice')).toBe('["p1"]');
});

test('storage write failure cannot turn a confirmed vote into a failure', async () => {
  // Given
  installFetch(() => success(7));
  const storage = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('Unavailable', 'QuotaExceededError'); });
  render(<ProposalsPage />); await screen.findByText('p1');
  // When
  await act(async () => fireEvent.click(vote()));
  // Then
  expect(vote()).toHaveTextContent('已聯署');
  expect(vote().querySelector('span')).toHaveTextContent('7');
  expect(screen.queryByRole('alert')).toBeNull();
  expect(storage).not.toHaveBeenCalled();
});

test('unsupported storage never grants anonymous identity or blocks public rendering', async () => {
  // Given
  state.auth = { status: 'anonymous', identity: null, user: null, generation: 2, isLoggedIn: false, isAdmin: false };
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new DOMException('Blocked', 'SecurityError'); });
  const fetcher = installFetch(() => success(5));
  // When
  render(<ProposalsPage />); await screen.findByText('p1'); fireEvent.click(vote());
  // Then
  expect(fetcher.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(0);
  expect(vote()).toHaveTextContent('覆議/聯署');
});

test('restores persisted viewer state from a new server page rather than a browser marker', async () => {
  // Given
  state.count = 5; state.voted = true; installFetch(() => success(4, false));
  const view = render(<ProposalsPage />); await screen.findByText('p1');
  expect(vote()).toHaveTextContent('已聯署');
  // When
  state.count = 4; state.voted = false; login('alice', 2); view.rerender(<ProposalsPage />);
  // Then
  expect(await screen.findByText('p1')).toBeVisible();
  expect(vote()).toHaveTextContent('覆議/聯署');
  expect(vote().querySelector('span')).toHaveTextContent('4');
  expect(screen.getAllByText(/含歷史連署 4 票/)).toHaveLength(2);
});

test('recovers an off-page proposal conflict through targeted reload and explicit draft adoption', async () => {
  // Given a public off-page card edited through the real mutation/read helpers.
  const identity = { id: 'admin', email: 'admin@nehs.hc.edu.tw', displayName: 'Admin', isAdmin: true };
  state.auth = { status: 'verified', identity, user: identity, generation: 1, isLoggedIn: true, isAdmin: true };
  window.history.replaceState(null, '', '/proposals#item-off-page');
  HTMLElement.prototype.scrollIntoView = vi.fn();
  let remote = { ...rows()[0], id: 'off-page', title: 'Targeted proposal', content: 'Targeted body', status: '研議中', reply: 'Original targeted reply', version: 1 };
  const requests: unknown[] = [];
  const fetcher = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input), 'http://localhost');
    if (url.pathname === '/api/rights/items') return Response.json({ ok: true, data: remote });
    if (init?.method === 'POST') {
      const request = parseActionRequest(JSON.parse(String(init.body)));
      if (!request.ok || request.data.action !== 'updateProposalControl') throw new TypeError('Unexpected recovery action');
      requests.push(request.data);
      const { expectedVersion, status, reply } = request.data.payload;
      if (expectedVersion !== remote.version) return Response.json({ ok: false, code: 'CONFLICT' }, { status: 409 });
      remote = { ...remote, status, reply, version: remote.version + 1 };
      return Response.json({ ok: true, data: { id: remote.id, version: remote.version } });
    }
    return Response.json({ ok: true, data: { items: url.pathname === '/api/rights/proposals' ? rows() : [], nextCursor: null } });
  });
  vi.stubGlobal('fetch', fetcher);
  render(<ProposalsPage />);
  await screen.findByText('Original targeted reply');
  const card = document.getElementById('item-off-page');
  if (!card) throw new TypeError('Missing linked proposal');
  const editor = within(card);
  fireEvent.change(editor.getByRole('textbox', { name: /官方回覆/ }), { target: { value: 'Unmerged proposal draft' } });
  fireEvent.change(editor.getByRole('combobox'), { target: { value: '不採納' } });
  remote = { ...remote, status: '通過', reply: 'Latest targeted proposal reply', version: 2 };
  fireEvent.click(editor.getByRole('button', { name: /儲存修改/ }));
  await editor.findByRole('alert');
  // When reloading the conflict, list refresh alone cannot recover this version.
  fireEvent.click(editor.getByRole('button', { name: '重新載入最新資料' }));
  // Then reply and status stay dirty at version 1 until explicit adoption.
  expect(await editor.findByText('Latest targeted proposal reply')).toBeVisible();
  expect(editor.getByRole('textbox', { name: /官方回覆/ })).toHaveValue('Unmerged proposal draft');
  expect(editor.getByRole('combobox')).toHaveValue('不採納');
  fireEvent.click(editor.getByRole('button', { name: /儲存修改/ }));
  await waitFor(() => expect(editor.getByRole('button', { name: /儲存修改/ })).toBeEnabled());
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  fireEvent.click(editor.getByRole('button', { name: '捨棄草稿並使用最新內容' }));
  expect(editor.getByRole('textbox', { name: /官方回覆/ })).toHaveValue('Latest targeted proposal reply');
  expect(editor.getByRole('combobox')).toHaveValue('通過');
  fireEvent.change(editor.getByRole('textbox', { name: /官方回覆/ }), { target: { value: 'Merged proposal reply' } });
  fireEvent.click(editor.getByRole('button', { name: /儲存修改/ }));
  expect(await editor.findByRole('status')).toHaveTextContent('操作已成功完成。');
  expect(requests).toEqual([
    { action: 'updateProposalControl', payload: { id: remote.id, status: '不採納', reply: 'Unmerged proposal draft', expectedVersion: 1 } },
    { action: 'updateProposalControl', payload: { id: remote.id, status: '不採納', reply: 'Unmerged proposal draft', expectedVersion: 1 } },
    { action: 'updateProposalControl', payload: { id: remote.id, status: '通過', reply: 'Merged proposal reply', expectedVersion: 2 } },
  ]);
  expect(fetcher.mock.calls.filter(([path]) => String(path).includes('/api/rights/items?'))).toHaveLength(3);
});
