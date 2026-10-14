import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import { NextRequest } from 'next/server';
import { AuthProvider, useAuth, useLogoutNotice } from '../../components/AuthProvider';
import { GET } from '../../app/api/rights/session/route';
import { fixtureSession, startSupabaseFixture } from '../fixtures/supabase-server';
import { fakePublishableKey } from '../fixtures/supabase-data';
import { sessionRequest } from '../fixtures/server-auth-request';

vi.mock('server-only', () => ({}));
const sdk = vi.hoisted(() => ({
  listener: undefined as ((event: AuthChangeEvent, session: Session | null) => void) | undefined,
  unsubscribe: vi.fn(),
}));
vi.mock('../../lib/supabase', () => ({ createClient: () => ({ auth: {
  onAuthStateChange: (listener: typeof sdk.listener) => {
    sdk.listener = listener;
    return { data: { subscription: { unsubscribe: sdk.unsubscribe } } };
  },
} }) }));

const admin = { id: 'admin', email: 'admin@nehs.hc.edu.tw', displayName: 'Fixture admin', isAdmin: true };
const student = { id: 'student', email: 'student@nehs.hc.edu.tw', displayName: 'Fixture student', isAdmin: false };
function Consumer() {
  const auth = useAuth();
  return <output data-testid="auth">{JSON.stringify(auth)}</output>;
}
function readAuth() { return JSON.parse(screen.getByTestId('auth').textContent ?? '{}'); }
function deferredResponse() {
  let resolve: (response: Response) => void = () => { throw new Error('Uninitialized deferred'); };
  const promise = new Promise<Response>(done => { resolve = done; });
  return { promise, resolve };
}
beforeEach(() => { sdk.unsubscribe.mockClear(); sdk.listener = undefined; });
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); localStorage.clear(); });

test('grants role only from a verified server response shared by nested consumers', async () => {
  // Given
  const fetcher = vi.fn(async () => Response.json(admin));
  vi.stubGlobal('fetch', fetcher);
  // When
  render(<AuthProvider><Consumer /><section><Consumer /></section></AuthProvider>);
  // Then
  await waitFor(() => expect(screen.getAllByTestId('auth').map(node => JSON.parse(node.textContent ?? '{}').identity)).toEqual([admin, admin]));
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(fetcher).toHaveBeenCalledWith('/api/rights/session', expect.objectContaining({ cache: 'no-store', credentials: 'same-origin' }));
});

test.each([401, 403, 503])('withholds forged storage privileges when server returns %s', async status => {
  // Given
  localStorage.setItem('forged-auth', JSON.stringify({ user: admin, access_token: 'forged' }));
  vi.stubGlobal('fetch', async () => Response.json({ error: 'denied' }, { status }));
  // When
  render(<AuthProvider><Consumer /></AuthProvider>);
  // Then
  await waitFor(() => expect(readAuth()).toMatchObject({ status: status === 401 ? 'anonymous' : status === 403 ? 'ineligible' : 'unavailable', identity: null }));
});

test('never reads arbitrary storage when localStorage throws', async () => {
  // Given
  const storage = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new DOMException('Blocked', 'SecurityError'); });
  vi.stubGlobal('fetch', async () => Response.json({}, { status: 401 }));
  // When
  render(<AuthProvider><Consumer /></AuthProvider>);
  // Then
  await waitFor(() => expect(readAuth().status).toBe('anonymous'));
  expect(storage).not.toHaveBeenCalled();
});

test('discards delayed admin verification after logout and clears child data', async () => {
  // Given
  const pending = deferredResponse();
  vi.stubGlobal('fetch', () => pending.promise);
  let mounts = 0;
  function Child() { const [value] = useState(() => ++mounts); return <span data-testid="child">{value}</span>; }
  render(<AuthProvider><Consumer /><Child /></AuthProvider>);
  // When
  act(() => sdk.listener?.('SIGNED_OUT', null));
  await act(async () => pending.resolve(Response.json(admin)));
  // Then
  expect(readAuth()).toMatchObject({ status: 'anonymous', identity: null });
  expect(mounts).toBe(2);
});

test('logout start aborts pending verification without an SDK event', async () => {
  const pending = deferredResponse();
  let signal: AbortSignal | undefined;
  vi.stubGlobal('fetch', (_url: string, init: RequestInit) => { signal = init.signal ?? undefined; return pending.promise; });
  function LogoutControl() {
    const { beginLogout } = useLogoutNotice();
    return <button onClick={beginLogout}>Begin logout</button>;
  }
  render(<AuthProvider><Consumer /><LogoutControl /></AuthProvider>);
  fireEvent.click(screen.getByText('Begin logout'));
  expect(signal?.aborted).toBe(true);
  expect(readAuth()).toMatchObject({ status: 'anonymous', identity: null, generation: 1 });
  await act(async () => pending.resolve(Response.json(admin)));
  expect(readAuth()).toMatchObject({ status: 'anonymous', identity: null, isAdmin: false, generation: 1 });
});

test('schedules verification outside callback and ignores older account results', async () => {
  // Given
  const pending = deferredResponse();
  const fetcher = vi.fn().mockImplementationOnce(() => pending.promise).mockResolvedValue(Response.json(student));
  vi.stubGlobal('fetch', fetcher);
  render(<AuthProvider><Consumer /></AuthProvider>);
  // When
  act(() => {
    sdk.listener?.('SIGNED_IN', { ...fixtureSession('student'), token_type: 'bearer' });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  await waitFor(() => expect(readAuth().identity).toEqual(student));
  await act(async () => pending.resolve(Response.json(admin)));
  // Then
  expect(readAuth().identity).toEqual(student);
});

test('unsubscribes and invalidates pending work when unmounted', async () => {
  // Given
  const pending = deferredResponse();
  vi.stubGlobal('fetch', () => pending.promise);
  const view = render(<AuthProvider><Consumer /></AuthProvider>);
  // When
  view.unmount();
  await act(async () => pending.resolve(Response.json(admin)));
  // Then
  expect(sdk.unsubscribe).toHaveBeenCalledTimes(1);
  expect(screen.queryByTestId('auth')).toBeNull();
});

test('rejects malformed server identity without privilege', async () => {
  // Given
  vi.stubGlobal('fetch', async () => Response.json({ ...admin, isAdmin: 'true' }));
  // When
  render(<AuthProvider><Consumer /></AuthProvider>);
  // Then
  await waitFor(() => expect(readAuth()).toMatchObject({ status: 'unavailable', identity: null }));
});

test('browser factory reports missing public configuration before SDK startup', async () => {
  // Given
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', '');
  const actual = await vi.importActual<typeof import('../../lib/supabase')>('../../lib/supabase');
  // When / Then
  expect(() => actual.createClient()).toThrow(/Missing public Supabase configuration/);
});

test('real session route returns minimal verified identity and never mutates rights data', async () => {
  // Given
  const fixture = await startSupabaseFixture();
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', fixture.url);
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', fakePublishableKey);
  try {
    const request = await sessionRequest(fixture.url, 'admin', fixtureSession('admin', true));
    // When
    const response = await GET(request);
    // Then
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(admin);
    expect(response.headers.get('cache-control')).toContain('private');
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(response.cookies.getAll().filter(cookie => cookie.value).length).toBeGreaterThan(1);
    expect(fixture.data.counters.total).toBe(0);
  } finally { await fixture.close(); }
});

test.each(['anonymous', 'outsider', 'student', 'role-error'] as const)('real route distinguishes %s without leaking credentials', async scenario => {
  // Given
  const fixture = await startSupabaseFixture();
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', fixture.url);
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', fakePublishableKey);
  try {
    const request = scenario === 'anonymous' ? new NextRequest('http://localhost/api/rights/session') : await sessionRequest(fixture.url, scenario === 'outsider' ? 'outsider' : 'student');
    if (scenario === 'role-error') delete fixture.data.tables.admins;
    // When
    const response = await GET(request);
    // Then
    expect(response.status).toBe(scenario === 'anonymous' ? 401 : scenario === 'outsider' ? 403 : scenario === 'role-error' ? 503 : 200);
    expect(response.headers.get('cache-control')).toContain('no-store');
    const body = await response.json();
    if (scenario === 'student') expect(body).toEqual(student);
    else expect(Object.keys(body)).toEqual(['error']);
    expect(fixture.data.counters.total).toBe(0);
  } finally { await fixture.close(); }
});
