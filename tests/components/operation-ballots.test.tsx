import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import ProposalsPage from '../../app/proposals/page';
import { useAuth } from '../../components/AuthProvider';
import { adminAuth, deferredResponse, installOperationFetch, proposalRow } from '../fixtures/operation-lifecycle';

vi.mock('../../components/AuthProvider', () => ({ useAuth: vi.fn() }));
const tab = (name: string) => screen.getByRole('tab', { name: new RegExp(`^${name}`) });
const vote = () => screen.getByRole('button', { name: /覆議\/聯署|已聯署/ });
const success = (voted = true, count = 5) => Response.json({ ok: true, data: { id: proposalRow.id, voted, upvotes_count: count } });
const unavailable = () => Response.json({ ok: false, code: 'UNAVAILABLE' }, { status: 503 });
const publicBallot = (voted = true, count = 5) => Response.json({ ok: true, data: { ...proposalRow, viewer_voted: voted, upvotes_count: count } });

beforeEach(() => {
  vi.mocked(useAuth).mockReturnValue(adminAuth);
  window.history.replaceState(null, '', '/proposals');
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

test('retains one pending vote across tab remount and a newer receipt across stale list objects', async () => {
  // Given a delayed vote and list snapshots that still contain the old ballot.
  const pending = deferredResponse();
  const network = installOperationFetch(() => pending.promise, () => publicBallot());
  render(<ProposalsPage />);
  await screen.findByText(proposalRow.title);
  fireEvent.click(vote());
  // When the vote card unmounts and remounts before and after receipt.
  fireEvent.click(tab('已結案'));
  fireEvent.click(tab('全部'));
  await screen.findByText(proposalRow.title);
  expect(vote()).toBeDisabled();
  fireEvent.click(vote());
  fireEvent.click(tab('已結案'));
  await act(async () => pending.resolve(success()));
  fireEvent.click(tab('全部'));
  await screen.findByText(proposalRow.title);
  // Then no duplicate vote was sent and fresh DTO identity cannot erase the receipt.
  expect(vote()).toHaveAttribute('aria-pressed', 'true');
  expect(vote().querySelector('span')).toHaveTextContent('5');
  expect(vote()).toBeEnabled();
  expect(network.posts()).toHaveLength(1);
  expect(screen.getByRole('status', { name: '清單操作結果' })).toHaveTextContent(/Library proposal.*成功/);
});

test('updates a retained receipt from a fresh server read when returning to the tab', async () => {
  const readItem = vi.fn(() => publicBallot(true, 9));
  installOperationFetch(() => success(), readItem);
  render(<ProposalsPage />);
  await screen.findByText(proposalRow.title);
  fireEvent.click(vote());
  await waitFor(() => expect(vote()).toHaveAttribute('aria-pressed', 'true'));
  fireEvent.click(tab('已結案'));
  fireEvent.click(tab('全部'));
  await waitFor(() => expect(vote().querySelector('span')).toHaveTextContent('9'));
  expect(readItem).toHaveBeenCalledOnce();
});

test.each([true, false])('keeps the latest reconciliation after repeated tab remounts (older resolves first=%s)', async olderFirst => {
  const older = deferredResponse();
  const newer = deferredResponse();
  const readItem = vi.fn().mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise);
  const network = installOperationFetch(() => success(), readItem);
  render(<ProposalsPage />);
  await screen.findByText(proposalRow.title);
  fireEvent.click(vote());
  await waitFor(() => expect(vote()).toHaveAttribute('aria-pressed', 'true'));
  fireEvent.click(tab('已結案'));
  fireEvent.click(tab('全部'));
  await waitFor(() => expect(readItem).toHaveBeenCalledTimes(1));
  fireEvent.click(tab('已結案'));
  fireEvent.click(tab('全部'));
  await waitFor(() => expect(readItem).toHaveBeenCalledTimes(2));
  if (olderFirst) {
    await act(async () => older.resolve(publicBallot(true, 7)));
    await act(async () => newer.resolve(publicBallot(true, 9)));
  } else {
    await act(async () => newer.resolve(publicBallot(true, 9)));
    await act(async () => older.resolve(publicBallot(true, 7)));
  }
  expect(vote().querySelector('span')).toHaveTextContent('9');
  expect(vote()).toHaveAttribute('aria-pressed', 'true');
  expect(network.posts()).toHaveLength(1);
});

test('retains uncertainty across tabs and blocks mutation replay until a server read confirms it', async () => {
  // Given a lost receipt and unavailable reconciliation while the card is absent.
  const pending = deferredResponse();
  const recovery = deferredResponse();
  const readItem = vi.fn().mockResolvedValueOnce(unavailable()).mockReturnValueOnce(recovery.promise);
  const network = installOperationFetch(() => pending.promise, readItem);
  render(<ProposalsPage />);
  await screen.findByText(proposalRow.title);
  fireEvent.click(vote());
  fireEvent.click(tab('已結案'));
  await act(async () => pending.resolve(unavailable()));
  expect(screen.getByRole('status')).toHaveTextContent(/Library proposal.*無法確認/);
  // When returning to a stale list before the new reconciliation settles.
  fireEvent.click(tab('全部'));
  await screen.findByText(proposalRow.title);
  expect(vote()).toBeDisabled();
  expect(screen.getByRole('alert')).toHaveTextContent('無法確認是否已儲存');
  expect(screen.getByRole('button', { name: '更新連署狀態' })).toBeVisible();
  fireEvent.click(vote());
  await act(async () => recovery.resolve(publicBallot(true, 9)));
  // Then the authoritative read, not a replay, restores the ballot and exact total.
  expect(vote()).toHaveAttribute('aria-pressed', 'true');
  expect(vote().querySelector('span')).toHaveTextContent('9');
  expect(vote()).toBeEnabled();
  expect(network.posts()).toHaveLength(1);
  expect(readItem).toHaveBeenCalledTimes(2);
});

test('rejects an older reconciliation response after a newer confirmed cancellation', async () => {
  // Given two read attempts for an ambiguous vote; the latest confirms its commit.
  const firstRead = deferredResponse();
  const latestRead = deferredResponse();
  const readItem = vi.fn().mockReturnValueOnce(firstRead.promise).mockReturnValueOnce(latestRead.promise);
  let writes = 0;
  const network = installOperationFetch(() => ++writes === 1 ? unavailable() : success(false, 4), readItem);
  render(<ProposalsPage />);
  await screen.findByText(proposalRow.title);
  fireEvent.click(vote());
  fireEvent.click(await screen.findByRole('button', { name: '更新連署狀態' }));
  await act(async () => latestRead.resolve(publicBallot()));
  // When a user explicitly cancels before the older read arrives.
  fireEvent.click(vote());
  await waitFor(() => expect(vote()).toHaveAttribute('aria-pressed', 'false'));
  await act(async () => firstRead.resolve(publicBallot(true, 10)));
  // Then only the newer receipt determines the displayed ballot.
  expect(vote()).toHaveAttribute('aria-pressed', 'false');
  expect(vote().querySelector('span')).toHaveTextContent('4');
  expect(network.posts()).toHaveLength(2);
});

test('acknowledges a comment after its card disappears without reading inactive comments', async () => {
  // Given a comment submission in a row that is subsequently filtered out.
  const pending = deferredResponse();
  const network = installOperationFetch(() => pending.promise);
  render(<ProposalsPage />);
  const input = await screen.findByRole('textbox', { name: /新增留言/ });
  fireEvent.change(input, { target: { value: 'Submitted comment' } });
  fireEvent.click(screen.getByRole('button', { name: '送出留言' }));
  fireEvent.click(tab('已結案'));
  const commentReads = network.fetcher.mock.calls.filter(([url]) => String(url).includes('/comments')).length;
  // When a successful insert receipt arrives with no mounted comment list.
  await act(async () => pending.resolve(Response.json({ ok: true, data: { id: 'c1', inserted: true, version: 1 } })));
  // Then the page keeps the result and remount receives an acknowledged draft, without a hidden read.
  expect(screen.getByRole('status')).toHaveTextContent(/Library proposal.*成功/);
  expect(network.fetcher.mock.calls.filter(([url]) => String(url).includes('/comments'))).toHaveLength(commentReads);
  fireEvent.click(tab('全部'));
  expect(await screen.findByRole('textbox', { name: /新增留言/ })).toHaveValue('');
  expect(network.posts()).toHaveLength(1);
});

test('refreshes the currently remounted comment list instead of the old component callback', async () => {
  // Given a pending comment and a replacement card mounted before receipt.
  const pending = deferredResponse();
  const network = installOperationFetch(() => pending.promise);
  render(<ProposalsPage />);
  fireEvent.change(await screen.findByRole('textbox', { name: /新增留言/ }), { target: { value: 'Current comment' } });
  fireEvent.click(screen.getByRole('button', { name: '送出留言' }));
  fireEvent.click(tab('已結案'));
  fireEvent.click(tab('全部'));
  await screen.findByText(proposalRow.title);
  expect(screen.getByRole('button', { name: '送出留言' })).toBeDisabled();
  // When the server commits the comment after the new list's initial read.
  network.population.comments = [{ id: 'c1', proposal_id: proposalRow.id, content: 'Current comment',
    author_name: 'Student', created_at: '2026-01-01T00:00:00Z', version: 1 }];
  await act(async () => pending.resolve(Response.json({ ok: true, data: { id: 'c1', inserted: true, version: 1 } })));
  // Then the current list refreshes and the submitted draft clears exactly once.
  expect(await screen.findByText('Current comment')).toBeVisible();
  expect(screen.getByRole('textbox', { name: /新增留言/ })).toHaveValue('');
  expect(network.posts()).toHaveLength(1);
});
