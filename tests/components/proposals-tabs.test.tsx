import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import ProposalsPage from '../../app/proposals/page';
import { useAuth } from '../../components/AuthProvider';
import type { AuthContextValue } from '../../components/AuthProvider';
import type { ProposalDTO } from '../../lib/rights/queries';
import type { PageCursor } from '../../lib/rights/pagination';

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
  { ...base, id: 'discuss-new', title: '最新研議提案', status: '研議中', created_at: '2026-02-06T00:00:00Z' },
  { ...base, id: 'declined-new', title: '最新不採納提案', status: '不採納', created_at: '2026-02-05T00:00:00Z' },
  { ...base, id: 'passed', title: '通過提案', status: '通過', created_at: '2026-02-04T00:00:00Z' },
  { ...base, id: 'adopted', title: '已採納提案', status: '已採納', created_at: '2026-02-03T00:00:00Z' },
  { ...base, id: 'declined-old', title: '較舊不採納提案', status: '不採納', created_at: '2026-02-02T00:00:00Z' },
  { ...base, id: 'discuss-old', title: '較舊研議提案', status: '研議中', created_at: '2026-02-01T00:00:00Z' },
];
const page = (items: readonly ProposalDTO[], nextCursor: PageCursor | null = null) =>
  Response.json({ ok: true, data: { items, nextCursor } });
const tab = (label: string) => screen.getByRole('tab', { name: new RegExp(`^${label}`) });
const titles = () => within(screen.getByRole('tabpanel')).queryAllByRole('heading', { level: 3 }).map(node => node.textContent);
function list(items = rows) {
  const publicRead = vi.fn().mockResolvedValue(page(items));
  vi.stubGlobal('fetch', vi.fn((input: string | URL | Request) =>
    new URL(String(input), 'http://localhost').pathname === '/api/rights/proposals' ? publicRead(input) : page([])));
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
  expect(screen.getAllByRole('tab').map(node => node.textContent)).toEqual(['全部6', '研議中2', '通過1', '已採納1', '不採納2']);
});

test.each([
  { label: '全部', expected: ['最新研議提案', '最新不採納提案', '通過提案', '已採納提案', '較舊不採納提案', '較舊研議提案'] },
  { label: '研議中', expected: ['最新研議提案', '較舊研議提案'] },
  { label: '通過', expected: ['通過提案'] },
  { label: '已採納', expected: ['已採納提案'] },
  { label: '不採納', expected: ['最新不採納提案', '較舊不採納提案'] },
])('filters $label in newest-first order without a list refetch when selected', async ({ label, expected }) => {
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
  expect(titles()).toEqual(expected);
  expect(publicRead).toHaveBeenCalledOnce();
  expect(within(tab('全部')).getByText('6')).toBeVisible();
  expect(screen.queryByText('未公開待審核')).toBeNull();
  expect(screen.queryByText('未公開退回')).toBeNull();
});

test.each([
  { from: '全部', key: 'ArrowRight', to: '研議中' },
  { from: '研議中', key: 'ArrowRight', to: '通過' },
  { from: '通過', key: 'ArrowRight', to: '已採納' },
  { from: '已採納', key: 'ArrowRight', to: '不採納' },
  { from: '不採納', key: 'ArrowRight', to: '全部' },
  { from: '全部', key: 'ArrowLeft', to: '不採納' },
  { from: '通過', key: 'ArrowLeft', to: '研議中' },
  { from: '全部', key: 'End', to: '不採納' },
  { from: '不採納', key: 'Home', to: '全部' },
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
  expect(publicRead).toHaveBeenCalledOnce();
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
  { label: '研議中', message: '目前尚無研議中的提案。' },
  { label: '通過', message: '目前尚無通過的提案。' },
  { label: '已採納', message: '目前尚無已採納的提案。' },
  { label: '不採納', message: '目前尚無不採納的提案。' },
])('shows the $label empty state when its loaded filter has no rows', async ({ label, message }) => {
  // Given
  list([]);
  render(<ProposalsPage />);
  await screen.findByText('目前尚無公開提案。');
  // When
  fireEvent.click(tab(label));
  // Then
  expect(within(screen.getByRole('tabpanel')).getByText(message)).toBeVisible();
  expect(titles()).toEqual([]);
});

test('continues an empty active filter and updates loaded counts when the next page arrives', async () => {
  // Given a first page without any passed proposal.
  const cursor = { created_at: '2026-02-05T00:00:00Z', id: 'declined-new' };
  const publicRead = list();
  publicRead.mockReset().mockResolvedValueOnce(page(rows.slice(0, 2), cursor)).mockResolvedValueOnce(page(rows.slice(2)));
  render(<ProposalsPage />);
  await screen.findByRole('tab', { name: /全部.*2/ });
  fireEvent.click(tab('通過'));
  expect(screen.getByText('目前尚無通過的提案。')).toBeVisible();
  // When
  fireEvent.click(screen.getByRole('button', { name: '載入更多公開提案' }));
  // Then
  await screen.findByRole('heading', { name: '通過提案' });
  expect(titles()).toEqual(['通過提案']);
  expect(tab('通過')).toHaveAttribute('aria-selected', 'true');
  expect(within(tab('全部')).getByText('6')).toBeVisible();
  expect(within(tab('通過')).getByText('1')).toBeVisible();
  expect(publicRead).toHaveBeenCalledTimes(2);
  const request = new URL(String(publicRead.mock.calls[1]?.[0]), 'http://localhost');
  expect(JSON.parse(request.searchParams.get('cursor') ?? 'null')).toEqual(cursor);
  expect(screen.queryByRole('button', { name: '載入更多公開提案' })).toBeNull();
});
