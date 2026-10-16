import { act, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import { AuthProvider, useAuth } from '../../components/AuthProvider';
import { fixtureSession } from '../fixtures/supabase-server';

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

const student = { id: 'student', email: 'student@nehs.hc.edu.tw', displayName: 'Fixture student', isAdmin: false };
const admin = { id: 'admin', email: 'admin@nehs.hc.edu.tw', displayName: 'Fixture admin', isAdmin: true };

function Consumer() {
  const auth = useAuth();
  return <output data-testid="auth">{JSON.stringify(auth)}</output>;
}
function readAuth() { return JSON.parse(screen.getByTestId('auth').textContent ?? '{}'); }

beforeEach(() => { sdk.unsubscribe.mockClear(); sdk.listener = undefined; });
afterEach(() => { vi.unstubAllGlobals(); localStorage.clear(); });

test('TOKEN_REFRESHED with unchanged identity keeps generation and list state', async () => {
  // Given a verified student with a mounted list child holding local state
  const fetcher = vi.fn(async () => Response.json(student));
  vi.stubGlobal('fetch', fetcher);
  const seenStatuses: string[] = [];
  function StatusRecorder() {
    const auth = useAuth();
    seenStatuses.push(auth.status);
    return null;
  }
  let mounts = 0;
  function ListChild() {
    const [value] = useState(() => ++mounts);
    return <span data-testid="list-child">{value}</span>;
  }
  render(<AuthProvider><Consumer /><StatusRecorder /><ListChild /></AuthProvider>);
  await waitFor(() => expect(readAuth().status).toBe('verified'));
  const generation = readAuth().generation as number;
  const fetchCalls = fetcher.mock.calls.length;
  seenStatuses.length = 0;
  // When a tab-refocus-style token refresh resolves to the same identity
  await act(async () => { sdk.listener?.('TOKEN_REFRESHED', { ...fixtureSession('student'), token_type: 'bearer' }); });
  await waitFor(() => expect(fetcher.mock.calls.length).toBeGreaterThan(fetchCalls));
  await act(async () => { await Promise.resolve(); });
  // Then generation is untouched, no loading flash, and the list child never remounted
  expect(readAuth()).toMatchObject({ status: 'verified', identity: student, generation });
  expect(seenStatuses).not.toContain('loading');
  expect(seenStatuses).not.toContain('anonymous');
  expect(mounts).toBe(1);
  expect(screen.getByTestId('list-child').textContent).toBe('1');
});

test('TOKEN_REFRESHED with changed identity still invalidates', async () => {
  // Given a verified student session
  const fetcher = vi.fn(async () => Response.json(student));
  vi.stubGlobal('fetch', fetcher);
  let mounts = 0;
  function ListChild() {
    const [value] = useState(() => ++mounts);
    return <span data-testid="list-child">{value}</span>;
  }
  render(<AuthProvider><Consumer /><ListChild /></AuthProvider>);
  await waitFor(() => expect(readAuth().status).toBe('verified'));
  const generation = readAuth().generation as number;
  // When the refresh resolves to a different identity
  fetcher.mockResolvedValueOnce(Response.json(admin));
  await act(async () => { sdk.listener?.('TOKEN_REFRESHED', { ...fixtureSession('admin', true), token_type: 'bearer' }); });
  // Then the provider invalidates exactly as before: generation bumps and the tree remounts
  await waitFor(() => expect(readAuth().generation).toBeGreaterThan(generation));
  expect(readAuth()).toMatchObject({ status: 'verified', identity: admin });
  expect(mounts).toBe(2);
});
