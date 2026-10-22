import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import ProposalsPage from '../../app/proposals/page';
import { PendingProposal } from '../../app/proposals/PendingProposal';
import { useAuth } from '../../components/AuthProvider';
import type { ProposalDTO } from '../../lib/rights/queries';
import { pendingQueuePage, proposalQueuePage } from '../fixtures/queue-pages';

vi.mock('../../components/AuthProvider', () => ({ useAuth: vi.fn() }));

const item: ProposalDTO = {
  id: 'pending-1', title: '需要審核且標題很長的學生提案', content: '完整待審核內容\n第二段內容', author_name: '學生', status: '待審核',
  reply: '', created_at: '2026-02-02T00:00:00Z', version: 7,
  upvotes_count: 17, viewer_voted: false, legacy_upvotes_count: 0,
};
const disclosure = () => screen.getByRole('button', { name: `提案詳情：${item.title}` });

beforeEach(() => {
  const identity = { id: 'admin', email: 'admin@nehs.hc.edu.tw', displayName: '管理員', isAdmin: true };
  vi.mocked(useAuth).mockReturnValue({ status: 'verified', identity, user: identity, generation: 1, isAdmin: true, isLoggedIn: true });
  window.history.replaceState(null, '', '/proposals');
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

test('shows a compact summary without fetching author data when a pending row mounts', () => {
  // Given
  const fetcher = vi.fn();
  vi.stubGlobal('fetch', fetcher);
  // When
  render(<PendingProposal item={item} refresh={vi.fn()} />);
  // Then
  const summary = screen.getByRole('button', { name: /^待審核/ });
  expect(summary).toHaveAttribute('aria-controls', disclosure().getAttribute('aria-controls'));
  expect(summary).toHaveAttribute('aria-expanded', 'false');
  expect(screen.getByText(item.title)).toHaveClass('truncate');
  expect(summary).toHaveTextContent('待審核');
  expect(summary).toHaveTextContent(`${new Date(item.created_at).toLocaleDateString()} · 17 票`);
  expect(disclosure()).toHaveAttribute('aria-expanded', 'false');
  expect(screen.getByText(/完整待審核內容/)).not.toBeVisible();
  expect(screen.queryByRole('button', { name: '查看作者（僅管理員）' })).toBeNull();
  expect(document.getElementById(`item-${item.id}`)).toBeNull();
  expect(fetcher).not.toHaveBeenCalled();
});

test.each([false, true])('toggles full detail and attribution access when expanded=%s', expanded => {
  // Given
  render(<PendingProposal item={item} refresh={vi.fn()} />);
  if (expanded) fireEvent.click(disclosure());
  // When
  fireEvent.click(disclosure());
  // Then
  expect(disclosure()).toHaveAttribute('aria-expanded', String(!expanded));
  const detail = document.getElementById(disclosure().getAttribute('aria-controls') ?? '');
  expect(detail).toBeInTheDocument();
  if (expanded) {
    expect(detail).not.toBeVisible();
    expect(screen.queryByRole('button', { name: '查看作者（僅管理員）' })).toBeNull();
  } else {
    expect(detail).toBeVisible();
    expect(screen.getByText(/完整待審核內容/)).toBeVisible();
    expect(screen.getByRole('button', { name: '查看作者（僅管理員）' })).toBeVisible();
  }
  expect(window.location.hash).toBe('');
});

test.each([
  { action: 'approveProposal', label: '核准上架', primary: true },
  { action: 'rejectProposal', label: '退回提案', primary: false },
])('sends $action with expectedVersion without bubbling navigation when the row action is pressed', async ({ action, label, primary }) => {
  // Given
  const fetcher = vi.fn().mockResolvedValue(Response.json({ ok: true, data: { id: item.id, version: 8 } }));
  vi.stubGlobal('fetch', fetcher);
  const refresh = vi.fn().mockResolvedValue({ ok: true });
  const navigate = vi.fn();
  render(<PendingProposal item={item} refresh={refresh} />);
  const button = screen.getByRole('button', { name: label });
  document.addEventListener('click', navigate);
  // When
  fireEvent.click(button);
  document.removeEventListener('click', navigate);
  // Then
  expect(await screen.findByRole('status')).toHaveTextContent('操作已成功完成。');
  expect(fetcher).toHaveBeenCalledExactlyOnceWith('/api/rights/actions', expect.objectContaining({ method: 'POST' }));
  expect(JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body))).toEqual({ action, payload: { id: item.id, expectedVersion: 7 } });
  expect(button).toHaveClass('min-h-11', 'min-w-11', primary ? 'bg-primary' : 'bg-neutral-100');
  expect(button.parentElement).toHaveClass('gap-2');
  expect(refresh).toHaveBeenCalledOnce();
  expect(navigate).not.toHaveBeenCalled();
  expect(window.location.hash).toBe('');
  expect(disclosure()).toHaveAttribute('aria-expanded', 'true');
  if (action === 'rejectProposal') expect(window.confirm).toHaveBeenCalledExactlyOnceWith('確定要退回這項提案嗎？');
  else expect(window.confirm).not.toHaveBeenCalled();
});

test('does not reject or navigate when the existing confirmation is declined', () => {
  // Given
  vi.mocked(window.confirm).mockReturnValue(false);
  const fetcher = vi.fn();
  vi.stubGlobal('fetch', fetcher);
  render(<PendingProposal item={item} refresh={vi.fn()} />);
  // When
  fireEvent.click(screen.getByRole('button', { name: '退回提案' }));
  // Then
  expect(fetcher).not.toHaveBeenCalled();
  expect(window.location.hash).toBe('');
  expect(disclosure()).toHaveAttribute('aria-expanded', 'false');
});

test.each([false, true])('toggles detail without navigation or moderation when the summary is tapped with expanded=%s', expanded => {
  // Given
  const fetcher = vi.fn();
  vi.stubGlobal('fetch', fetcher);
  render(<PendingProposal item={item} refresh={vi.fn()} />);
  if (expanded) fireEvent.click(disclosure());
  const summary = screen.getByRole('button', { name: /^待審核/ });
  // When
  fireEvent.click(summary);
  // Then
  expect(summary).toHaveAttribute('aria-expanded', String(!expanded));
  expect(disclosure()).toHaveAttribute('aria-expanded', String(!expanded));
  if (expanded) expect(screen.getByText(/完整待審核內容/)).not.toBeVisible();
  else expect(screen.getByText(/完整待審核內容/)).toBeVisible();
  expect(window.location.hash).toBe('');
  expect(fetcher).not.toHaveBeenCalled();
  expect(window.confirm).not.toHaveBeenCalled();
});

test('disables both review actions during a single flight', async () => {
  // Given
  let finish: (response: Response) => void = () => { throw new TypeError('Missing action'); };
  const fetcher = vi.fn(() => new Promise<Response>(resolve => { finish = resolve; }));
  vi.stubGlobal('fetch', fetcher);
  render(<PendingProposal item={item} refresh={vi.fn()} />);
  // When
  fireEvent.click(screen.getByRole('button', { name: '核准上架' }));
  // Then
  expect(screen.getByRole('button', { name: '核准上架' })).toBeDisabled();
  expect(screen.getByRole('button', { name: '退回提案' })).toBeDisabled();
  expect(fetcher).toHaveBeenCalledOnce();
  await act(async () => finish(Response.json({ ok: false, code: 'CONFLICT' }, { status: 409 })));
});

test('opens conflict recovery and reloads current content without replaying the review', async () => {
  // Given a stale pending row rejected by the real mutation adapter.
  const fetcher = vi.fn().mockResolvedValue(Response.json({ ok: false, code: 'CONFLICT' }, { status: 409 }));
  vi.stubGlobal('fetch', fetcher);
  const refresh = vi.fn();
  const view = render(<PendingProposal item={item} refresh={refresh} />);
  fireEvent.click(screen.getByRole('button', { name: '核准上架' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(/草稿已保留.*重新載入/);
  const latest = { ...item, version: 8, content: '最新待審核內容' };
  refresh.mockImplementation(async () => { view.rerender(<PendingProposal item={latest} refresh={refresh} />); });
  // When
  fireEvent.click(screen.getByRole('button', { name: '重新載入最新資料' }));
  // Then
  expect(screen.getByText(latest.content)).toBeVisible();
  expect(refresh).toHaveBeenCalledOnce();
  expect(fetcher).toHaveBeenCalledOnce();
  expect(disclosure()).toHaveAttribute('aria-expanded', 'true');
});

test('uses the refreshed version when an administrator explicitly reviews again after a conflict', async () => {
  // Given a conflicted row that has been explicitly reloaded.
  const fetcher = vi.fn().mockResolvedValue(Response.json({ ok: false, code: 'CONFLICT' }, { status: 409 }));
  vi.stubGlobal('fetch', fetcher);
  const refresh = vi.fn();
  const view = render(<PendingProposal item={item} refresh={refresh} />);
  fireEvent.click(screen.getByRole('button', { name: '核准上架' }));
  await screen.findByRole('alert');
  refresh.mockImplementation(async () => { view.rerender(<PendingProposal item={{ ...item, version: 8 }} refresh={refresh} />); });
  fireEvent.click(screen.getByRole('button', { name: '重新載入最新資料' }));
  // When
  fireEvent.click(screen.getByRole('button', { name: '退回提案' }));
  // Then
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
  expect(JSON.parse(String(fetcher.mock.calls[1]?.[1]?.body))).toEqual({ action: 'rejectProposal', payload: { id: item.id, expectedVersion: 8 } });
});

test('retains explicitly revealed attribution when detail is collapsed and reopened', async () => {
  // Given author lookup has completed and its detail was collapsed.
  const fetcher = vi.fn().mockResolvedValue(Response.json({ ok: true, data: {
    attribution: 'known', user_id: 'author-id', email: 'author@nehs.hc.edu.tw', display_name: '作者',
  } }));
  vi.stubGlobal('fetch', fetcher);
  render(<PendingProposal item={item} refresh={vi.fn()} />);
  fireEvent.click(disclosure());
  fireEvent.click(screen.getByRole('button', { name: '查看作者（僅管理員）' }));
  await screen.findByText('author@nehs.hc.edu.tw');
  fireEvent.click(disclosure());
  // When
  fireEvent.click(disclosure());
  // Then
  expect(screen.getByText('author@nehs.hc.edu.tw')).toBeVisible();
  expect(fetcher).toHaveBeenCalledOnce();
  expect(String(fetcher.mock.calls[0]?.[0])).toBe('/api/rights/authors?kind=proposal&id=pending-1');
});

test('opens the globally oldest pending batch immediately from more than fifty queued proposals', async () => {
  // Given
  const old = { ...item, id: 'old', title: '最早待審核提案', created_at: '2026-01-01T00:00:00Z' };
  const population = [old, ...Array.from({ length: 60 }, (_, index) => ({ ...item, id: `pending-${index}`,
    title: `待審核提案 ${index}`, created_at: new Date(Date.UTC(2026, 1, index + 1)).toISOString() }))];
  const fetcher = vi.fn(async (input: string | URL | Request) => Response.json({ ok: true, data:
    new URL(String(input), 'http://localhost').searchParams.get('kind') === 'pending'
      ? pendingQueuePage(population, String(input)) : proposalQueuePage([], String(input)) }));
  vi.stubGlobal('fetch', fetcher);
  // When
  render(<ProposalsPage />);
  await screen.findByRole('button', { name: new RegExp(`^待審核.*${old.title}`) });
  // Then
  expect(screen.getAllByRole('button', { name: /^待審核/ }).map(node => node.getAttribute('aria-controls')))
    .toEqual(['pending-detail-old', ...population.slice(1, 20).map(row => `pending-detail-${row.id}`)]);
  expect(screen.getByRole('heading', { name: /待審核提案區/ })).toHaveTextContent('已載入 20／61 筆');
  expect(fetcher).toHaveBeenCalledTimes(2);
});

test('shows the pending empty state after a successful zero-row read', async () => {
  // Given
  vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => Response.json({ ok: true, data:
    new URL(String(input), 'http://localhost').searchParams.get('kind') === 'pending'
      ? pendingQueuePage([], String(input)) : proposalQueuePage([], String(input)) })));
  // When
  render(<ProposalsPage />);
  // Then
  expect(await screen.findByText('目前尚無等待審核的提案。')).toBeVisible();
  expect(screen.queryByRole('button', { name: '核准上架' })).toBeNull();
  expect(within(screen.getByRole('tablist')).getByRole('tab', { selected: true })).toHaveTextContent('全部0');
});
