import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import FeedbackPage from '../../app/feedback/page';
import { AuthProvider } from '../../components/AuthProvider';
import { authEvents, installVerificationNetwork, VerificationProbe, verificationClient } from '../fixtures/auth-verification';
import { adminIdentity, deferredResponse, feedbackRow } from '../fixtures/operation-lifecycle';
import { fixtureSession } from '../fixtures/supabase-server';

vi.mock('../../lib/supabase', () => ({ createClient: () => verificationClient() }));
beforeEach(() => { authEvents.listener = undefined; window.history.replaceState(null, '', '/feedback'); });
afterEach(() => { vi.unstubAllGlobals(); });
const reply = () => screen.getByRole('textbox', { name: '回覆「Library hours」' });
const submit = () => screen.getByRole('button', { name: '送出建言' });
const save = () => screen.getByRole('button', { name: '發布官方回覆' });
const tab = (name: string) => screen.getByRole('tab', { name: new RegExp(`^${name}`) });
const failureKinds = ['network', 'timeout', '503', 'JSON', 'identity'] as const;
function failedSession(kind: typeof failureKinds[number]): Response {
  switch (kind) {
    case 'network': throw new TypeError('Offline');
    case 'timeout': throw new DOMException('Timed out', 'TimeoutError');
    case '503': return Response.json({}, { status: 503 });
    case 'JSON': return new Response('{broken', { status: 200 });
    case 'identity': return Response.json({ ...adminIdentity, isAdmin: 'true' });
    default: throw new TypeError(`Unexpected failure: ${kind satisfies never}`);
  }
}

test.each(failureKinds)('preserves composer and page-owned reply through a %s failure and explicit same-user retry', async failure => {
  // Given both local composer fields and a page-owned versioned reply for a verified owner.
  const network = installVerificationNetwork();
  render(<AuthProvider><VerificationProbe /><FeedbackPage /></AuthProvider>);
  await screen.findByText('ready');
  await screen.findByText(feedbackRow.content);
  const originalTitle = screen.getByLabelText('建言標題');
  const originalReply = reply();
  const generation = screen.getByTestId('auth-scope').getAttribute('data-generation');
  fireEvent.change(originalTitle, { target: { value: 'Local composer draft' } });
  fireEvent.change(screen.getByLabelText('寶貴意見內容'), { target: { value: 'Local composer body' } });
  fireEvent.click(screen.getByRole('checkbox', { name: /匿名發布/ }));
  fireEvent.change(originalReply, { target: { value: 'Page-owned reply draft' } });
  const pending = deferredResponse();
  network.handlers.session = () => pending.promise.then(() => failedSession(failure));
  // When a same-owner SIGNED_IN refocus starts checking and then fails transiently.
  await act(async () => authEvents.listener?.('SIGNED_IN', { ...fixtureSession('admin'), token_type: 'bearer' }));
  expect(submit()).toBeDisabled();
  expect(save()).toBeDisabled();
  expect(originalTitle).toBeEnabled();
  expect(originalReply).toBeEnabled();
  fireEvent.change(originalReply, { target: { value: 'Edited while checking' } });
  const form = submit().closest('form');
  if (!form) throw new TypeError('Composer form required');
  fireEvent.submit(form);
  await act(async () => pending.resolve(Response.json({})));
  // Then unavailable presentation preserves the exact mounted nodes, identity scope and editable values.
  expect(screen.getByTestId('verification')).toHaveTextContent('unavailable');
  expect(screen.getByTestId('auth-scope')).toHaveAttribute('data-status', 'verified');
  expect(screen.getByTestId('auth-scope')).toHaveAttribute('data-admin', 'true');
  expect(screen.getByTestId('auth-scope')).toHaveAttribute('data-generation', generation);
  expect(screen.getByLabelText('建言標題')).toBe(originalTitle);
  expect(reply()).toBe(originalReply);
  expect(originalTitle).toHaveValue('Local composer draft');
  expect(screen.getByLabelText('寶貴意見內容')).toHaveValue('Local composer body');
  expect(screen.getByRole('checkbox', { name: /匿名發布/ })).toBeChecked();
  expect(originalReply).toHaveValue('Edited while checking');
  expect(screen.getByText(/暫時無法驗證登入狀態。草稿已保留/)).toBeVisible();
  fireEvent.change(originalReply, { target: { value: 'Edited while unavailable' } });
  fireEvent.submit(form);
  expect(network.posts()).toHaveLength(0);
  fireEvent.click(tab('已回覆'));
  fireEvent.click(tab('待回覆'));
  await screen.findByText(feedbackRow.content);
  expect(reply()).toHaveValue('Edited while unavailable');
  network.handlers.session = () => Response.json(adminIdentity);
  fireEvent.click(screen.getByRole('button', { name: '重新驗證登入狀態' }));
  await screen.findByText('ready');
  expect(screen.getByLabelText('建言標題')).toBe(originalTitle);
  expect(reply()).toHaveValue('Edited while unavailable');
  expect(submit()).toBeEnabled();
  expect(save()).toBeEnabled();
  expect(network.posts()).toHaveLength(0);
  fireEvent.click(save());
  expect(JSON.parse(String(network.posts()[0]?.[1]?.body))).toMatchObject({ action: 'saveFeedbackReply',
    payload: { reply: 'Edited while unavailable', expectedVersion: 1 },
  });
  await act(async () => {});
});

test.each(failureKinds)('has no retained identity when the initial check fails with %s', async failure => {
  // Given no previously verified identity, regardless of the SDK's local session.
  const network = installVerificationNetwork();
  network.handlers.session = async () => failedSession(failure);
  // When the initial server verification fails.
  render(<AuthProvider><VerificationProbe /><FeedbackPage /></AuthProvider>);
  await screen.findByText('unavailable');
  // Then presentation and protected controls remain unauthenticated, with an explicit verification retry.
  expect(screen.getByTestId('auth-scope')).toHaveAttribute('data-status', 'unavailable');
  expect(screen.getByTestId('auth-scope')).toBeEmptyDOMElement();
  expect(screen.queryByLabelText('建言標題')).toBeNull();
  expect(screen.getByRole('button', { name: '重新驗證登入狀態' })).toBeEnabled();
  expect(network.posts()).toHaveLength(0);
  expect(network.authorReads()).toHaveLength(0);
});
