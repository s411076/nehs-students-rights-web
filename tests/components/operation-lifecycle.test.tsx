import { StrictMode } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import FeedbackPage from '../../app/feedback/page';
import { useAuth } from '../../components/AuthProvider';
import { adminAuth, deferredResponse, feedbackRow, installOperationFetch } from '../fixtures/operation-lifecycle';

vi.mock('../../components/AuthProvider', () => ({ useAuth: vi.fn() }));
const tab = (name: string) => screen.getByRole('tab', { name: new RegExp(`^${name}`) });
const reply = () => screen.getByRole('textbox', { name: '回覆「Library hours」' });
const save = () => screen.getByRole('button', { name: /發布官方回覆|發布中/ });

beforeEach(() => {
  vi.mocked(useAuth).mockReturnValue(adminAuth);
  window.history.replaceState(null, '', '/feedback');
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

test('keeps default Awaiting success perceivable and recovers focus when its saved row leaves', async () => {
  // Given a focused reply action in the default admin queue, including StrictMode setup/cleanup.
  const network = installOperationFetch(() => {
    network.population.feedback = [{ ...feedbackRow, reply: 'Saved reply', version: 2 }];
    return Response.json({ ok: true, data: { id: feedbackRow.id, version: 2 } });
  });
  render(<StrictMode><FeedbackPage /></StrictMode>);
  await screen.findByText(feedbackRow.content);
  fireEvent.change(reply(), { target: { value: 'Saved reply' } });
  save().focus();
  // When the successful refresh removes the row from Awaiting.
  fireEvent.click(save());
  // Then the item-labelled result and focus survive without changing tabs.
  await screen.findByText('目前沒有待回覆建言');
  expect(tab('待回覆')).toHaveAttribute('aria-selected', 'true');
  expect(tab('待回覆')).toHaveTextContent('待回覆0');
  expect(tab('已回覆')).toHaveTextContent('已回覆1');
  expect(screen.queryByRole('textbox', { name: '回覆「Library hours」' })).toBeNull();
  expect(screen.getByRole('status')).toHaveTextContent(/Library hours.*成功/);
  expect(screen.getByRole('status')).toHaveFocus();
  expect(network.posts()).toHaveLength(1);
});

test('retains the pending lock through tab remount and does not steal focus from a clicked tab', async () => {
  // Given a reply flight that outlives its first card.
  const pending = deferredResponse();
  const network = installOperationFetch(() => pending.promise);
  render(<FeedbackPage />);
  await screen.findByText(feedbackRow.content);
  fireEvent.change(reply(), { target: { value: 'Saved reply' } });
  fireEvent.click(save());
  // When returning before the receipt, then leaving focus on another tab as it completes.
  fireEvent.click(tab('已回覆'));
  fireEvent.click(tab('待回覆'));
  await screen.findByText(feedbackRow.content);
  expect(save()).toBeDisabled();
  expect(reply()).toHaveValue('Saved reply');
  fireEvent.click(save());
  tab('已回覆').focus();
  fireEvent.click(tab('已回覆'));
  network.population.feedback = [{ ...feedbackRow, reply: 'Saved reply', version: 2 }];
  await act(async () => pending.resolve(Response.json({ ok: true, data: { id: feedbackRow.id, version: 2 } })));
  // Then only the original POST completes and current-filter reconciliation keeps tab focus.
  await screen.findByText('Saved reply');
  expect(network.posts()).toHaveLength(1);
  expect(screen.getByRole('status')).toHaveTextContent(/Library hours.*成功/);
  expect(tab('已回覆')).toHaveFocus();
});

test('retains a delayed conflict and the original draft base after leaving and returning', async () => {
  // Given a pending reply.
  const pending = deferredResponse();
  const network = installOperationFetch(() => pending.promise);
  render(<FeedbackPage />);
  await screen.findByText(feedbackRow.content);
  fireEvent.change(reply(), { target: { value: 'Retained draft' } });
  fireEvent.click(save());
  fireEvent.click(tab('已回覆'));
  // When the rejection arrives while the card is absent.
  await act(async () => pending.resolve(Response.json({ ok: false, code: 'CONFLICT' }, { status: 409 })));
  fireEvent.click(tab('待回覆'));
  // Then the actionable error and draft are still available, without another POST.
  expect(await screen.findByRole('alert')).toHaveTextContent(/草稿已保留/);
  expect(reply()).toHaveValue('Retained draft');
  expect(save()).toBeEnabled();
  expect(network.posts()).toHaveLength(1);
});

test('applies a delayed deletion to the current row and queue totals after tab remount', async () => {
  // Given a confirmed deletion whose response is delayed.
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  const pending = deferredResponse();
  const network = installOperationFetch(() => pending.promise);
  render(<FeedbackPage />);
  await screen.findByText(feedbackRow.content);
  fireEvent.click(screen.getByRole('button', { name: '刪除建言' }));
  fireEvent.click(tab('已回覆'));
  fireEvent.click(tab('待回覆'));
  await screen.findByText(feedbackRow.content);
  // When the old card's successful receipt arrives after the row remounts.
  network.population.feedback = [];
  await act(async () => pending.resolve(Response.json({ ok: true, data: { id: feedbackRow.id, deleted: true } })));
  // Then the current owner removes it and restores exact counts.
  await screen.findByText('目前沒有待回覆建言');
  expect(screen.queryByText(feedbackRow.content)).toBeNull();
  expect(tab('全部')).toHaveTextContent('全部0');
  expect(screen.getByRole('status')).toHaveTextContent(/Library hours.*成功/);
});

test.each(['signout', 'identity', 'generation'] as const)('discards all delayed operation effects after %s invalidates the owner', async change => {
  // Given an outstanding deletion in one identity generation.
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  const pending = deferredResponse();
  const network = installOperationFetch(() => pending.promise);
  const view = render(<FeedbackPage />);
  await screen.findByText(feedbackRow.content);
  fireEvent.click(screen.getByRole('button', { name: '刪除建言' }));
  // When the owning identity retires before receipt.
  switch (change) {
    case 'signout': vi.mocked(useAuth).mockReturnValue({ status: 'anonymous', identity: null, user: null,
      generation: 2, isLoggedIn: false, isAdmin: false }); break;
    case 'identity': {
      const identity = { ...adminAuth.identity, id: 'other-admin', email: 'other@nehs.hc.edu.tw', displayName: 'Other', isAdmin: true };
      vi.mocked(useAuth).mockReturnValue({ ...adminAuth, identity, user: identity }); break;
    }
    case 'generation': vi.mocked(useAuth).mockReturnValue({ ...adminAuth, generation: 2 }); break;
    default: throw new TypeError(`Unexpected change: ${change satisfies never}`);
  }
  view.rerender(<FeedbackPage />);
  await screen.findByText(feedbackRow.content);
  const reads = network.fetcher.mock.calls.length;
  await act(async () => pending.resolve(Response.json({ ok: true, data: { id: feedbackRow.id, deleted: true } })));
  // Then no old removal, refresh, announcement or focus effect reaches the new scope.
  await waitFor(() => expect(screen.getByText(feedbackRow.content)).toBeVisible());
  expect(network.fetcher.mock.calls).toHaveLength(reads);
  expect(screen.queryByRole('status')).toBeNull();
});
