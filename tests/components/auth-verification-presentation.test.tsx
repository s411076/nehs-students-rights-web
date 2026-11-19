import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { AuthProvider } from '../../components/AuthProvider';
import { authEvents, installVerificationNetwork, VerificationProbe, verificationClient } from '../fixtures/auth-verification';
import { adminIdentity, deferredResponse } from '../fixtures/operation-lifecycle';
import { fixtureSession } from '../fixtures/supabase-server';

vi.mock('../../lib/supabase', () => ({ createClient: () => verificationClient() }));
beforeEach(() => { authEvents.listener = undefined; });
afterEach(() => { vi.unstubAllGlobals(); });

test.each(['SIGNED_IN', 'TOKEN_REFRESHED'] as const)('silently verifies routine same-account %s while keeping writes paused', async event => {
  // Given a server-verified identity and a pending routine recheck.
  const network = installVerificationNetwork();
  render(<AuthProvider><VerificationProbe /></AuthProvider>);
  await screen.findByText('ready');
  const generation = screen.getByTestId('auth-scope').getAttribute('data-generation');
  const pending = deferredResponse();
  network.handlers.session = () => pending.promise.then(() => Response.json(adminIdentity));

  // When the SDK reports the same account, including another event before completion.
  await act(async () => authEvents.listener?.(event, { ...fixtureSession('admin'), token_type: 'bearer' }));
  await act(async () => authEvents.listener?.(event, { ...fixtureSession('admin'), token_type: 'bearer' }));

  // Then verification still runs and blocks writes, without presenting routine feedback.
  expect(network.sessionReads()).toHaveLength(3);
  expect(screen.getByTestId('verification')).toHaveTextContent('checking');
  expect(screen.getByTestId('verification')).toHaveAttribute('data-can-write', 'false');
  expect(screen.getByTestId('auth-scope')).toHaveAttribute('data-generation', generation);
  expect(screen.getByTestId('auth-scope')).toHaveTextContent(adminIdentity.id);
  expect(screen.queryByText(/正在重新驗證登入狀態/)).toBeNull();
  expect(screen.queryByRole('button', { name: '驗證中…' })).toBeNull();
  await act(async () => pending.resolve(Response.json(adminIdentity)));
  expect(screen.getByTestId('verification')).toHaveAttribute('data-can-write', 'true');
  expect(screen.queryByText(/正在重新驗證登入狀態/)).toBeNull();
});

test.each([true, false])('keeps failure and manual retry feedback visible with retained identity=%s', async retained => {
  // Given an unavailable session check, optionally following a verified session.
  const network = installVerificationNetwork();
  if (!retained) network.handlers.session = () => Response.json({}, { status: 503 });
  render(<AuthProvider><VerificationProbe /></AuthProvider>);
  if (retained) {
    await screen.findByText('ready');
    network.handlers.session = () => Response.json({}, { status: 503 });
    await act(async () => authEvents.listener?.('SIGNED_IN', { ...fixtureSession('admin'), token_type: 'bearer' }));
  }
  await screen.findByText('unavailable');
  expect(screen.getByText(/暫時無法驗證登入狀態/)).toHaveAttribute('role', 'status');
  const pending = deferredResponse();
  network.handlers.session = () => pending.promise.then(() => Response.json(adminIdentity));

  // When the user explicitly retries, even if another SDK event arrives in flight.
  fireEvent.click(screen.getByRole('button', { name: '重新驗證登入狀態' }));
  await act(async () => authEvents.listener?.('TOKEN_REFRESHED', null));

  // Then progress remains visible and protected actions stay paused until server success.
  expect(screen.getByText(/正在重新驗證登入狀態/)).toHaveAttribute('role', 'status');
  expect(screen.getByRole('button', { name: '驗證中…' })).toBeDisabled();
  expect(screen.getByTestId('verification')).toHaveAttribute('data-can-write', 'false');
  await act(async () => pending.resolve(Response.json(adminIdentity)));
  expect(screen.getByTestId('verification')).toHaveAttribute('data-can-write', 'true');
  expect(screen.queryByText(/正在重新驗證登入狀態|暫時無法驗證登入狀態/)).toBeNull();

  const routine = deferredResponse();
  network.handlers.session = () => routine.promise;
  await act(async () => authEvents.listener?.('SIGNED_IN', { ...fixtureSession('admin'), token_type: 'bearer' }));
  expect(screen.queryByText(/正在重新驗證登入狀態/)).toBeNull();
  await act(async () => routine.resolve(Response.json(adminIdentity)));
});
