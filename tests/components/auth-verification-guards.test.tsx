import type { ReactNode } from 'react';
import { useLayoutEffect } from 'react';
import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { AuthProvider } from '../../components/AuthProvider';
import { AuthorReveal } from '../../components/admin/AuthorReveal';
import { RightsDraftProvider, useRightsOperationOwner } from '../../components/rights/RightsDraftProvider';
import { useRightsMutation } from '../../components/rights/useRightsMutation';
import { ProposalVote } from '../../app/proposals/ProposalVote';
import type { OperationStore } from '../../components/rights/operationStore';
import { authEvents, installVerificationNetwork, privateAuthor, VerificationProbe, verificationClient } from '../fixtures/auth-verification';
import { adminIdentity, deferredResponse, feedbackRow, proposalRow } from '../fixtures/operation-lifecycle';

vi.mock('../../lib/supabase', () => ({ createClient: () => verificationClient() }));
beforeEach(() => { authEvents.listener = undefined; });
afterEach(() => { vi.unstubAllGlobals(); });
const reveal = () => screen.getByRole('button', { name: /查看作者|隱藏作者|作者資料載入中/ });

test('hides revealed private attribution immediately and requires an explicit reveal after recovery', async () => {
  // Given private attribution displayed for a currently verified administrator.
  const network = installVerificationNetwork();
  render(<AuthProvider><VerificationProbe /><AuthorReveal kind="feedback" id={feedbackRow.id} /></AuthProvider>);
  await screen.findByText('ready');
  fireEvent.click(reveal());
  await screen.findByText(privateAuthor.email);
  const pending = deferredResponse();
  network.handlers.session = () => pending.promise;
  // When verification starts, fails and is explicitly retried for the same owner.
  await act(async () => authEvents.listener?.('TOKEN_REFRESHED', null));
  expect(screen.queryByText(privateAuthor.email)).toBeNull();
  expect(reveal()).toBeDisabled();
  await act(async () => pending.resolve(Response.json({}, { status: 503 })));
  fireEvent.click(reveal());
  expect(network.authorReads()).toHaveLength(1);
  network.handlers.session = () => Response.json(adminIdentity);
  fireEvent.click(screen.getByRole('button', { name: '重新驗證登入狀態' }));
  await screen.findByText('ready');
  // Then recovery alone never discloses or fetches an author; an explicit reveal is still required.
  expect(screen.queryByText(privateAuthor.email)).toBeNull();
  expect(network.authorReads()).toHaveLength(1);
  fireEvent.click(reveal());
  await screen.findByText(privateAuthor.email);
  expect(network.authorReads()).toHaveLength(2);
});

test.each(['checking', 'unavailable', 'recovered'] as const)('ignores a previous-epoch author response while %s', async phase => {
  // Given an author request started before the next verification epoch.
  const network = installVerificationNetwork();
  const author = deferredResponse();
  network.handlers.author = () => author.promise;
  render(<AuthProvider><VerificationProbe /><AuthorReveal kind="feedback" id={feedbackRow.id} /></AuthProvider>);
  await screen.findByText('ready');
  fireEvent.click(reveal());
  const pending = deferredResponse();
  network.handlers.session = () => pending.promise;
  await act(async () => authEvents.listener?.('TOKEN_REFRESHED', null));
  if (phase !== 'checking') await act(async () => pending.resolve(Response.json({}, { status: 503 })));
  if (phase === 'recovered') {
    network.handlers.session = () => Response.json(adminIdentity);
    fireEvent.click(screen.getByRole('button', { name: '重新驗證登入狀態' }));
    await screen.findByText('ready');
  }
  // When the old lookup finally succeeds, including after readiness has recovered.
  await act(async () => author.resolve(Response.json({ ok: true, data: privateAuthor })));
  // Then the old private result cannot be displayed or trigger another lookup.
  expect(screen.queryByText(privateAuthor.email)).toBeNull();
  expect(network.authorReads()).toHaveLength(1);
});

test.each(['local', 'shared'] as const)('blocks even stale %s mutation callbacks synchronously before requests and recovers without replay', async mode => {
  // Given a callable mutation captured while its owner was ready.
  const network = installVerificationNetwork();
  const refresh = vi.fn(async () => {});
  const acknowledge = vi.fn();
  const request = { action: 'saveFeedbackReply', payload: { id: feedbackRow.id, reply: 'Draft', expectedVersion: 1 } };
  function Wrapper({ children }: { readonly children: ReactNode }) {
    return <AuthProvider><VerificationProbe />{mode === 'shared' ? <RightsDraftProvider>{children}</RightsDraftProvider> : children}</AuthProvider>;
  }
  const view = renderHook(() => useRightsMutation({ key: 'reply:f1', label: 'Reply' }), { wrapper: Wrapper });
  await screen.findByText('ready');
  const previousRun = view.result.current.run;
  const owner = view.result.current.owner;
  const pending = deferredResponse();
  network.handlers.session = () => pending.promise;
  // When an auth callback pauses readiness before React has committed disabled controls.
  await act(async () => {
    authEvents.listener?.('TOKEN_REFRESHED', null);
    expect(await previousRun(request, refresh, acknowledge)).toBeNull();
  });
  await act(async () => pending.resolve(Response.json({}, { status: 503 })));
  await act(async () => { expect(await view.result.current.run(request, refresh, acknowledge)).toBeNull(); });
  // Then no POST, optimistic operation, refresh or acknowledgement starts, and the owner stays live.
  expect(network.posts()).toHaveLength(0);
  expect(owner.signal.aborted).toBe(false);
  expect(view.result.current.owner).toBe(owner);
  expect(view.result.current.busy).toBe(false);
  expect(refresh).not.toHaveBeenCalled();
  expect(acknowledge).not.toHaveBeenCalled();
  network.handlers.session = () => Response.json(adminIdentity);
  fireEvent.click(screen.getByRole('button', { name: '重新驗證登入狀態' }));
  await screen.findByText('ready');
  expect(network.posts()).toHaveLength(0);
  await act(async () => { expect(await previousRun(request)).toBeNull(); });
  await act(async () => { await view.result.current.run(request); });
  expect(network.posts()).toHaveLength(1);
});

test('checks readiness before a stale vote handler can change the shared ballot snapshot', async () => {
  // Given a ready ballot with no local snapshot or optimistic vote change.
  const network = installVerificationNetwork();
  const owners: OperationStore[] = [];
  function BallotOwner() {
    const owner = useRightsOperationOwner();
    useLayoutEffect(() => { if (owner) owners.push(owner); }, [owner]);
    return null;
  }
  render(<AuthProvider><VerificationProbe /><RightsDraftProvider><BallotOwner /><ProposalVote item={proposalRow} /></RightsDraftProvider></AuthProvider>);
  await screen.findByText('ready');
  const owner = owners.at(-1);
  if (!owner) throw new TypeError('Ballot owner required');
  const vote = screen.getByRole('button', { name: /覆議\/聯署/ });
  const pending = deferredResponse();
  network.handlers.session = () => pending.promise;
  // When the old enabled button is activated in the same turn that verification is paused.
  act(() => { authEvents.listener?.('TOKEN_REFRESHED', null); fireEvent.click(vote); });
  await act(async () => {});
  // Then the preflight check precedes even the ballot snapshot write, not just the HTTP request.
  expect(owner.ballots.read(proposalRow.id)).toBeNull();
  expect(network.posts()).toHaveLength(0);
  expect(vote).toHaveAttribute('aria-pressed', 'false');
  expect(vote).toHaveTextContent(String(proposalRow.upvotes_count));
});
