import type { ReactNode } from 'react';
import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import FeedbackPage from '../../app/feedback/page';
import ProposalsPage from '../../app/proposals/page';
import { AuthProvider, useAuth } from '../../components/AuthProvider';
import { HomeSections } from '../../components/rights/HomeSections';
import { useRightsQueue } from '../../components/rights/useRightsQueue';
import { toProposalDTO } from '../../lib/rights/queries';
import { authEvents, installVerificationNetwork, VerificationProbe, verificationClient } from '../fixtures/auth-verification';
import { adminIdentity, deferredResponse, proposalRow } from '../fixtures/operation-lifecycle';
import { pendingQueuePage } from '../fixtures/queue-pages';

vi.mock('../../lib/supabase', () => ({ createClient: () => verificationClient() }));
beforeEach(() => { authEvents.listener = undefined; window.history.replaceState(null, '', '/'); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const surfaces = { feedback: FeedbackPage, proposals: ProposalsPage, home: HomeSections } as const;
const actions = {
  feedback: ['送出建言', '發布官方回覆', '刪除建言', '查看作者（僅管理員）'],
  proposals: ['送出提案', '儲存修改', '送出留言', '核准上架', '退回提案', '刪除', '刪除留言：Existing comment', /覆議\/聯署/],
  home: ['發布到首頁', '刪除'],
} as const;

test.each(['feedback', 'proposals', 'home'] as const)('pauses %s write controls but keeps all draft fields editable through recovery', async kind => {
  // Given the real protected controls, including pending review and comment moderation.
  const network = installVerificationNetwork();
  network.population.comments = [{ id: 'c1', proposal_id: proposalRow.id, content: 'Existing comment',
    author_name: 'Student', created_at: proposalRow.created_at, version: 1 }];
  const confirmation = vi.spyOn(window, 'confirm').mockReturnValue(true);
  const Surface = surfaces[kind];
  render(<AuthProvider><VerificationProbe /><Surface /></AuthProvider>);
  await screen.findByText('ready');
  switch (kind) {
    case 'feedback': await screen.findByRole('button', { name: '發布官方回覆' }); break;
    case 'proposals': await screen.findByText('Existing comment'); await screen.findByText('Pending proposal'); break;
    case 'home': await screen.findByText('Campus notice'); break;
    default: throw new TypeError(`Unexpected surface: ${kind satisfies never}`);
  }
  const fields = screen.getAllByRole('textbox');
  fields.forEach(field => { fireEvent.change(field, { target: { value: 'Retained editable draft' } }); });
  const buttons = () => actions[kind].map(name => screen.getByRole('button', { name }));
  buttons().forEach(button => { expect(button).toBeEnabled(); });
  const pending = deferredResponse();
  network.handlers.session = () => pending.promise;
  // When background verification is checking and then temporarily unavailable.
  await act(async () => authEvents.listener?.('TOKEN_REFRESHED', null));
  buttons().forEach(button => { expect(button).toBeDisabled(); fireEvent.click(button); });
  fields.forEach(field => { expect(field).toBeEnabled(); });
  document.querySelectorAll('form').forEach(form => { fireEvent.submit(form); });
  await act(async () => pending.resolve(Response.json({}, { status: 503 })));
  // Then every write remains paused without losing nodes/values or invoking a confirmation/request.
  buttons().forEach(button => { expect(button).toBeDisabled(); });
  fields.forEach(field => { expect(field).toBeInTheDocument(); expect(field).toHaveValue('Retained editable draft'); });
  expect(network.posts()).toHaveLength(0);
  expect(network.authorReads()).toHaveLength(0);
  expect(confirmation).not.toHaveBeenCalled();
  network.handlers.session = () => Response.json(adminIdentity);
  fireEvent.click(screen.getByRole('button', { name: '重新驗證登入狀態' }));
  await screen.findByText('ready');
  buttons().forEach(button => { expect(button).toBeEnabled(); });
  fields.forEach(field => { expect(field).toBeInTheDocument(); expect(field).toHaveValue('Retained editable draft'); });
  expect(network.posts()).toHaveLength(0);
});

test('pauses private pending reads, rejects old-epoch results, and resumes only on explicit reload', async () => {
  // Given an admin queue with a trusted previous page and a refresh already in flight.
  const network = installVerificationNetwork();
  function Wrapper({ children }: { readonly children: ReactNode }) {
    return <AuthProvider><VerificationProbe />{children}</AuthProvider>;
  }
  const view = renderHook(() => {
    const auth = useAuth();
    return useRightsQueue({ kind: 'pending', filter: 'pending' }, toProposalDTO, { enabled: auth.isAdmin });
  }, { wrapper: Wrapper });
  await waitFor(() => expect(view.result.current.items).toHaveLength(1));
  const previous = view.result.current.items;
  const read = deferredResponse();
  network.handlers.pending = () => read.promise;
  let completion: ReturnType<typeof view.result.current.refresh> | undefined;
  act(() => { completion = view.result.current.refresh(); });
  const pending = deferredResponse();
  network.handlers.session = () => pending.promise;
  // When readiness changes before the protected read can finish.
  await act(async () => authEvents.listener?.('TOKEN_REFRESHED', null));
  await act(async () => { expect(await view.result.current.refresh()).toMatchObject({ ok: false, code: 'UNAVAILABLE' }); });
  await act(async () => pending.resolve(Response.json({}, { status: 503 })));
  await act(async () => { expect(await view.result.current.loadMore()).toMatchObject({ ok: false, code: 'UNAVAILABLE' }); });
  await act(async () => {
    read.resolve(Response.json({ ok: true, data: pendingQueuePage([{ ...proposalRow,
      id: 'late-private', title: 'Late private row', status: '待審核',
    }], '/api/rights/queue?kind=pending&filter=pending&limit=20') }));
    await completion;
  });
  // Then no paused request is sent and the old result cannot replace previously mounted rows.
  expect(network.pendingReads()).toHaveLength(2);
  expect(view.result.current.items).toEqual(previous);
  expect(view.result.current.status).toBe('error');
  expect(view.result.current.counts).toBeNull();
  network.handlers.session = () => Response.json(adminIdentity);
  fireEvent.click(screen.getByRole('button', { name: '重新驗證登入狀態' }));
  await screen.findByText('ready');
  expect(network.pendingReads()).toHaveLength(2);
  network.handlers.pending = path => Response.json({ ok: true, data: pendingQueuePage([{ ...proposalRow,
    id: 'current-private', title: 'Current private row', status: '待審核',
  }], path) });
  await act(async () => { await view.result.current.refresh(); });
  expect(network.pendingReads()).toHaveLength(3);
  expect(view.result.current.items[0]?.id).toBe('current-private');
});
