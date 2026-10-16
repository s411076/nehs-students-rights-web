import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import ProposalsPage from '../../app/proposals/page';
import { useAuth } from '../../components/AuthProvider';
import type { ProposalDTO } from '../../lib/rights/queries';

vi.mock('../../components/AuthProvider', () => ({ useAuth: vi.fn() }));

const discussing: ProposalDTO = {
  id: 'discussing', title: '研議提案', content: '研議內容', author_name: '學生', status: '研議中',
  reply: '', created_at: '2026-02-01T00:00:00Z', version: 3,
  upvotes_count: 0, viewer_voted: false, legacy_upvotes_count: 0,
};
const adopted: ProposalDTO = { ...discussing, id: 'adopted', title: '已採納連結目標', status: '已採納' };
const page = (items: readonly ProposalDTO[]) => Response.json({ ok: true, data: { items, nextCursor: null } });
const tab = (label: string) => screen.getByRole('tab', { name: new RegExp(`^${label}`) });
const frames = new Map<number, FrameRequestCallback>();
let frameId = 0;
function paint() {
  const pending = Array.from(frames.values());
  frames.clear();
  for (const callback of pending) callback(0);
}
function list(items: readonly ProposalDTO[], target: ProposalDTO | null = adopted) {
  const fetcher = vi.fn(async (input: string | URL | Request) => {
    const url = new URL(String(input), 'http://localhost');
    if (url.pathname === '/api/rights/items') return Response.json({ ok: true, data: target });
    return page(url.pathname === '/api/rights/proposals' ? items : []);
  });
  vi.stubGlobal('fetch', fetcher);
  return fetcher;
}

beforeEach(() => {
  vi.mocked(useAuth).mockReturnValue({ status: 'anonymous', identity: null, user: null, generation: 0, isAdmin: false, isLoggedIn: false });
  window.history.replaceState(null, '', '/proposals');
  frames.clear();
  frameId = 0;
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { frames.set(++frameId, callback); return frameId; });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => { frames.delete(id); });
  HTMLElement.prototype.scrollIntoView = vi.fn();
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

test.each([false, true])('keeps and scrolls a search hash when its status is filtered out (offPage=%s)', async offPage => {
  // Given a homepage-search hash and a target loaded either by the list or the public item read.
  window.history.replaceState(null, '', '/proposals?q=提案#item-adopted');
  const fetcher = list(offPage ? [discussing] : [discussing, adopted]);
  render(<ProposalsPage />);
  await screen.findByRole('tab', { name: offPage ? /全部.*1/ : /全部.*2/ });
  await screen.findByRole('heading', { name: adopted.title });
  const reads = fetcher.mock.calls.length;
  // When
  fireEvent.click(tab('研議中'));
  act(paint);
  // Then counts remain loaded-only and the real public card is still the scroll target.
  const target = document.getElementById(`item-${adopted.id}`);
  expect(target).toBeVisible();
  expect(document.querySelectorAll(`#item-${adopted.id}`)).toHaveLength(1);
  expect(tab('研議中')).toHaveAttribute('aria-selected', 'true');
  expect(within(tab('研議中')).getByText('1')).toBeVisible();
  expect(within(tab('已採納')).getByText(offPage ? '0' : '1')).toBeVisible();
  expect(fetcher).toHaveBeenCalledTimes(reads);
  expect(HTMLElement.prototype.scrollIntoView).toHaveBeenLastCalledWith({ block: 'start' });
  expect(vi.mocked(HTMLElement.prototype.scrollIntoView).mock.instances.at(-1)).toBe(target);
  expect(screen.getByRole('tabpanel')).toHaveClass('[&>[id^=item-]]:scroll-mt-36', 'sm:[&>[id^=item-]]:scroll-mt-32');
  expect(fetcher.mock.calls.some(([input]) => String(input).includes('/pending'))).toBe(false);
});

test('renders and scrolls an off-tab loaded card without an item read when the hash changes', async () => {
  // Given a loaded adopted proposal hidden by the active discussing filter.
  const fetcher = list([discussing, adopted]);
  render(<ProposalsPage />);
  await screen.findByRole('tab', { name: /全部.*2/ });
  fireEvent.click(tab('研議中'));
  expect(screen.queryByRole('heading', { name: adopted.title })).toBeNull();
  // When
  act(() => {
    window.history.replaceState(null, '', '/proposals#item-adopted');
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  });
  act(paint);
  // Then
  const target = document.getElementById(`item-${adopted.id}`);
  expect(target).toBeVisible();
  expect(vi.mocked(HTMLElement.prototype.scrollIntoView).mock.instances.at(-1)).toBe(target);
  expect(tab('研議中')).toHaveAttribute('aria-selected', 'true');
  expect(fetcher.mock.calls.some(([input]) => String(input).includes('/items?'))).toBe(false);
});

test('removes the off-tab exception when the hash is cleared', async () => {
  // Given a linked adopted row in the discussing filter.
  window.history.replaceState(null, '', '/proposals#item-adopted');
  list([discussing, adopted]);
  render(<ProposalsPage />);
  await screen.findByRole('tab', { name: /全部.*2/ });
  fireEvent.click(tab('研議中'));
  // When
  act(() => {
    window.history.replaceState(null, '', '/proposals');
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  });
  // Then
  expect(screen.queryByRole('heading', { name: adopted.title })).toBeNull();
  expect(screen.getByRole('heading', { name: discussing.title })).toBeVisible();
});

test.each([
  { label: '全部', empty: '目前尚無公開提案。' },
  { label: '研議中', empty: '目前尚無研議中的提案。' },
  { label: '通過', empty: '目前尚無通過的提案。' },
  { label: '已採納', empty: '目前尚無已採納的提案。' },
  { label: '不採納', empty: '目前尚無不採納的提案。' },
])('keeps unavailable-link feedback alongside the $label empty state', async ({ label, empty }) => {
  // Given a search hash that has no publicly accessible result.
  window.history.replaceState(null, '', '/proposals?q=找不到#item-adopted');
  const fetcher = list([], null);
  render(<ProposalsPage />);
  await screen.findByRole('alert');
  await screen.findByText('目前尚無公開提案。');
  const reads = fetcher.mock.calls.length;
  // When
  fireEvent.click(tab(label));
  act(paint);
  // Then
  expect(screen.getByRole('alert')).toHaveTextContent('此項目未公開、已刪除或無法存取。');
  expect(screen.getByRole('button', { name: '重新載入連結項目' })).toBeVisible();
  expect(within(screen.getByRole('tabpanel')).getByText(empty)).toBeVisible();
  expect(HTMLElement.prototype.scrollIntoView).not.toHaveBeenCalled();
  expect(fetcher).toHaveBeenCalledTimes(reads);
});

test('retains control and anonymous-comment drafts when a filtered card remounts', async () => {
  // Given separate unsaved drafts in a card unmounted by a different status tab.
  const identity = { id: 'admin', email: 'admin@nehs.hc.edu.tw', displayName: '管理員', isAdmin: true };
  vi.mocked(useAuth).mockReturnValue({ status: 'verified', identity, user: identity, generation: 1, isAdmin: true, isLoggedIn: true });
  const fetcher = list([discussing, adopted]);
  render(<ProposalsPage />);
  await screen.findByRole('tab', { name: /全部.*2/ });
  const card = document.getElementById(`item-${discussing.id}`);
  if (!card) throw new TypeError('Missing discussing card');
  const editor = within(card);
  fireEvent.change(editor.getByRole('textbox', { name: /官方回覆/ }), { target: { value: '尚未送出的官方回覆' } });
  fireEvent.change(editor.getByRole('combobox'), { target: { value: '不採納' } });
  fireEvent.change(editor.getByRole('textbox', { name: /新增留言/ }), { target: { value: '尚未送出的匿名留言' } });
  fireEvent.click(editor.getByRole('checkbox'));
  fireEvent.click(tab('已採納'));
  expect(document.getElementById(`item-${discussing.id}`)).toBeNull();
  // When
  fireEvent.click(tab('研議中'));
  // Then
  const restored = document.getElementById(`item-${discussing.id}`);
  if (!restored) throw new TypeError('Missing restored card');
  const drafts = within(restored);
  expect(drafts.getByRole('textbox', { name: /官方回覆/ })).toHaveValue('尚未送出的官方回覆');
  expect(drafts.getByRole('combobox')).toHaveValue('不採納');
  expect(drafts.getByRole('textbox', { name: /新增留言/ })).toHaveValue('尚未送出的匿名留言');
  expect(drafts.getByRole('checkbox')).toBeChecked();
  expect(fetcher.mock.calls.filter(([input]) => new URL(String(input), 'http://localhost').pathname === '/api/rights/proposals')).toHaveLength(1);
});
