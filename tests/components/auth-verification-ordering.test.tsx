import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { AuthProvider } from '../../components/AuthProvider';
import { authEvents, installVerificationNetwork, VerificationProbe, verificationClient } from '../fixtures/auth-verification';
import { adminIdentity, deferredResponse } from '../fixtures/operation-lifecycle';
import { fixtureSession } from '../fixtures/supabase-server';

vi.mock('../../lib/supabase', () => ({ createClient: () => verificationClient() }));
beforeEach(() => { authEvents.listener = undefined; });
afterEach(() => { vi.unstubAllGlobals(); });
const readiness = () => screen.getByTestId('verification');
const scope = () => screen.getByTestId('auth-scope');

test.each([200, 401, 403, 503])('keeps the newer 200 authoritative when the older request returns %s', async status => {
  // Given two checks, including a server that completes an aborted older request anyway.
  const network = installVerificationNetwork();
  render(<AuthProvider><VerificationProbe /></AuthProvider>);
  await screen.findByText('ready');
  const generation = scope().getAttribute('data-generation');
  const older = deferredResponse();
  const newer = deferredResponse();
  network.handlers.session = () => older.promise;
  await act(async () => authEvents.listener?.('TOKEN_REFRESHED', null));
  network.handlers.session = () => newer.promise;
  await act(async () => authEvents.listener?.('TOKEN_REFRESHED', null));
  // When the newer unchanged 200 precedes the older response, including the original 503 race.
  await act(async () => newer.resolve(Response.json(adminIdentity)));
  await act(async () => older.resolve(Response.json({ ...adminIdentity, isAdmin: false }, { status })));
  // Then neither readiness nor presentation nor generation can be overwritten by the older result.
  expect(readiness()).toHaveTextContent('ready');
  expect(readiness()).toHaveAttribute('data-can-write', 'true');
  expect(scope()).toHaveAttribute('data-status', 'verified');
  expect(scope()).toHaveAttribute('data-admin', 'true');
  expect(scope()).toHaveAttribute('data-generation', generation);
});

test('checks request freshness again after a delayed JSON body finishes parsing', async () => {
  // Given an older response whose headers arrived but whose body is still pending.
  const network = installVerificationNetwork();
  render(<AuthProvider><VerificationProbe /></AuthProvider>);
  await screen.findByText('ready');
  let resolveBody: (value: unknown) => void = () => { throw new TypeError('Missing response body'); };
  const body = new Promise<unknown>(resolve => { resolveBody = resolve; });
  const older = Response.json(null);
  vi.spyOn(older, 'json').mockReturnValue(body);
  network.handlers.session = () => older;
  await act(async () => authEvents.listener?.('TOKEN_REFRESHED', null));
  // When the newer check succeeds before the old body supplies a different role.
  network.handlers.session = () => Response.json(adminIdentity);
  await act(async () => authEvents.listener?.('TOKEN_REFRESHED', null));
  await act(async () => resolveBody({ ...adminIdentity, isAdmin: false }));
  // Then old parsing cannot retire the now-verified administrator.
  expect(scope()).toHaveAttribute('data-admin', 'true');
  expect(readiness()).toHaveTextContent('ready');
});

test.each(['success', 'failure'] as const)('ignores an older %s when the newest background check is unavailable', async outcome => {
  // Given two deferred background checks in one unchanged identity generation.
  const network = installVerificationNetwork();
  render(<AuthProvider><VerificationProbe /></AuthProvider>);
  await screen.findByText('ready');
  const generation = scope().getAttribute('data-generation');
  const older = deferredResponse();
  const newer = deferredResponse();
  network.handlers.session = () => older.promise;
  await act(async () => authEvents.listener?.('TOKEN_REFRESHED', null));
  const olderSignal = network.sessionReads().at(-1)?.[1]?.signal;
  network.handlers.session = () => newer.promise;
  await act(async () => authEvents.listener?.('TOKEN_REFRESHED', null));
  expect(olderSignal?.aborted).toBe(true);
  // When a newer 503 arrives before either the older success or failure.
  await act(async () => newer.resolve(Response.json({}, { status: 503 })));
  await act(async () => older.resolve(outcome === 'success' ? Response.json(adminIdentity) : Response.json({}, { status: 401 })));
  // Then only the newest readiness applies; retained presentation is not renewed authority.
  expect(readiness()).toHaveTextContent('unavailable');
  expect(readiness()).toHaveAttribute('data-can-write', 'false');
  expect(scope()).toHaveAttribute('data-status', 'verified');
  expect(scope()).toHaveAttribute('data-generation', generation);
  expect(scope()).toHaveTextContent(adminIdentity.id);
});

test('ignores older success until a newer in-flight check finishes', async () => {
  // Given a verified identity and two pending checks.
  const network = installVerificationNetwork();
  render(<AuthProvider><VerificationProbe /></AuthProvider>);
  await screen.findByText('ready');
  const older = deferredResponse();
  const newer = deferredResponse();
  network.handlers.session = () => older.promise;
  await act(async () => authEvents.listener?.('TOKEN_REFRESHED', null));
  network.handlers.session = () => newer.promise;
  await act(async () => authEvents.listener?.('TOKEN_REFRESHED', null));
  // When only the older check succeeds.
  await act(async () => older.resolve(Response.json(adminIdentity)));
  // Then writes remain paused for the newer request, including while parsing its response.
  expect(readiness()).toHaveTextContent('checking');
  expect(readiness()).toHaveAttribute('data-can-write', 'false');
  await act(async () => newer.resolve(Response.json(adminIdentity)));
  expect(readiness()).toHaveTextContent('ready');
});

test.each(['SIGNED_OUT', 'account'] as const)('captures the queued check generation before %s invalidates it', async event => {
  // Given a verified identity whose next auth callback queues a background check.
  const network = installVerificationNetwork();
  render(<AuthProvider><VerificationProbe /></AuthProvider>);
  await screen.findByText('ready');
  const calls = network.sessionReads().length;
  network.handlers.session = () => Response.json({ ...adminIdentity, id: 'student', isAdmin: false });
  // When another identity event arrives in the same turn, before that microtask can run.
  act(() => {
    authEvents.listener?.('TOKEN_REFRESHED', null);
    if (event === 'account') authEvents.listener?.('SIGNED_IN', { ...fixtureSession('student'), token_type: 'bearer' });
    else authEvents.listener?.('SIGNED_OUT', null);
  });
  await act(async () => {});
  // Then no queued check is relabelled with the new generation or resurrects a signed-out identity.
  expect(network.sessionReads()).toHaveLength(calls + (event === 'account' ? 1 : 0));
  expect(scope()).toHaveAttribute('data-status', event === 'account' ? 'verified' : 'anonymous');
  expect(scope()).toHaveTextContent(event === 'account' ? 'student' : '');
});
