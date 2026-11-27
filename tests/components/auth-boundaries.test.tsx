// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { AuthProvider, useAuth, useLogoutNotice } from '../../components/AuthProvider';
import { AuthorReveal } from '../../components/admin/AuthorReveal';
import { useVerification } from '../../components/VerificationContext';
import { fakePublishableKey } from '../fixtures/supabase-data';

const admin = { id: 'admin', email: 'admin@nehs.hc.edu.tw', displayName: 'Fixture admin', isAdmin: true };
const authorButton = '查看作者（僅管理員）';

function deferredResponse() {
  let resolve!: (response: Response) => void;
  const promise = new Promise<Response>(done => { resolve = done; });
  return { promise, resolve };
}

function AuthControls() {
  const { isAdmin } = useAuth();
  const { beginLogout } = useLogoutNotice();
  const { retry } = useVerification();
  return <>
    <button type="button" onClick={retry}>Re-verify</button>
    <button type="button" onClick={beginLogout}>Log out</button>
    {isAdmin && <button type="button">Admin control</button>}
  </>;
}

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://127.0.0.1:9');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', fakePublishableKey);
});
afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

test('a delayed admin session response cannot restore admin controls after logout', async () => {
  const delayed = deferredResponse();
  const network = vi.fn<typeof fetch>()
    .mockResolvedValueOnce(Response.json(admin))
    .mockReturnValueOnce(delayed.promise);
  vi.stubGlobal('fetch', network);
  render(<AuthProvider><AuthControls /></AuthProvider>);
  await screen.findByRole('button', { name: 'Admin control' });

  fireEvent.click(screen.getByRole('button', { name: 'Re-verify' }));
  expect(network).toHaveBeenNthCalledWith(2, '/api/rights/session', expect.anything());
  fireEvent.click(screen.getByRole('button', { name: 'Log out' }));
  expect(screen.queryByRole('button', { name: 'Admin control' })).not.toBeInTheDocument();

  await act(async () => delayed.resolve(Response.json(admin)));
  expect(screen.queryByRole('button', { name: 'Admin control' })).not.toBeInTheDocument();
});

test('an author lookup from before re-verification cannot display private attribution', async () => {
  const delayed = deferredResponse();
  const verification = deferredResponse();
  const id = '20000000-0000-4000-8000-000000000001';
  const privateAuthor = {
    attribution: 'known', user_id: 'fixture-author',
    email: 'private-author@nehs.hc.edu.tw', display_name: 'Private author',
  };
  const network = vi.fn<typeof fetch>()
    .mockResolvedValueOnce(Response.json(admin))
    .mockReturnValueOnce(delayed.promise)
    .mockReturnValueOnce(verification.promise)
    .mockImplementationOnce(async () => Response.json({ ok: true, data: privateAuthor }));
  vi.stubGlobal('fetch', network);
  render(<AuthProvider><AuthControls /><AuthorReveal kind="feedback" id={id} /></AuthProvider>);
  fireEvent.click(await screen.findByRole('button', { name: authorButton }));
  expect(network).toHaveBeenNthCalledWith(2, `/api/rights/authors?kind=feedback&id=${id}`, expect.anything());

  fireEvent.click(screen.getByRole('button', { name: 'Re-verify' }));
  expect(network).toHaveBeenNthCalledWith(3, '/api/rights/session', expect.anything());
  await act(async () => verification.resolve(Response.json(admin)));

  await act(async () => delayed.resolve(Response.json({ ok: true, data: privateAuthor })));
  expect(screen.queryByText(privateAuthor.email)).not.toBeInTheDocument();
  const freshReveal = screen.getByRole('button', { name: authorButton });
  expect(freshReveal).toBeEnabled();
  fireEvent.click(freshReveal);
  expect(await screen.findByText(privateAuthor.email)).toBeVisible();
});
