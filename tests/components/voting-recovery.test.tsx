import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import ProposalsPage from '../../app/proposals/page';
import type { AuthContextValue } from '../../components/AuthProvider';

const state = vi.hoisted((): { auth: AuthContextValue; count: number } => {
  const auth: AuthContextValue = { status: 'anonymous', identity: null, user: null, generation: 0, isLoggedIn: false, isAdmin: false };
  return { auth, count: 4 };
});
vi.mock('../../components/AuthProvider', () => ({ useAuth: () => state.auth }));
vi.mock('../../lib/supabase', () => ({ createClient: () => ({
  from(table: string) {
    const rows = () => table === 'proposals' ? ['p1', 'p2'].map(id => ({ id, title: id, content: 'Body', status: '研議中', upvotes_count: state.count, author_name: 'Student', reply: '', created_at: '2026-10-14' })) : [];
    const query = { select: () => query, in: () => query, eq: () => query,
      order: async () => ({ data: rows(), error: null }),
      then: (done: (value: unknown) => unknown) => Promise.resolve({ data: rows(), error: null }).then(done),
    };
    return query;
  },
}) }));
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
const success = (count: number) => Response.json({ ok: true, data: { id: 'p1', upvotes_count: count } });
const vote = (id = 'p1') => within(screen.getByText(id).closest('div.p-5') ?? document.body).getByRole('button', { name: /👍/ });
beforeEach(() => { login(); state.count = 4; localStorage.clear(); vi.spyOn(window, 'alert').mockImplementation(() => {}); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

test('single-flights repeated clicks before rerender independently per target without persisting optimism', async () => {
  // Given
  const pending = deferred(); const fetch = vi.fn().mockReturnValue(pending.promise); vi.stubGlobal('fetch', fetch);
  render(<ProposalsPage />); await screen.findByText('p1');
  // When
  act(() => { vote().click(); vote().click(); vote('p2').click(); vote('p2').click(); });
  // Then
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(fetch.mock.calls.map(call => JSON.parse(call[1].body).payload.proposalId)).toEqual(['p1', 'p2']);
  expect(localStorage.getItem('voted_proposals:alice')).toBeNull();
  await act(async () => pending.resolve(success(5)));
});

test.each([false, true])('restores exact count and marker after rejected add/cancel (voted=%s)', async voted => {
  // Given
  if (voted) localStorage.setItem('voted_proposals:alice', '["p1"]');
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ ok: false, code: 'CONFLICT' }, { status: 409 })));
  render(<ProposalsPage />); await screen.findByText('p1');
  // When
  fireEvent.click(vote()); await screen.findByRole('alert');
  // Then
  expect(vote()).toHaveTextContent(voted ? '已聯署' : '覆議/聯署');
  expect(vote().querySelector('span')).toHaveTextContent('4');
  expect(localStorage.getItem('voted_proposals:alice')).toBe(voted ? '["p1"]' : null);
});

test.each([false, true])('commits returned count and scoped marker exactly once (cancel=%s)', async cancel => {
  // Given
  if (cancel) localStorage.setItem('voted_proposals:alice', '["p1"]');
  const pending = deferred(); vi.stubGlobal('fetch', vi.fn().mockReturnValue(pending.promise));
  const storage = vi.spyOn(Storage.prototype, 'setItem');
  render(<ProposalsPage />); await screen.findByText('p1');
  // When
  fireEvent.click(vote()); await act(async () => pending.resolve(success(0)));
  // Then
  expect(vote().querySelector('span')).toHaveTextContent('0');
  expect(vote()).toHaveTextContent(cancel ? '覆議/聯署' : '已聯署');
  expect(storage).toHaveBeenCalledExactlyOnceWith('voted_proposals:alice', cancel ? '[]' : '["p1"]');
});

test.each(['disconnect', 'timeout'])('refreshes count but preserves prior marker and never retries after %s', async kind => {
  // Given
  const pending = deferred(); const fetch = vi.fn().mockReturnValue(pending.promise); vi.stubGlobal('fetch', fetch);
  render(<ProposalsPage />); await screen.findByText('p1');
  // When: upstream commits, but its receipt is lost.
  fireEvent.click(vote()); state.count = 9;
  await act(async () => pending.reject(new DOMException('Lost receipt', kind === 'timeout' ? 'TimeoutError' : 'NetworkError')));
  // Then
  expect(screen.getByRole('alert')).toHaveTextContent('無法確認是否已儲存，請先更新清單確認，勿重複提交。');
  expect(vote()).toHaveTextContent('覆議/聯署');
  expect(vote().querySelector('span')).toHaveTextContent('9');
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(localStorage.getItem('voted_proposals:alice')).toBeNull();
});

test('isolates users, ignores legacy and malformed cache, and discards late completion', async () => {
  // Given
  localStorage.setItem('voted_proposals', '["p1"]');
  localStorage.setItem('voted_proposals:alice', '["p1"]');
  localStorage.setItem('voted_proposals:bob', '["p1", 1]');
  const pending = deferred(); vi.stubGlobal('fetch', vi.fn().mockReturnValue(pending.promise));
  const view = render(<ProposalsPage />); await screen.findByText('p1');
  expect(vote()).toHaveTextContent('已聯署');
  // When
  fireEvent.click(vote()); login('bob', 2); view.rerender(<ProposalsPage />);
  await act(async () => pending.resolve(success(18)));
  // Then
  expect(vote()).toHaveTextContent('覆議/聯署');
  expect(vote().querySelector('span')).toHaveTextContent('4');
  expect(localStorage.getItem('voted_proposals:alice')).toBe('["p1"]');
  expect(localStorage.getItem('voted_proposals:bob')).toBe('["p1", 1]');
  expect(localStorage.getItem('voted_proposals')).toBe('["p1"]');
});

test('storage write failure warns locally without turning committed vote into failure', async () => {
  // Given
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(success(7)));
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('Unavailable', 'QuotaExceededError'); });
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  render(<ProposalsPage />); await screen.findByText('p1');
  // When
  await act(async () => fireEvent.click(vote()));
  // Then
  expect(vote()).toHaveTextContent('已聯署');
  expect(vote().querySelector('span')).toHaveTextContent('7');
  expect(screen.queryByRole('alert')).toBeNull(); expect(warn).toHaveBeenCalled();
});

test('unsupported storage never grants anonymous identity or blocks public rendering', async () => {
  // Given
  state.auth = { status: 'anonymous', identity: null, user: null, generation: 2, isLoggedIn: false, isAdmin: false };
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new DOMException('Blocked', 'SecurityError'); });
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
  // When
  render(<ProposalsPage />); await screen.findByText('p1'); fireEvent.click(vote());
  // Then
  expect(fetch).not.toHaveBeenCalled(); expect(vote()).toHaveTextContent('覆議/聯署');
});
