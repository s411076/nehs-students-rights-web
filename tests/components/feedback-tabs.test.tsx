import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import FeedbackPage from '../../app/feedback/page';
import { useAuth } from '../../components/AuthProvider';
import type { AuthContextValue } from '../../components/AuthProvider';
import type { FeedbackPublicDTO } from '../../lib/rights/queries';
import type { PageCursor } from '../../lib/rights/pagination';

vi.mock('../../components/AuthProvider', () => ({ useAuth: vi.fn() }));

const anonymous: AuthContextValue = {
  status: 'anonymous', identity: null, user: null, generation: 0, isAdmin: false, isLoggedIn: false,
};
function member(isAdmin: boolean): AuthContextValue {
  const identity = { id: isAdmin ? 'admin' : 'student', email: 'fixture@nehs.hc.edu.tw', displayName: '學生', isAdmin };
  return { status: 'verified', identity, user: identity, generation: 1, isAdmin, isLoggedIn: true };
}
const base = { content: '公開建言內容', category: '其他', is_anonymous: true, replied_at: null, version: 1 } as const;
const rows: readonly FeedbackPublicDTO[] = [
  { ...base, id: 'new-replied', title: '最新已回覆建言', reply: '官方回覆', created_at: '2026-02-03T00:00:00Z' },
  { ...base, id: 'new-awaiting', title: '較新待回覆建言', reply: '', created_at: '2026-02-02T00:00:00Z' },
  { ...base, id: 'old-replied', title: '較舊已回覆建言', reply: '   ', created_at: '2026-02-01T00:00:00Z' },
  { ...base, id: 'old-awaiting', title: '最舊待回覆建言', reply: '', created_at: '2026-01-31T00:00:00Z' },
];
const page = (items: readonly FeedbackPublicDTO[], nextCursor: PageCursor | null = null) =>
  Response.json({ ok: true, data: { items, nextCursor } });
const tab = (label: string) => screen.getByRole('tab', { name: new RegExp(`^${label}`) });
const titles = () => within(screen.getByRole('tabpanel')).queryAllByRole('heading', { level: 3 }).map(node => node.textContent);
function list(items = rows) {
  const fetcher = vi.fn().mockResolvedValue(page(items));
  vi.stubGlobal('fetch', fetcher);
  return fetcher;
}

beforeEach(() => {
  vi.mocked(useAuth).mockReturnValue(anonymous);
  window.history.replaceState(null, '', '/feedback');
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

test.each([
  { role: 'anonymous', auth: anonymous, selected: '全部' },
  { role: 'student', auth: member(false), selected: '全部' },
  { role: 'admin', auth: member(true), selected: '待回覆' },
])('defaults to $selected when the reader is $role', async ({ auth, selected }) => {
  // Given
  vi.mocked(useAuth).mockReturnValue(auth);
  list();
  // When
  render(<FeedbackPage />);
  await screen.findByRole('tab', { name: /全部.*4/ });
  // Then
  expect(tab(selected)).toHaveAttribute('aria-selected', 'true');
  expect(tab(selected)).toHaveAttribute('tabindex', '0');
  expect(screen.getAllByRole('tab', { selected: true })).toHaveLength(1);
  expect(screen.getByRole('tabpanel')).toHaveAttribute('aria-labelledby', tab(selected).id);
});

test.each([
  { label: '全部', expected: ['最新已回覆建言', '較新待回覆建言', '較舊已回覆建言', '最舊待回覆建言'] },
  { label: '待回覆', expected: ['最舊待回覆建言', '較新待回覆建言'] },
  { label: '已回覆', expected: ['最新已回覆建言', '較舊已回覆建言'] },
])('filters $label with the required order and no refetch when selected', async ({ label, expected }) => {
  // Given empty replies, nonempty replies, and a whitespace-only nonempty reply in newest-first pages.
  const fetcher = list();
  render(<FeedbackPage />);
  await screen.findByRole('tab', { name: /全部.*4/ });
  // When
  fireEvent.click(tab(label));
  // Then
  expect(titles()).toEqual(expected);
  expect(fetcher).toHaveBeenCalledOnce();
  expect(within(tab('全部')).getByText('4')).toBeVisible();
  expect(within(tab('待回覆')).getByText('2')).toBeVisible();
  expect(within(tab('已回覆')).getByText('2')).toBeVisible();
});

test.each([
  { from: '全部', key: 'ArrowRight', to: '待回覆' },
  { from: '待回覆', key: 'ArrowRight', to: '已回覆' },
  { from: '已回覆', key: 'ArrowRight', to: '全部' },
  { from: '全部', key: 'ArrowLeft', to: '已回覆' },
  { from: '已回覆', key: 'ArrowLeft', to: '待回覆' },
  { from: '待回覆', key: 'ArrowLeft', to: '全部' },
  { from: '全部', key: 'End', to: '已回覆' },
  { from: '已回覆', key: 'Home', to: '全部' },
])('selects and focuses $to when $key is pressed on $from', async ({ from, key, to }) => {
  // Given
  const fetcher = list();
  render(<FeedbackPage />);
  await screen.findByRole('tab', { name: /全部.*4/ });
  fireEvent.click(tab(from));
  tab(from).focus();
  // When
  fireEvent.keyDown(tab(from), { key });
  // Then
  expect(tab(to)).toHaveFocus();
  expect(tab(to)).toHaveAttribute('aria-selected', 'true');
  expect(tab(to)).toHaveAttribute('tabindex', '0');
  expect(tab(from)).toHaveAttribute('tabindex', '-1');
  expect(screen.getByRole('tabpanel')).toHaveAttribute('id', tab(to).getAttribute('aria-controls'));
  expect(screen.getByRole('tablist')).toHaveClass('sticky', 'top-16', 'bg-background', 'border-b');
  expect(fetcher).toHaveBeenCalledOnce();
});

test('replaces skeletons without changing count-slot geometry when the first page arrives', async () => {
  // Given
  let finish: (response: Response) => void = () => { throw new TypeError('Missing first page'); };
  vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(resolve => { finish = resolve; })));
  render(<FeedbackPage />);
  const countSlots = screen.getAllByRole('tab').map(button => button.querySelector('span[aria-hidden]'));
  expect(screen.getAllByRole('tab').every(button => button.getAttribute('aria-busy') === 'true')).toBe(true);
  for (const slot of countSlots) {
    expect(slot).toHaveClass('w-11', 'h-4');
    expect(slot).toHaveAttribute('aria-hidden', 'true');
    expect(slot).toHaveTextContent('');
  }
  // When
  await act(async () => finish(page(rows)));
  // Then
  expect(screen.getAllByRole('tab').every(button => button.getAttribute('aria-busy') === 'false')).toBe(true);
  expect(countSlots.map(slot => slot?.textContent)).toEqual(['4', '2', '2']);
  for (const slot of countSlots) expect(slot).toHaveClass('w-11', 'h-4');
});

test.each([
  { label: '全部', message: '目前尚無意見回饋。' },
  { label: '待回覆', message: '都回完了' },
  { label: '已回覆', message: '尚無官方回覆' },
])('shows the $label empty state when its loaded queue is empty', async ({ label, message }) => {
  // Given
  list([]);
  render(<FeedbackPage />);
  await screen.findByText('目前尚無意見回饋。');
  // When
  fireEvent.click(tab(label));
  // Then
  expect(within(screen.getByRole('tabpanel')).getByText(message)).toBeVisible();
  expect(titles()).toEqual([]);
});

test('switches and focuses replied when the all-done action is activated', async () => {
  // Given
  vi.mocked(useAuth).mockReturnValue(member(true));
  const fetcher = list(rows.filter(item => item.reply !== ''));
  render(<FeedbackPage />);
  await screen.findByText('都回完了');
  // When
  fireEvent.click(screen.getByRole('button', { name: '查看已回覆' }));
  // Then
  expect(tab('已回覆')).toHaveAttribute('aria-selected', 'true');
  expect(tab('已回覆')).toHaveFocus();
  expect(titles()).toEqual(['最新已回覆建言', '較舊已回覆建言']);
  expect(fetcher).toHaveBeenCalledOnce();
});

test('keeps pagination in the active filter and updates loaded counts when more items arrive', async () => {
  // Given
  vi.mocked(useAuth).mockReturnValue(member(true));
  const cursor = { created_at: '2026-02-02T00:00:00Z', id: 'new-awaiting' };
  const fetcher = vi.fn().mockResolvedValueOnce(page(rows.slice(0, 2), cursor)).mockResolvedValueOnce(page(rows.slice(2)));
  vi.stubGlobal('fetch', fetcher);
  render(<FeedbackPage />);
  await screen.findByRole('heading', { name: '較新待回覆建言' });
  // When
  fireEvent.click(screen.getByRole('button', { name: '載入更多建言' }));
  // Then
  await screen.findByRole('heading', { name: '最舊待回覆建言' });
  expect(titles()).toEqual(['最舊待回覆建言', '較新待回覆建言']);
  expect(tab('待回覆')).toHaveAttribute('aria-selected', 'true');
  expect(within(tab('全部')).getByText('4')).toBeVisible();
  expect(within(tab('待回覆')).getByText('2')).toBeVisible();
  expect(within(tab('已回覆')).getByText('2')).toBeVisible();
  expect(fetcher).toHaveBeenCalledTimes(2);
  const request = new URL(String(fetcher.mock.calls[1]?.[0]), 'http://localhost');
  expect(JSON.parse(request.searchParams.get('cursor') ?? 'null')).toEqual(cursor);
  expect(screen.queryByRole('button', { name: '載入更多建言' })).toBeNull();
});

test.each([false, true])('keeps management controls admin-only when isAdmin=%s across tabs', async isAdmin => {
  // Given
  vi.mocked(useAuth).mockReturnValue(member(isAdmin));
  list();
  render(<FeedbackPage />);
  await screen.findByRole('tab', { name: /全部.*4/ });
  // When
  fireEvent.click(tab('已回覆'));
  // Then
  expect(screen.queryAllByRole('button', { name: '刪除建言' })).toHaveLength(isAdmin ? 2 : 0);
  expect(screen.queryAllByRole('button', { name: '發布官方回覆' })).toHaveLength(isAdmin ? 2 : 0);
  expect(screen.queryAllByRole('button', { name: '查看作者（僅管理員）' })).toHaveLength(isAdmin ? 2 : 0);
});

test('can load an awaiting item when the first loaded page contains only replies', async () => {
  // Given
  vi.mocked(useAuth).mockReturnValue(member(true));
  const cursor = { created_at: '2026-02-03T00:00:00Z', id: 'new-replied' };
  const fetcher = vi.fn().mockResolvedValueOnce(page(rows.slice(0, 1), cursor)).mockResolvedValueOnce(page(rows.slice(1)));
  vi.stubGlobal('fetch', fetcher);
  render(<FeedbackPage />);
  await screen.findByText('都回完了');
  // When
  fireEvent.click(screen.getByRole('button', { name: '載入更多建言' }));
  // Then
  await screen.findByRole('heading', { name: '最舊待回覆建言' });
  expect(titles()).toEqual(['最舊待回覆建言', '較新待回覆建言']);
  expect(screen.queryByText('都回完了')).toBeNull();
  expect(fetcher).toHaveBeenCalledTimes(2);
});
