import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import ProposalsPage from '../../app/proposals/page';
import { PendingProposal } from '../../app/proposals/PendingProposal';
import { useAuth } from '../../components/AuthProvider';
import { RightsDraftProvider } from '../../components/rights/RightsDraftProvider';
import { RightsOperationFeedback } from '../../components/rights/RightsOperationFeedback';
import { adminAuth, deferredResponse, installOperationFetch, proposalRow } from '../fixtures/operation-lifecycle';

vi.mock('../../components/AuthProvider', () => ({ useAuth: vi.fn() }));
const tab = (name: string) => screen.getByRole('tab', { name: new RegExp(`^${name}`) });
const pendingItem = { ...proposalRow, status: '待審核' };

function ReviewHarness({ visible, refresh }: { readonly visible: boolean; readonly refresh: () => Promise<unknown> }) {
  return <RightsDraftProvider pageFeedback><RightsOperationFeedback />
    {visible && <PendingProposal item={pendingItem} refresh={refresh} />}
  </RightsDraftProvider>;
}

beforeEach(() => {
  vi.mocked(useAuth).mockReturnValue(adminAuth);
  window.history.replaceState(null, '', '/proposals');
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

test('reconciles a control save against the current tab after the initiating row disappears', async () => {
  // Given a control draft submitted from Processing.
  const pending = deferredResponse();
  const network = installOperationFetch(() => pending.promise);
  render(<ProposalsPage />);
  fireEvent.click(tab('處理中'));
  fireEvent.change(await screen.findByRole('textbox', { name: /官方回覆/ }), { target: { value: 'Saved decision' } });
  fireEvent.change(screen.getByRole('combobox', { name: /提案狀態/ }), { target: { value: '已結案' } });
  fireEvent.click(screen.getByRole('button', { name: '儲存修改' }));
  // When Closed is selected before the receipt and its current queue must be refreshed.
  fireEvent.click(tab('已結案'));
  network.population.proposals = [{ ...proposalRow, status: '已結案', reply: 'Saved decision', version: 2 }];
  await act(async () => pending.resolve(Response.json({ ok: true, data: { id: proposalRow.id, version: 2 } })));
  // Then the late save updates the active queue, its counts and the retained draft.
  expect(await screen.findByText('Saved decision')).toBeVisible();
  expect(tab('已結案')).toHaveAttribute('aria-selected', 'true');
  expect(tab('已結案')).toHaveTextContent('已結案1');
  expect(tab('處理中')).toHaveTextContent('處理中0');
  expect(screen.getByRole('textbox', { name: /官方回覆/ })).toHaveValue('Saved decision');
  expect(screen.getByRole('status', { name: '清單操作結果' })).toHaveTextContent(/Library proposal.*成功/);
  expect(network.posts()).toHaveLength(1);
});

test('removes the remounted proposal and reconciles counts when a delayed delete succeeds', async () => {
  // Given a deletion started in All and a replacement row mounted in Processing.
  const pending = deferredResponse();
  const network = installOperationFetch(() => pending.promise);
  render(<ProposalsPage />);
  await screen.findByText(proposalRow.title);
  fireEvent.click(screen.getByRole('button', { name: '刪除' }));
  fireEvent.click(tab('處理中'));
  await screen.findByText(proposalRow.title);
  // When the old initiating card receives its successful deletion receipt.
  network.population.proposals = [];
  await act(async () => pending.resolve(Response.json({ ok: true, data: { id: proposalRow.id, deleted: true } })));
  // Then the current row is removed without awaiting another tab change.
  expect(await screen.findByText('目前尚無處理中的提案。')).toBeVisible();
  expect(screen.queryByText(proposalRow.title)).toBeNull();
  expect(tab('全部')).toHaveTextContent('全部0');
  expect(tab('處理中')).toHaveTextContent('處理中0');
  expect(network.posts()).toHaveLength(1);
});

test.each(['核准上架', '退回提案'])('shares the review flight across approve/reject after remount when %s starts it', async label => {
  // Given one pending review whose card is temporarily absent.
  const pending = deferredResponse();
  const network = installOperationFetch(() => pending.promise);
  const refresh = vi.fn().mockResolvedValue({ ok: true });
  const view = render(<ReviewHarness visible refresh={refresh} />);
  fireEvent.click(screen.getByRole('button', { name: label }));
  view.rerender(<ReviewHarness visible={false} refresh={refresh} />);
  // When it remounts before either review action has completed.
  view.rerender(<ReviewHarness visible refresh={refresh} />);
  expect(screen.getByRole('button', { name: '核准上架' })).toBeDisabled();
  expect(screen.getByRole('button', { name: '退回提案' })).toBeDisabled();
  expect(screen.getByRole('button', { name: /^待審核/ })).toHaveAttribute('aria-expanded', 'true');
  fireEvent.click(screen.getByRole('button', { name: label === '核准上架' ? '退回提案' : '核准上架' }));
  await act(async () => pending.resolve(Response.json({ ok: false, code: 'CONFLICT' }, { status: 409 })));
  // Then only one review POST was sent and useful conflict detail survives the remount.
  expect(network.posts()).toHaveLength(1);
  expect(screen.getByRole('alert')).toHaveTextContent('草稿已保留');
  expect(screen.getByRole('button', { name: '重新載入最新資料' })).toBeVisible();
  expect(refresh).not.toHaveBeenCalled();
});
