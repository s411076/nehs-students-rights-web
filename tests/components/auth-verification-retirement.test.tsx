import { useLayoutEffect } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { AuthProvider, useAuth } from '../../components/AuthProvider';
import { AuthorReveal } from '../../components/admin/AuthorReveal';
import { FeedbackComposer } from '../../app/feedback/FeedbackComposer';
import { FeedbackReplyEditor } from '../../components/rights/FeedbackReplyEditor';
import { RightsDraftProvider, useRightsOperationOwner } from '../../components/rights/RightsDraftProvider';
import { RightsOperationFeedback } from '../../components/rights/RightsOperationFeedback';
import type { OperationStore } from '../../components/rights/operationStore';
import { authEvents, installVerificationNetwork, privateAuthor, VerificationProbe, verificationClient } from '../fixtures/auth-verification';
import { adminIdentity, deferredResponse, feedbackRow } from '../fixtures/operation-lifecycle';
import { fixtureSession } from '../fixtures/supabase-server';

vi.mock('../../lib/supabase', () => ({ createClient: () => verificationClient() }));
beforeEach(() => { authEvents.listener = undefined; });
afterEach(() => { vi.unstubAllGlobals(); });
type SurfaceProps = { readonly capture: (owner: OperationStore) => void; readonly refresh: () => Promise<void> };
function CaptureOwner({ capture }: Pick<SurfaceProps, 'capture'>) {
  const owner = useRightsOperationOwner();
  useLayoutEffect(() => { if (owner) capture(owner); }, [owner, capture]);
  return null;
}
function DraftSurface(props: SurfaceProps) {
  const auth = useAuth();
  return <RightsDraftProvider pageFeedback><CaptureOwner capture={props.capture} />
    <FeedbackComposer refresh={props.refresh} />
    {auth.isAdmin && <FeedbackReplyEditor item={feedbackRow} refresh={props.refresh} presentation="inline" />}
    <AuthorReveal kind="feedback" id={feedbackRow.id} /><RightsOperationFeedback />
  </RightsDraftProvider>;
}
const scope = () => screen.getByTestId('auth-scope');

test.each(['role', 'account', 'email', '401', '403', 'SIGNED_OUT', 'logout'] as const)(
  'retires drafts, shared operations and private attribution when %s definitively changes authority', async change => {
    // Given a verified owner's local/page drafts, revealed author and an outstanding reply POST.
    const network = installVerificationNetwork();
    const owners: OperationStore[] = [];
    const capture = (owner: OperationStore) => { owners.push(owner); };
    const refresh = vi.fn(async () => {});
    render(<AuthProvider><VerificationProbe /><DraftSurface capture={capture} refresh={refresh} /></AuthProvider>);
    await screen.findByText('ready');
    const owner = owners.at(-1);
    if (!owner) throw new TypeError('Verified operation owner required');
    const lifetime = owner.signal;
    const title = screen.getByLabelText('建言標題');
    fireEvent.change(title, { target: { value: 'Old account composer' } });
    const reply = screen.getByRole('textbox', { name: '回覆「Library hours」' });
    fireEvent.change(reply, { target: { value: 'Old account reply' } });
    fireEvent.click(screen.getByRole('button', { name: '查看作者（僅管理員）' }));
    await screen.findByText(privateAuthor.email);
    const pending = deferredResponse();
    network.handlers.action = () => pending.promise;
    fireEvent.click(screen.getByRole('button', { name: '發布官方回覆' }));
    expect(owner.operations.read('reply:f1')?.busy).toBe(true);
    // When the server verifies a changed authority, or sign-out/logout invalidates immediately.
    switch (change) {
      case 'role': network.handlers.session = () => Response.json({ ...adminIdentity, isAdmin: false }); break;
      case 'account': network.handlers.session = () => Response.json({ ...adminIdentity, id: 'other-admin' }); break;
      case 'email': network.handlers.session = () => Response.json({ ...adminIdentity, email: 'other@nehs.hc.edu.tw' }); break;
      case '401': network.handlers.session = () => Response.json({}, { status: 401 }); break;
      case '403': network.handlers.session = () => Response.json({}, { status: 403 }); break;
      case 'SIGNED_OUT': act(() => authEvents.listener?.('SIGNED_OUT', null)); break;
      case 'logout': fireEvent.click(screen.getByRole('button', { name: 'Begin logout' })); break;
      default: throw new TypeError(`Unexpected change: ${change satisfies never}`);
    }
    if (change !== 'SIGNED_OUT' && change !== 'logout') await act(async () => authEvents.listener?.('TOKEN_REFRESHED', null));
    await act(async () => pending.resolve(Response.json({ ok: true, data: { id: feedbackRow.id, version: 2 } })));
    // Then the previous owner's late receipt cannot acknowledge, refresh, announce, or disclose in the new scope.
    expect(lifetime.aborted).toBe(true);
    expect(reply).not.toBeInTheDocument();
    expect(title).not.toBeInTheDocument();
    expect(screen.queryByText(privateAuthor.email)).toBeNull();
    expect(screen.queryByText('Old account composer')).toBeNull();
    expect(screen.queryByText('Old account reply')).toBeNull();
    expect(refresh).not.toHaveBeenCalled();
    expect(screen.queryByText(/操作已成功完成/)).toBeNull();
    expect(network.posts()).toHaveLength(1);
    expect(owners.at(-1)?.operations.read('reply:f1')).toBeNull();
    if (scope().getAttribute('data-status') === 'verified') expect(screen.getByLabelText('建言標題')).toHaveValue('');
  },
);

test('keeps the owner and drafts for verified name-only metadata changes', async () => {
  // Given a verified owner's edited draft and shared operation owner.
  const network = installVerificationNetwork();
  const owners: OperationStore[] = [];
  const capture = (owner: OperationStore) => { owners.push(owner); };
  render(<AuthProvider><VerificationProbe /><DraftSurface capture={capture} refresh={async () => {}} /></AuthProvider>);
  await screen.findByText('ready');
  const owner = owners.at(-1);
  const title = screen.getByLabelText('建言標題');
  fireEvent.change(title, { target: { value: 'Retained draft' } });
  const generation = scope().getAttribute('data-generation');
  // When only display metadata changes in a server-verified response.
  network.handlers.session = () => Response.json({ ...adminIdentity, displayName: 'Updated name' });
  await act(async () => authEvents.listener?.('USER_UPDATED', null));
  // Then the presentation updates without retiring the draft/operation scope.
  expect(scope()).toHaveAttribute('data-name', 'Updated name');
  expect(scope()).toHaveAttribute('data-generation', generation);
  expect(screen.getByLabelText('建言標題')).toBe(title);
  expect(title).toHaveValue('Retained draft');
  expect(owners.at(-1)).toBe(owner);
  expect(owner?.signal.aborted).toBe(false);
});

test('retires an SDK-different user immediately but never grants from SDK role metadata', async () => {
  // Given an administrator with an edited composer and a delayed next server check.
  const network = installVerificationNetwork();
  render(<AuthProvider><VerificationProbe /><DraftSurface capture={() => {}} refresh={async () => {}} /></AuthProvider>);
  await screen.findByText('ready');
  const original = screen.getByLabelText('建言標題');
  fireEvent.change(original, { target: { value: 'Old owner draft' } });
  const pending = deferredResponse();
  network.handlers.session = () => pending.promise;
  // When the SDK announces another user, including untrusted administrator metadata.
  const sdkSession = fixtureSession('student');
  act(() => authEvents.listener?.('SIGNED_IN', { ...sdkSession, token_type: 'bearer',
    user: { ...sdkSession.user, user_metadata: { isAdmin: true, role: 'admin' } },
  }));
  expect(scope()).toHaveAttribute('data-status', 'loading');
  expect(scope()).toBeEmptyDOMElement();
  expect(original).not.toBeInTheDocument();
  await act(async () => pending.resolve(Response.json({ ...adminIdentity, id: 'student', isAdmin: false })));
  // Then only the server's non-administrator identity becomes usable.
  expect(scope()).toHaveAttribute('data-admin', 'false');
  expect(screen.queryByRole('button', { name: '發布官方回覆' })).toBeNull();
  expect(screen.getByLabelText('建言標題')).toHaveValue('');
});
