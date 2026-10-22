import { act, fireEvent, render, renderHook, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import FeedbackPage from '../../app/feedback/page';
import { useAuth } from '../../components/AuthProvider';
import type { AuthContextValue } from '../../components/AuthProvider';
import { useRightsQueue } from '../../components/rights/useRightsQueue';
import { toFeedbackPublicDTO, toProposalDTO } from '../../lib/rights/queries';
import type { FeedbackPublicDTO, ProposalDTO } from '../../lib/rights/queries';
import type { FeedbackQueueFilter } from '../../lib/rights/queues';
import { feedbackQueuePage, pendingQueuePage, proposalQueuePage } from '../fixtures/queue-pages';

vi.mock('../../components/AuthProvider', () => ({ useAuth: vi.fn() }));

const identity = { id: 'admin', email: 'admin@nehs.hc.edu.tw', displayName: '管理員', isAdmin: true };
const admin: AuthContextValue = { status: 'verified', identity, user: identity, generation: 1, isAdmin: true, isLoggedIn: true };
const rows: readonly FeedbackPublicDTO[] = Array.from({ length: 65 }, (_, index) => ({
  id: `feedback-${index}`, title: `建言 ${index}`, content: '完整內容', category: '其他', is_anonymous: true,
  reply: index === 64 ? '已回覆' : '', replied_at: null, version: 1,
  created_at: new Date(Date.UTC(2026, 0, index + 1)).toISOString(),
}));
const response = (population: readonly FeedbackPublicDTO[], path?: string) => Response.json({ ok: true, data: feedbackQueuePage(population, path) });
const tab = (label: string) => screen.getByRole('tab', { name: new RegExp(`^${label}`) });
function deferred() {
  let resolve: (value: Response) => void = () => { throw new TypeError('Uninitialized queue response'); };
  const promise = new Promise<Response>(done => { resolve = done; });
  return { promise, resolve };
}
function useFeedbackQueue(filter: FeedbackQueueFilter, query = '') {
  return useRightsQueue({ kind: 'feedback', filter }, toFeedbackPublicDTO, { query });
}

beforeEach(() => {
  vi.mocked(useAuth).mockReturnValue(admin);
  window.history.replaceState(null, '', '/feedback');
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

test('rejects a delayed old filter response after a newer tab has loaded', async () => {
  // Given
  const stale = deferred();
  const fetcher = vi.fn((input: string | URL | Request) => String(input).includes('filter=awaiting')
    ? stale.promise : Promise.resolve(response(rows, String(input))));
  vi.stubGlobal('fetch', fetcher);
  render(<FeedbackPage />);
  // When
  fireEvent.click(tab('已回覆'));
  await screen.findByRole('heading', { name: '建言 64' });
  await act(async () => stale.resolve(response(rows, '/api/rights/queue?kind=feedback&filter=awaiting')));
  // Then
  expect(within(screen.getByRole('tabpanel')).getAllByRole('heading', { level: 3 }).map(node => node.textContent)).toEqual(['建言 64']);
  expect(within(tab('待回覆')).getByText('64')).toBeVisible();
  expect(screen.getByText('已載入 1／1 筆')).toBeVisible();
});

test.each(['generation', 'identity', 'query'] as const)('clears queue metadata and rejects a stale read when %s changes', async change => {
  // Given
  const stale = deferred();
  const fetcher = vi.fn().mockReturnValueOnce(stale.promise).mockImplementation((input: string | URL | Request) => response(rows, String(input)));
  vi.stubGlobal('fetch', fetcher);
  const view = renderHook(({ query }) => useFeedbackQueue('all', query), { initialProps: { query: '' } });
  // When
  switch (change) {
    case 'generation': vi.mocked(useAuth).mockReturnValue({ ...admin, generation: 2 }); break;
    case 'identity': {
      const next = { ...identity, id: 'other-admin' };
      vi.mocked(useAuth).mockReturnValue({ ...admin, identity: next, user: next });
      break;
    }
    case 'query': break;
    default: throw new TypeError(`Unexpected scope change: ${change satisfies never}`);
  }
  view.rerender({ query: change === 'query' ? '建言 64' : '' });
  expect(view.result.current.counts).toBeNull();
  expect(view.result.current.total).toBeNull();
  await waitFor(() => expect(view.result.current.status).toBe('ready'));
  const expectedIds = view.result.current.items.map(item => item.id);
  await act(async () => stale.resolve(response([])));
  // Then
  expect(view.result.current.items.map(item => item.id)).toEqual(expectedIds);
  expect(view.result.current.total).toBe(change === 'query' ? 1 : 65);
});

test('rejects a stale public page when the queue kind changes to pending', async () => {
  // Given
  const item: ProposalDTO = { id: 'pending', title: '待審核', content: '內容', author_name: '學生', status: '待審核',
    reply: '', created_at: '2026-01-01T00:00:00Z', version: 1, upvotes_count: 0, viewer_voted: false, legacy_upvotes_count: 0 };
  const stale = deferred();
  vi.stubGlobal('fetch', vi.fn().mockReturnValueOnce(stale.promise).mockImplementation((input: string | URL | Request) =>
    Response.json({ ok: true, data: pendingQueuePage([item], String(input)) })));
  const view = renderHook(({ pending }) => useRightsQueue(pending ? { kind: 'pending', filter: 'pending' }
    : { kind: 'proposal', filter: 'all' }, toProposalDTO), { initialProps: { pending: false } });
  // When
  view.rerender({ pending: true });
  await waitFor(() => expect(view.result.current.total).toBe(1));
  await act(async () => stale.resolve(Response.json({ ok: true, data: proposalQueuePage([]) })));
  // Then
  expect(view.result.current.items).toEqual([item]);
  expect(view.result.current.counts).toEqual({ pending: 1 });
});

test('reloads only the opened batch count instead of automatically draining a queue', async () => {
  // Given
  const fetcher = vi.fn((input: string | URL | Request) => Promise.resolve(response(rows, String(input))));
  vi.stubGlobal('fetch', fetcher);
  const view = renderHook(() => useFeedbackQueue('awaiting'));
  await waitFor(() => expect(view.result.current.items).toHaveLength(20));
  await act(async () => { await view.result.current.loadMore(); });
  expect(view.result.current.items).toHaveLength(40);
  // When
  await act(async () => { await view.result.current.refresh(); });
  // Then
  expect(fetcher).toHaveBeenCalledTimes(4);
  expect(view.result.current.items).toHaveLength(40);
  expect(view.result.current.total).toBe(64);
  expect(view.result.current.nextCursor).not.toBeNull();
  expect(fetcher.mock.calls.slice(2).map(([input]) => new URL(String(input), 'http://localhost').searchParams.get('limit'))).toEqual(['20', '20']);
});

test('refreshes the active filter through a callback captured by an earlier save without caching inactive pages', async () => {
  // Given
  const fetcher = vi.fn((input: string | URL | Request) => Promise.resolve(response(rows, String(input))));
  vi.stubGlobal('fetch', fetcher);
  const view = renderHook(({ filter }: { readonly filter: FeedbackQueueFilter }) => useFeedbackQueue(filter), { initialProps: { filter: 'awaiting' } });
  await waitFor(() => expect(view.result.current.items).toHaveLength(20));
  const saveRefresh = view.result.current.refresh;
  await act(async () => { await view.result.current.loadMore(); });
  view.rerender({ filter: 'replied' });
  await waitFor(() => expect(view.result.current.total).toBe(1));
  // When
  await act(async () => { await saveRefresh(); });
  view.rerender({ filter: 'awaiting' });
  await waitFor(() => expect(view.result.current.status).toBe('ready'));
  // Then
  expect(view.result.current.refresh).toBe(saveRefresh);
  expect(fetcher.mock.calls.map(([input]) => new URL(String(input), 'http://localhost').searchParams.get('filter')))
    .toEqual(['awaiting', 'awaiting', 'replied', 'replied', 'awaiting']);
  expect(view.result.current.items).toHaveLength(20);
  expect(new URL(String(fetcher.mock.calls.at(-1)?.[0]), 'http://localhost').searchParams.has('cursor')).toBe(false);
});

test('opens only one next batch when load-more is activated twice before a response', async () => {
  // Given
  const next = deferred();
  const fetcher = vi.fn((input: string | URL | Request) => String(input).includes('cursor=') ? next.promise : Promise.resolve(response(rows, String(input))));
  vi.stubGlobal('fetch', fetcher);
  const view = renderHook(() => useFeedbackQueue('awaiting'));
  await waitFor(() => expect(view.result.current.items).toHaveLength(20));
  // When
  await act(async () => {
    const first = view.result.current.loadMore();
    expect(await view.result.current.loadMore()).toMatchObject({ ok: false });
    next.resolve(response(rows, String(fetcher.mock.calls.at(-1)?.[0])));
    await first;
  });
  // Then
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(view.result.current.items).toHaveLength(40);
});

test.each(['unavailable', 'missing-counts'] as const)('shows unknown totals instead of completion when the queue response is %s', async failure => {
  // Given
  const fetcher = vi.fn().mockResolvedValue(failure === 'unavailable'
    ? Response.json({ ok: false, code: 'UNAVAILABLE' }, { status: 503 })
    : Response.json({ ok: true, data: { items: [], nextCursor: null, total: 0 } }));
  vi.stubGlobal('fetch', fetcher);
  render(<FeedbackPage />);
  await screen.findByRole('alert');
  expect(screen.getByText('已載入 0／— 筆')).toBeVisible();
  for (const button of screen.getAllByRole('tab')) expect(within(button).getByText('—')).toBeVisible();
  expect(screen.queryByText('目前沒有待回覆建言')).toBeNull();
  // When
  fetcher.mockImplementation((input: string | URL | Request) => Promise.resolve(response([], String(input))));
  fireEvent.click(screen.getByRole('button', { name: '重新載入' }));
  // Then
  expect(await screen.findByText('目前沒有待回覆建言')).toBeVisible();
  expect(screen.getByText('已載入 0／0 筆')).toBeVisible();
});

test('retains cards but invalidates totals when a refresh fails', async () => {
  // Given
  const fetcher = vi.fn((input: string | URL | Request) => Promise.resolve(response(rows, String(input))));
  vi.stubGlobal('fetch', fetcher);
  const view = renderHook(() => useFeedbackQueue('awaiting'));
  await waitFor(() => expect(view.result.current.total).toBe(64));
  fetcher.mockResolvedValueOnce(Response.json({ ok: false, code: 'UNAVAILABLE' }, { status: 503 }));
  // When
  await act(async () => { expect(await view.result.current.refresh()).toMatchObject({ ok: false }); });
  // Then
  expect(view.result.current.items).toHaveLength(20);
  expect(view.result.current.counts).toBeNull();
  expect(view.result.current.total).toBeNull();
  expect(view.result.current.status).toBe('error');
});
