import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import ProposalsPage from '../../app/proposals/page';
import { useAuth } from '../../components/AuthProvider';
import type { AuthContextValue } from '../../components/AuthProvider';
import type { ProposalDTO } from '../../lib/rights/queries';
import { pendingQueuePage, proposalQueuePage } from '../fixtures/queue-pages';

vi.mock('../../components/AuthProvider', () => ({ useAuth: vi.fn() }));

const anonymous: AuthContextValue = {
  status: 'anonymous', identity: null, user: null, generation: 0, isAdmin: false, isLoggedIn: false,
};
function member(isAdmin: boolean): AuthContextValue {
  const identity = { id: isAdmin ? 'admin' : 'student', email: 'fixture@nehs.hc.edu.tw', displayName: '學生', isAdmin };
  return { status: 'verified', identity, user: identity, generation: 1, isAdmin, isLoggedIn: true };
}
const base = { content: '公開提案內容', author_name: '學生', reply: '', version: 1,
  viewer_voted: false, upvotes_count: 0, legacy_upvotes_count: 0 } as const;
const rows: readonly ProposalDTO[] = [
  { ...base, id: 'processing-new', title: '最新處理中提案', status: '處理中', created_at: '2026-02-06T00:00:00Z' },
  { ...base, id: 'closed-new', title: '最新已結案提案', status: '已結案', created_at: '2026-02-05T00:00:00Z' },
  { ...base, id: 'processing-mid', title: '處理中提案', status: '處理中', created_at: '2026-02-04T00:00:00Z' },
  { ...base, id: 'closed-mid', title: '已結案提案', status: '已結案', created_at: '2026-02-03T00:00:00Z' },
  { ...base, id: 'closed-old', title: '較舊已結案提案', status: '已結案', created_at: '2026-02-02T00:00:00Z' },
  { ...base, id: 'processing-old', title: '較舊處理中提案', status: '處理中', created_at: '2026-02-01T00:00:00Z' },
];
const page = (items: readonly ProposalDTO[], path?: string) => Response.json({ ok: true, data: proposalQueuePage(items, path) });
const tab = (label: string) => screen.getByRole('tab', { name: new RegExp(`^${label}`) });
const titles = () => within(screen.getByRole('tabpanel')).queryAllByRole('heading', { level: 3 }).map(node => node.textContent);
function list(items = rows) {
  const publicRead = vi.fn(async (input: string | URL | Request) => page(items, String(input)));
  vi.stubGlobal('fetch', vi.fn((input: string | URL | Request) => {
    const url = new URL(String(input), 'http://localhost');
    if (url.pathname.endsWith('/comments')) return Response.json({ ok: true, data: { items: [], nextCursor: null } });
    return url.searchParams.get('kind') === 'pending'
      ? Response.json({ ok: true, data: pendingQueuePage([], String(input)) }) : publicRead(input);
  }));
  return publicRead;
}

beforeEach(() => {
  vi.mocked(useAuth).mockReturnValue(anonymous);
  window.history.replaceState(null, '', '/proposals');
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

test.each([
  { role: 'anonymous', auth: anonymous }, { role: 'student', auth: member(false) }, { role: 'admin', auth: member(true) },
])('defaults to all when the reader is $role', async ({ auth }) => {
  // Given
  vi.mocked(useAuth).mockReturnValue(auth);
  list();
  // When
  render(<ProposalsPage />);
  await screen.findByRole('tab', { name: /全部.*6/ });
  // Then
  expect(tab('全部')).toHaveAttribute('aria-selected', 'true');
  expect(tab('全部')).toHaveAttribute('tabindex', '0');
  expect(screen.getAllByRole('tab', { selected: true })).toHaveLength(1);
  expect(screen.getByRole('tabpanel')).toHaveAttribute('aria-labelledby', tab('全部').id);
  expect(screen.getAllByRole('tab').map(node => node.textContent)).toEqual(['全部6', '處理中3', '已結案3']);
});

test.each([
  { label: '全部', expected: ['最新處理中提案', '最新已結案提案', '處理中提案', '已結案提案', '較舊已結案提案', '較舊處理中提案'] },
  { label: '處理中', expected: ['最新處理中提案', '處理中提案', '較舊處理中提案'] },
  { label: '已結案', expected: ['最新已結案提案', '已結案提案', '較舊已結案提案'] },
])('fetches $label in globally newest-first server order when selected', async ({ label, expected }) => {
  // Given loaded public statuses, plus private states that must stay excluded.
  const publicRead = list([...rows,
    { ...base, id: 'pending', title: '未公開待審核', status: '待審核', created_at: '2026-02-07T00:00:00Z' },
    { ...base, id: 'rejected', title: '未公開退回', status: '被退回', created_at: '2026-02-08T00:00:00Z' },
  ]);
  render(<ProposalsPage />);
  await screen.findByRole('tab', { name: /全部.*6/ });
  // When
  fireEvent.click(tab(label));
  // Then
  await waitFor(() => expect(titles()).toEqual(expected));
  expect(publicRead).toHaveBeenCalledTimes(label === '全部' ? 1 : 2);
  expect(within(tab('全部')).getByText('6')).toBeVisible();
  expect(screen.queryByText('未公開待審核')).toBeNull();
  expect(screen.queryByText('未公開退回')).toBeNull();
});

test.each([
  { from: '全部', key: 'ArrowRight', to: '處理中' },
  { from: '處理中', key: 'ArrowRight', to: '已結案' },
  { from: '已結案', key: 'ArrowRight', to: '全部' },
  { from: '全部', key: 'ArrowLeft', to: '已結案' },
  { from: '已結案', key: 'ArrowLeft', to: '處理中' },
  { from: '全部', key: 'End', to: '已結案' },
  { from: '已結案', key: 'Home', to: '全部' },
])('selects and focuses $to when $key is pressed on $from', async ({ from, key, to }) => {
  // Given
  const publicRead = list();
  render(<ProposalsPage />);
  await screen.findByRole('tab', { name: /全部.*6/ });
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
  expect(screen.getByRole('tablist')).toHaveClass('sticky', 'top-16', 'z-20', 'bg-background', 'border-b');
  await waitFor(() => expect(publicRead).toHaveBeenCalledTimes(from === '全部' ? 2 : 3));
});

test('replaces skeleton counts in stable slots when the first page arrives', async () => {
  // Given
  let finish: (response: Response) => void = () => { throw new TypeError('Missing first page'); };
  vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(resolve => { finish = resolve; })));
  render(<ProposalsPage />);
  const slots = screen.getAllByRole('tab').map(button => button.querySelector('span[aria-hidden]'));
  for (const button of screen.getAllByRole('tab')) expect(button).toHaveAttribute('aria-busy', 'true');
  for (const slot of slots) {
    expect(slot).toHaveClass('w-11', 'h-4');
    expect(slot).toHaveAttribute('aria-hidden', 'true');
    expect(slot).toHaveTextContent('');
  }
  // When
  await act(async () => finish(page([])));
  // Then
  for (const button of screen.getAllByRole('tab')) expect(button).toHaveAttribute('aria-busy', 'false');
  for (const slot of slots) {
    expect(slot).toHaveClass('w-11', 'h-4');
    expect(slot).toHaveTextContent('0');
  }
});

test.each([
  { label: '全部', message: '目前尚無公開提案。' },
  { label: '處理中', message: '目前尚無處理中的提案。' },
  { label: '已結案', message: '目前尚無已結案的提案。' },
])('shows the $label empty state when the server filter total is zero', async ({ label, message }) => {
  // Given
  list([]);
  render(<ProposalsPage />);
  await screen.findByText('目前尚無公開提案。');
  // When
  fireEvent.click(tab(label));
  // Then
  expect(await within(screen.getByRole('tabpanel')).findByText(message)).toBeVisible();
  expect(titles()).toEqual([]);
});

test('loads one closed batch at a time while retaining exact population counts', async () => {
  // Given
  const population: readonly ProposalDTO[] = Array.from({ length: 45 }, (_, index) => ({ ...base, status: '已結案',
    id: `closed-${index}`, title: `結案提案 ${index}`, created_at: new Date(Date.UTC(2026, 0, index + 1)).toISOString() }));
  const publicRead = list(population);
  render(<ProposalsPage />);
  await screen.findByRole('tab', { name: /全部.*45/ });
  fireEvent.click(tab('已結案'));
  await screen.findByText('已載入 20／45 筆');
  const cursor = proposalQueuePage(population, '/api/rights/queue?kind=proposal&filter=closed').nextCursor;
  // When
  fireEvent.click(screen.getByRole('button', { name: '載入更多公開提案' }));
  // Then
  await screen.findByText('已載入 40／45 筆');
  expect(titles()).toEqual([...population].reverse().slice(0, 40).map(item => item.title));
  expect(tab('已結案')).toHaveAttribute('aria-selected', 'true');
  expect(within(tab('全部')).getByText('45')).toBeVisible();
  expect(within(tab('已結案')).getByText('45')).toBeVisible();
  expect(publicRead).toHaveBeenCalledTimes(3);
  const request = new URL(String(publicRead.mock.calls[2]?.[0]), 'http://localhost');
  expect(JSON.parse(request.searchParams.get('cursor') ?? 'null')).toEqual(cursor);
  expect(request.searchParams.get('filter')).toBe('closed');
  expect(screen.getByRole('button', { name: '載入更多公開提案' })).toBeEnabled();
});
