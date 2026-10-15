import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import { AuthProvider, useAuth } from '../../components/AuthProvider';
import Navbar from '../../components/Navbar';
import { fixtureSession } from '../fixtures/supabase-server';

const sdk = vi.hoisted(() => ({
  listener: undefined as ((event: AuthChangeEvent, session: Session | null) => void) | undefined,
  signOut: vi.fn(),
  unsubscribe: vi.fn(),
}));
vi.mock('../../lib/supabase', () => ({ createClient: () => ({ auth: {
  onAuthStateChange: (listener: typeof sdk.listener) => {
    sdk.listener = listener;
    return { data: { subscription: { unsubscribe: sdk.unsubscribe } } };
  },
  signOut: (...args: unknown[]) => (sdk.signOut as (...call: unknown[]) => unknown)(...args),
} }) }));
vi.mock('next/link', () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
  // eslint-disable-next-line @next/next/no-html-link-for-pages
  <a href={typeof href === 'string' ? href : '/'} {...rest}>{children}</a>
) }));

const admin = { id: 'admin-id', email: 'admin@nehs.hc.edu.tw', displayName: 'Fixture admin', isAdmin: true };
const student = { id: 'student-id', email: 'student@nehs.hc.edu.tw', displayName: 'Fixture student', isAdmin: false };

function view() {
  render(<AuthProvider><Navbar /></AuthProvider>);
}

function deferredResponse() {
  let resolve: (response: Response) => void = () => { throw new Error('Uninitialized deferred'); };
  const promise = new Promise<Response>(done => { resolve = done; });
  return { promise, resolve };
}

beforeEach(() => {
  sdk.unsubscribe.mockClear();
  sdk.signOut.mockReset().mockResolvedValue({ error: null });
  sdk.listener = undefined;
  Object.defineProperty(window, 'location', { configurable: true, writable: true, value: { href: 'http://localhost/' } });
});
afterEach(() => { vi.unstubAllGlobals(); });

test('hides profile link, identity and logout when shared state is anonymous', async () => {
  // Given
  vi.stubGlobal('fetch', async () => Response.json({ error: 'no session' }, { status: 401 }));
  // When
  view();
  // Then
  await waitFor(() => expect(sdk.listener).toBeDefined());
  await waitFor(() => expect(screen.queryByTestId('operation-status')).toBeNull());
  expect(screen.queryByText('個人資料')).toBeNull();
  expect(screen.queryByText('🚪 登出')).toBeNull();
  expect(screen.queryByText('目前登入為：')).toBeNull();
  expect(screen.queryByText('管理後台')).toBeNull();
});

test('matches shared verified admin state: profile, identity, logout and admin view', async () => {
  // Given
  vi.stubGlobal('fetch', async () => Response.json(admin));
  // When
  view();
  // Then
  await waitFor(() => expect(screen.getByText('Fixture admin')).toBeInTheDocument());
  expect(screen.getByText('個人資料')).toBeInTheDocument();
  expect(screen.getByText('🚪 登出')).toBeInTheDocument();
  expect(screen.getByText('管理後台')).toBeInTheDocument();
});

test('verified student sees profile but no admin view', async () => {
  // Given
  vi.stubGlobal('fetch', async () => Response.json(student));
  // When
  view();
  // Then
  await waitFor(() => expect(screen.getByText('Fixture student')).toBeInTheDocument());
  expect(screen.getByText('個人資料')).toBeInTheDocument();
  expect(screen.queryByText('管理後台')).toBeNull();
});

test('account switch updates nav identity without stale previous user', async () => {
  // Given
  const fetcher = vi.fn().mockResolvedValue(Response.json(admin));
  vi.stubGlobal('fetch', fetcher);
  view();
  await waitFor(() => expect(screen.getByText('Fixture admin')).toBeInTheDocument());
  fetcher.mockResolvedValue(Response.json(student));
  // When
  act(() => { sdk.listener?.('SIGNED_IN', { ...fixtureSession('student'), token_type: 'bearer' }); });
  // Then
  await waitFor(() => expect(screen.getByText('Fixture student')).toBeInTheDocument());
  expect(screen.queryByText('Fixture admin')).toBeNull();
  expect(screen.queryByText('管理後台')).toBeNull();
});

test('logout immediately hides privileged nav, signs out once and navigates', async () => {
  // Given
  vi.stubGlobal('fetch', async () => Response.json(admin));
  let release!: (value: { error: null }) => void;
  sdk.signOut.mockImplementationOnce(() => new Promise<{ error: null }>(done => { release = done; }));
  view();
  await waitFor(() => expect(screen.getByText('🚪 登出')).toBeInTheDocument());
  // When
  fireEvent.click(screen.getByText('🚪 登出'));
  // Then: nonprivileged UI immediately, before signOut settles, with no extra timers
  expect(screen.queryByText('個人資料')).toBeNull();
  expect(screen.queryByText('管理後台')).toBeNull();
  expect(screen.queryByText('Fixture admin')).toBeNull();
  expect(screen.getByTestId('operation-status')).toHaveTextContent(/登出中/);
  expect(sdk.signOut).toHaveBeenCalledTimes(1);
  await act(async () => { release({ error: null }); });
  expect(window.location.href).toBe('/');
  expect(screen.queryByText('登出失敗')).toBeNull();
});

test('signOut rejection shows explicit failure and stays nonprivileged', async () => {
  // Given
  vi.stubGlobal('fetch', async () => Response.json(admin));
  sdk.signOut.mockRejectedValueOnce(new TypeError('network down'));
  view();
  await waitFor(() => expect(screen.getByText('🚪 登出')).toBeInTheDocument());
  // When
  await act(async () => { fireEvent.click(screen.getByText('🚪 登出')); });
  // Then
  expect(screen.getByTestId('operation-status')).toHaveTextContent(/登出失敗/);
  expect(screen.queryByText('個人資料')).toBeNull();
  expect(screen.queryByText('管理後台')).toBeNull();
  expect(screen.queryByText('Fixture admin')).toBeNull();
  expect(window.location.href).toBe('http://localhost/');
});

test('signOut error result shows explicit failure and never declares success', async () => {
  // Given
  vi.stubGlobal('fetch', async () => Response.json(student));
  sdk.signOut.mockResolvedValueOnce({ error: { message: 'session missing', name: 'AuthError', status: 403 } });
  view();
  await waitFor(() => expect(screen.getByText('🚪 登出')).toBeInTheDocument());
  // When
  await act(async () => { fireEvent.click(screen.getByText('🚪 登出')); });
  // Then
  expect(screen.getByTestId('operation-status')).toHaveTextContent(/登出失敗/);
  expect(screen.queryByText('個人資料')).toBeNull();
  expect(screen.queryByText('登出成功')).toBeNull();
  expect(window.location.href).toBe('http://localhost/');
});

test.each(['before failure', 'after failure'])('logout failure survives anonymous generation remount %s', async timing => {
  // Given: the SDK may clear its session even when its logout endpoint returns 400.
  vi.stubGlobal('fetch', async () => Response.json(admin));
  let release: ((value: { error: { status: number } }) => void) | undefined;
  sdk.signOut.mockImplementationOnce(() => new Promise(done => { release = done; }));
  view();
  await waitFor(() => expect(screen.getByText('🚪 登出')).toBeInTheDocument());
  const originalNav = screen.getByRole('navigation');
  // When: signOut fails and SIGNED_OUT remounts the provider's children in either order.
  fireEvent.click(screen.getByText('🚪 登出'));
  if (timing === 'before failure') act(() => { sdk.listener?.('SIGNED_OUT', null); });
  await act(async () => { release?.({ error: { status: 400 } }); });
  if (timing === 'after failure') act(() => { sdk.listener?.('SIGNED_OUT', null); });
  // Then: the replacement navbar retains the failure, never identity or success navigation.
  expect(screen.getByRole('navigation')).not.toBe(originalNav);
  expect(screen.getByTestId('operation-status')).toHaveTextContent(/登出失敗/);
  expect(screen.getByTestId('operation-status')).toHaveAttribute('role', 'alert');
  expect(screen.queryByText('個人資料')).toBeNull();
  expect(screen.queryByText('管理後台')).toBeNull();
  expect(screen.queryByText('🚪 登出')).toBeNull();
  expect(sdk.signOut).toHaveBeenCalledTimes(1);
  expect(window.location.href).toBe('http://localhost/');
});

test('failed logout recovers to fresh verification instead of stale role', async () => {
  // Given
  const fetcher = vi.fn().mockResolvedValue(Response.json(admin));
  vi.stubGlobal('fetch', fetcher);
  sdk.signOut.mockRejectedValueOnce(new TypeError('network down'));
  view();
  await waitFor(() => expect(screen.getByText('🚪 登出')).toBeInTheDocument());
  await act(async () => { fireEvent.click(screen.getByText('🚪 登出')); });
  expect(screen.getByTestId('operation-status')).toHaveTextContent(/登出失敗/);
  fetcher.mockResolvedValue(Response.json(student));
  // When: a fresh sign-in verification arrives for a new generation
  act(() => { sdk.listener?.('SIGNED_IN', { ...fixtureSession('student'), token_type: 'bearer' }); });
  // Then: nav follows the fresh verified identity, old admin view not restored as admin
  await waitFor(() => expect(screen.getByText('Fixture student')).toBeInTheDocument());
  expect(screen.queryByTestId('operation-status')).toBeNull();
  expect(screen.getByText('個人資料')).toBeInTheDocument();
  expect(screen.queryByText('管理後台')).toBeNull();
});

test('delayed admin response after logout never restores privileged nav', async () => {
  // Given
  const pending = deferredResponse();
  vi.stubGlobal('fetch', () => pending.promise);
  view();
  await waitFor(() => expect(sdk.listener).toBeDefined());
  // When
  act(() => { sdk.listener?.('SIGNED_OUT', null); });
  await act(async () => { pending.resolve(Response.json(admin)); });
  // Then
  expect(screen.queryByText('個人資料')).toBeNull();
  expect(screen.queryByText('管理後台')).toBeNull();
  expect(screen.queryByText('目前登入為：')).toBeNull();
  expect(screen.queryByText('🚪 登出')).toBeNull();
});

test('unmount during pending logout leaves no stale identity behind', async () => {
  // Given
  vi.stubGlobal('fetch', async () => Response.json(admin));
  let release!: (value: { error: null }) => void;
  sdk.signOut.mockImplementationOnce(() => new Promise<{ error: null }>(done => { release = done; }));
  const rendered = render(<AuthProvider><Navbar /></AuthProvider>);
  await waitFor(() => expect(screen.getByText('🚪 登出')).toBeInTheDocument());
  fireEvent.click(screen.getByText('🚪 登出'));
  // When
  rendered.unmount();
  await act(async () => { release({ error: null }); });
  // Then
  expect(screen.queryByTestId('operation-status')).toBeNull();
  expect(screen.queryByText('Fixture admin')).toBeNull();
  expect(sdk.unsubscribe).toHaveBeenCalled();
});

test('logout start clears privileged siblings before a no-event failure and rejects late generation results', async () => {
  // Given: privileged sibling content and an unfinished old-generation data read.
  const late = deferredResponse();
  let signal: AbortSignal | undefined;
  const fetcher = vi.fn().mockResolvedValueOnce(Response.json(admin)).mockImplementation((_url, init) => {
    signal = init.signal;
    return late.promise;
  });
  vi.stubGlobal('fetch', fetcher);
  let rejectLogout: (reason: Error) => void = () => { throw new Error('Missing logout'); };
  sdk.signOut.mockImplementation(() => new Promise((_resolve, reject) => { rejectLogout = reject; }));
  function Sibling() {
    const auth = useAuth();
    return <section>{auth.isAdmin && <p>Privileged sibling content</p>}</section>;
  }
  render(<AuthProvider><Navbar /><Sibling /></AuthProvider>);
  await screen.findByText('Privileged sibling content');
  // When: no SIGNED_OUT event is emitted by the SDK.
  fireEvent.click(screen.getByText('🚪 登出'));
  // Then: all shared privileges vanish before logout settles.
  expect(screen.queryByText('Privileged sibling content')).toBeNull();
  expect(screen.queryByText('管理後台')).toBeNull();
  await act(async () => { rejectLogout(new TypeError('offline')); });
  expect(screen.getByRole('alert')).toHaveTextContent(/登出失敗/);
  act(() => { sdk.listener?.('TOKEN_REFRESHED', null); });
  expect(fetcher).toHaveBeenCalledTimes(1);
  act(() => { sdk.listener?.('SIGNED_IN', null); });
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
  act(() => { sdk.listener?.('SIGNED_OUT', null); });
  expect(signal?.aborted).toBe(true);
  await act(async () => { late.resolve(Response.json(admin)); });
  expect(screen.queryByText('Privileged sibling content')).toBeNull();
  expect(screen.getByRole('alert')).toHaveTextContent(/登出失敗/);
});
