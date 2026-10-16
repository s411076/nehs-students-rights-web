import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import FeedbackPage from '../../app/feedback/page';
import { useAuth } from '../../components/AuthProvider';
import type { FeedbackPublicDTO } from '../../lib/rights/queries';

vi.mock('../../components/AuthProvider', () => ({ useAuth: vi.fn() }));

const awaiting: FeedbackPublicDTO = {
  id: 'linked-awaiting', title: '待辦建言', content: '公開待辦內容', category: '其他', is_anonymous: true,
  reply: '', replied_at: null, created_at: '2026-02-01T00:00:00Z', version: 1,
};
const replied: FeedbackPublicDTO = {
  ...awaiting, id: 'linked-replied', title: '已回覆連結目標', reply: '已提供官方回應', created_at: '2026-01-01T00:00:00Z',
};
const page = (items: readonly FeedbackPublicDTO[]) => Response.json({ ok: true, data: { items, nextCursor: null } });
const tab = (label: string) => screen.getByRole('tab', { name: new RegExp(`^${label}`) });
const frames = new Map<number, FrameRequestCallback>();
let frameId = 0;
function paint() {
  const pending = Array.from(frames.values());
  frames.clear();
  for (const callback of pending) callback(0);
}

beforeEach(() => {
  const identity = { id: 'admin', email: 'admin@nehs.hc.edu.tw', displayName: '管理員', isAdmin: true };
  vi.mocked(useAuth).mockReturnValue({ status: 'verified', identity, user: identity, generation: 1, isAdmin: true, isLoggedIn: true });
  window.history.replaceState(null, '', '/feedback');
  frames.clear();
  frameId = 0;
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { frames.set(++frameId, callback); return frameId; });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => { frames.delete(id); });
  HTMLElement.prototype.scrollIntoView = vi.fn();
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

test.each([false, true])('renders and scrolls a replied hash outside the default awaiting tab (offPage=%s)', async offPage => {
  // Given a homepage-search fragment whose target does not match the admin's default queue.
  window.history.replaceState(null, '', '/feedback#item-linked-replied');
  const fetcher = vi.fn(async (input: string | URL | Request) => String(input).includes('/items?')
    ? Response.json({ ok: true, data: replied }) : page(offPage ? [awaiting] : [awaiting, replied]));
  vi.stubGlobal('fetch', fetcher);
  // When
  render(<FeedbackPage />);
  await screen.findByRole('tab', { name: offPage ? /全部.*1/ : /全部.*2/ });
  await screen.findByRole('heading', { name: replied.title });
  act(paint);
  // Then the target remains a single real row, and counts describe loaded pages, not the exception.
  const target = document.getElementById(`item-${replied.id}`);
  expect(target).toBeVisible();
  expect(document.querySelectorAll(`#item-${replied.id}`)).toHaveLength(1);
  expect(tab('待回覆')).toHaveAttribute('aria-selected', 'true');
  expect(within(tab('待回覆')).getByText('1')).toBeVisible();
  expect(within(tab('已回覆')).getByText(offPage ? '0' : '1')).toBeVisible();
  expect(HTMLElement.prototype.scrollIntoView).toHaveBeenLastCalledWith({ block: 'start' });
  expect(vi.mocked(HTMLElement.prototype.scrollIntoView).mock.instances.at(-1)).toBe(target);
  expect(screen.getByRole('tabpanel')).toHaveClass('[&>[id^=item-]]:scroll-mt-36', 'sm:[&>[id^=item-]]:scroll-mt-32');
  expect(fetcher.mock.calls.some(([input]) => String(input).includes('/admin/'))).toBe(false);
});

test('resolves an off-tab loaded row without an item read when the hash changes', async () => {
  // Given loaded pages with the replied row currently filtered out.
  const fetcher = vi.fn().mockResolvedValue(page([awaiting, replied]));
  vi.stubGlobal('fetch', fetcher);
  render(<FeedbackPage />);
  await screen.findByRole('tab', { name: /全部.*2/ });
  expect(screen.queryByRole('heading', { name: replied.title })).toBeNull();
  // When
  act(() => {
    window.history.replaceState(null, '', '/feedback#item-linked-replied');
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  });
  act(paint);
  // Then
  const target = document.getElementById(`item-${replied.id}`);
  expect(target).toBeVisible();
  expect(vi.mocked(HTMLElement.prototype.scrollIntoView).mock.instances.at(-1)).toBe(target);
  expect(fetcher).toHaveBeenCalledOnce();
  expect(tab('待回覆')).toHaveAttribute('aria-selected', 'true');
});

test('keeps the hash row and its draft without refetching when a different tab is selected', async () => {
  // Given a loaded awaiting hash target with an unsaved admin reply.
  window.history.replaceState(null, '', '/feedback#item-linked-awaiting');
  const fetcher = vi.fn(async (input: string | URL | Request) => String(input).includes('/items?')
    ? Response.json({ ok: true, data: awaiting }) : page([awaiting, replied]));
  vi.stubGlobal('fetch', fetcher);
  render(<FeedbackPage />);
  await screen.findByRole('tab', { name: /全部.*2/ });
  act(paint);
  fireEvent.change(screen.getByRole('textbox', { name: '回覆「待辦建言」' }), { target: { value: '尚未送出的草稿' } });
  const reads = fetcher.mock.calls.length;
  // When
  fireEvent.click(tab('已回覆'));
  // Then
  expect(tab('已回覆')).toHaveAttribute('aria-selected', 'true');
  expect(screen.getByRole('heading', { name: awaiting.title })).toBeVisible();
  expect(screen.getByRole('textbox', { name: '回覆「待辦建言」' })).toHaveValue('尚未送出的草稿');
  expect(fetcher).toHaveBeenCalledTimes(reads);
  expect(window.location.hash).toBe('#item-linked-awaiting');
  expect(vi.mocked(HTMLElement.prototype.scrollIntoView).mock.instances.at(-1)).toBe(document.getElementById(`item-${awaiting.id}`));
});

test.each([
  { label: '全部', empty: '目前尚無意見回饋。' },
  { label: '待回覆', empty: '都回完了' },
  { label: '已回覆', empty: '尚無官方回覆' },
])('keeps the linked-message behavior when search navigation and $label both have no rows', async ({ label, empty }) => {
  // Given a zero-result search link whose public target is no longer available.
  window.history.replaceState(null, '', '/feedback?q=找不到#item-linked-replied');
  const fetcher = vi.fn(async (input: string | URL | Request) => String(input).includes('/items?')
    ? Response.json({ ok: true, data: null }) : page([]));
  vi.stubGlobal('fetch', fetcher);
  render(<FeedbackPage />);
  await screen.findByRole('alert');
  await screen.findByText('都回完了');
  const reads = fetcher.mock.calls.length;
  // When
  fireEvent.click(tab(label));
  act(paint);
  // Then
  expect(screen.getByRole('alert')).toHaveTextContent('此項目未公開、已刪除或無法存取。');
  expect(screen.getByRole('button', { name: '重新載入連結項目' })).toBeVisible();
  expect(within(screen.getByRole('tabpanel')).getByText(empty)).toBeVisible();
  expect(document.getElementById(`item-${replied.id}`)).toBeNull();
  expect(HTMLElement.prototype.scrollIntoView).not.toHaveBeenCalled();
  expect(fetcher).toHaveBeenCalledTimes(reads);
});
