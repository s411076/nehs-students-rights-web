import { StrictMode } from 'react';
import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { useAuth } from '../../components/AuthProvider';
import { RightsDraftProvider, useFeedbackReplyDraft } from '../../components/rights/RightsDraftProvider';
import { RightsOperationFeedback } from '../../components/rights/RightsOperationFeedback';
import { useRightsMutation } from '../../components/rights/useRightsMutation';
import { useVersionedDraft } from '../../components/rights/useVersionedDraft';
import { adminAuth, deferredResponse, feedbackRow, installOperationFetch } from '../fixtures/operation-lifecycle';

vi.mock('../../components/AuthProvider', () => ({ useAuth: vi.fn() }));
const target = { key: 'reply:f1', label: 'Library reply' } as const;
const receipt = () => Response.json({ ok: true, data: { id: feedbackRow.id, version: 2 } });
const request = { action: 'saveFeedbackReply', payload: { id: feedbackRow.id, reply: 'Saved reply', expectedVersion: 1 } };

function DraftInput() {
  const draft = useVersionedDraft('', 1, useFeedbackReplyDraft(feedbackRow.id));
  return <input aria-label="Current draft" value={draft.value} onChange={event => draft.edit(event.target.value)} />;
}
function Probe({ acknowledge, name }: { readonly acknowledge: () => void; readonly name: string }) {
  const mutation = useRightsMutation(target);
  const draft = useVersionedDraft('', 1, useFeedbackReplyDraft(feedbackRow.id));
  return <button type="button" aria-busy={mutation.busy} onClick={() => {
    const saved = draft.value;
    void mutation.run({ ...request, payload: { ...request.payload, reply: saved, expectedVersion: draft.baseVersion } },
      undefined, data => { acknowledge(); draft.acknowledge(data, saved); });
  }}>{name}</button>;
}
function Harness({ visible, acknowledge }: { readonly visible: boolean; readonly acknowledge: () => void }) {
  return <StrictMode><RightsDraftProvider pageFeedback>
    <RightsOperationFeedback /><DraftInput />
    {visible && <><Probe name="Save first" acknowledge={acknowledge} /><Probe name="Save duplicate" acknowledge={acknowledge} /></>}
  </RightsDraftProvider></StrictMode>;
}

beforeEach(() => { vi.mocked(useAuth).mockReturnValue(adminAuth); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

test('acknowledges only the initiating flight and protects a newer draft snapshot across remount', async () => {
  // Given two consumers of one logical action and the same page-owned draft.
  const pending = deferredResponse();
  const network = installOperationFetch(() => pending.promise);
  const acknowledge = vi.fn();
  const view = render(<Harness visible acknowledge={acknowledge} />);
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Saved reply' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save first' }));
  fireEvent.click(screen.getByRole('button', { name: 'Save duplicate' }));
  view.rerender(<Harness visible={false} acknowledge={acknowledge} />);
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Newer unsaved draft' } });
  view.rerender(<Harness visible acknowledge={acknowledge} />);
  expect(screen.getByRole('button', { name: 'Save first' })).toHaveAttribute('aria-busy', 'true');
  fireEvent.click(screen.getByRole('button', { name: 'Save duplicate' }));
  // When the first receipt completes after a different draft snapshot was written.
  await act(async () => pending.resolve(receipt()));
  // Then duplicate consumers neither POST nor acknowledge again; the newer draft keeps its write base.
  expect(network.posts()).toHaveLength(1);
  expect(acknowledge).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('textbox')).toHaveValue('Newer unsaved draft');
  fireEvent.click(screen.getByRole('button', { name: 'Save first' }));
  expect(JSON.parse(String(network.posts()[1]?.[1]?.body)).payload).toMatchObject({ reply: 'Newer unsaved draft', expectedVersion: 1 });
  await act(async () => {});
});

test.each(['shared', 'standalone'] as const)('discards acknowledgement and refresh when the %s owner unmounts', async mode => {
  // Given a pending operation in either supported ownership mode.
  const pending = deferredResponse();
  installOperationFetch(() => pending.promise);
  const refresh = vi.fn();
  const acknowledge = vi.fn();
  const wrapper = mode === 'shared' ? RightsDraftProvider : undefined;
  const view = renderHook(() => useRightsMutation(target), { wrapper });
  let completion: ReturnType<typeof view.result.current.run> = Promise.resolve(null);
  act(() => { completion = view.result.current.run(request, refresh, acknowledge); });
  // When the owner, not merely its card, retires.
  view.unmount();
  await act(async () => { pending.resolve(receipt()); expect(await completion).toBeNull(); });
  // Then the old success applies nothing to detached or replacement consumers.
  expect(refresh).not.toHaveBeenCalled();
  expect(acknowledge).not.toHaveBeenCalled();
});

test.each(['identity', 'generation'] as const)('discards a shared receipt acknowledgement when %s changes', async change => {
  // Given a page-owned pending reply in the first identity scope.
  const pending = deferredResponse();
  installOperationFetch(() => pending.promise);
  const refresh = vi.fn();
  const acknowledge = vi.fn();
  const view = renderHook(() => useRightsMutation(target), { wrapper: RightsDraftProvider });
  let completion: ReturnType<typeof view.result.current.run> = Promise.resolve(null);
  act(() => { completion = view.result.current.run(request, refresh, acknowledge); });
  // When either account identity or generation changes before the receipt.
  const identity = { ...adminAuth.identity, id: change === 'identity' ? 'other-admin' : adminAuth.identity.id };
  vi.mocked(useAuth).mockReturnValue({ ...adminAuth, identity, user: identity, generation: change === 'generation' ? 2 : 1 });
  view.rerender();
  await act(async () => { pending.resolve(receipt()); expect(await completion).toBeNull(); });
  // Then acknowledgements, refreshes and operation state remain scoped to their live owner.
  expect(refresh).not.toHaveBeenCalled();
  expect(acknowledge).not.toHaveBeenCalled();
  expect(view.result.current.busy).toBe(false);
  expect(view.result.current.notice).toBe('');
});
