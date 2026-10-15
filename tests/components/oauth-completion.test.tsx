import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import AuthCallbackPage from '../../app/auth/callback/page';
import {
  awaitSdkInit,
  buildCleanedUrl,
  consumeOAuthResultParams,
  decideCompletion,
  hasOAuthResultParams,
  resolveOAuthCompletion,
  startGoogleOAuth,
} from '../../lib/auth/oauth-completion';
import type { CompletionAuthClient } from '../../lib/auth/oauth-completion';

const sdk = vi.hoisted(() => ({
  getSession: vi.fn(),
  getUser: vi.fn(),
  exchangeCodeForSession: vi.fn(),
  signInWithOAuth: vi.fn(),
}));
const nav = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }));

vi.mock('@/lib/supabase', () => ({
  createClient: () => ({ auth: {
    getSession: sdk.getSession,
    getUser: sdk.getUser,
    exchangeCodeForSession: sdk.exchangeCodeForSession,
    signInWithOAuth: sdk.signInWithOAuth,
  } }),
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: nav.push, replace: nav.replace, refresh: nav.refresh }),
}));

function fakeClient(user: unknown, error: unknown = null): CompletionAuthClient {
  return { auth: {
    getSession: sdk.getSession,
    getUser: async () => ({ data: { user }, error }),
    signInWithOAuth: sdk.signInWithOAuth,
  } };
}
const schoolUser = { email: 'stu@nehs.hc.edu.tw', email_confirmed_at: '2026-01-01T00:00:00Z' };

function setUrl(search: string, hash = '') {
  window.history.replaceState(null, '', `/${search}${hash}`);
}

beforeEach(() => {
  setUrl('');
  sessionStorage.clear();
  sdk.getSession.mockReset().mockResolvedValue({ data: { session: { user: schoolUser } }, error: null });
  sdk.getUser.mockReset().mockResolvedValue({ data: { user: schoolUser }, error: null });
  sdk.exchangeCodeForSession.mockReset().mockResolvedValue({ data: null, error: null });
  sdk.signInWithOAuth.mockReset().mockResolvedValue({ data: {}, error: null });
  nav.push.mockClear();
  nav.replace.mockClear();
  nav.refresh.mockClear();
});
afterEach(() => { setUrl(''); sessionStorage.clear(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('decideCompletion: only confirmed school email grants success', () => {
  test('confirmed school email succeeds (case normalized)', () => {
    expect(decideCompletion(schoolUser, null)).toEqual({ status: 'success', email: 'stu@nehs.hc.edu.tw' });
    expect(decideCompletion(
      { email: 'STU@NEHS.HC.EDU.TW', email_confirmed_at: '2026-01-01T00:00:00Z' }, null,
    )).toEqual({ status: 'success', email: 'stu@nehs.hc.edu.tw' });
  });

  test.each([
    ['outside domain', { email: 'stu@gmail.com', email_confirmed_at: '2026-01-01T00:00:00Z' }, 'stu@gmail.com'],
    ['lookalike suffix domain', { email: 'stu@nehs.hc.edu.tw.evil.test', email_confirmed_at: '2026-01-01T00:00:00Z' }, 'stu@nehs.hc.edu.tw.evil.test'],
    ['unconfirmed school email', { email: 'stu@nehs.hc.edu.tw', email_confirmed_at: null }, 'stu@nehs.hc.edu.tw'],
    ['empty confirmation timestamp', { email: 'stu@nehs.hc.edu.tw', email_confirmed_at: '  ' }, 'stu@nehs.hc.edu.tw'],
  ])('%s is ineligible, never success', (_label, user, email) => {
    expect(decideCompletion(user, null)).toEqual({ status: 'ineligible', email });
  });

  test.each([
    ['missing session', null, null],
    ['transport error', schoolUser, new Error('no network')],
    ['user error payload', null, { message: 'invalid token' }],
    ['missing email', { email_confirmed_at: '2026-01-01T00:00:00Z' }, null],
    ['non-object user', 'stu@nehs.hc.edu.tw', null],
  ])('%s is a failure, never success', (_label, user, error) => {
    expect(decideCompletion(user, error).status).toBe('failure');
  });
});

describe('URL cleanup preserves unrelated params and hash', () => {
  test.each([
    ['code only', '/', '?code=abc', '', '/'],
    ['code with unrelated query and hash', '/', '?code=abc&next=/proposals&q=1', '#item-5', '/?next=%2Fproposals&q=1#item-5'],
    ['provider error params removed, others kept', '/', '?error=access_denied&error_description=oops&tab=1', '', '/?tab=1'],
    ['no OAuth params leaves URL untouched', '/proposals', '?q=1', '#item-2', '/proposals?q=1#item-2'],
  ])('%s', (_label, pathname, search, hash, expected) => {
    expect(buildCleanedUrl(pathname, search, hash)).toBe(expected);
  });

  test('detects OAuth result params without throwing on malformed input', () => {
    expect(hasOAuthResultParams('?code=abc')).toBe(true);
    expect(hasOAuthResultParams('?error=access_denied')).toBe(true);
    expect(hasOAuthResultParams('?q=1#item-2')).toBe(false);
    expect(hasOAuthResultParams('')).toBe(false);
  });

  test('consumeOAuthResultParams replaces only when params exist', () => {
    setUrl('?q=1', '#item-2');
    const replace = vi.spyOn(window.history, 'replaceState');
    replace.mockClear();
    expect(consumeOAuthResultParams()).toBeNull();
    expect(replace).not.toHaveBeenCalled();
    setUrl('?code=abc&next=/proposals', '#item-5');
    replace.mockClear();
    expect(consumeOAuthResultParams()).toBe('/?next=%2Fproposals#item-5');
    expect(replace).toHaveBeenCalledTimes(1);
    expect(window.location.search).toContain('next=');
    expect(window.location.search).not.toContain('code=');
    expect(window.location.hash).toBe('#item-5');
  });
});

describe('resolveOAuthCompletion: single automatic exchange, verified result', () => {
  test('verifies a fixture code exactly once with no manual exchange call', async () => {
    const result = await resolveOAuthCompletion(fakeClient(schoolUser));
    expect(result.status).toBe('success');
    expect(sdk.getSession).toHaveBeenCalledTimes(1);
    expect(sdk.exchangeCodeForSession).not.toHaveBeenCalled();
  });

  test('replayed code without a session is a failure with no manual exchange', async () => {
    const result = await resolveOAuthCompletion(fakeClient(null));
    expect(result.status).toBe('failure');
    expect(sdk.exchangeCodeForSession).not.toHaveBeenCalled();
  });

  test('SDK initialization failure still resolves to failure, never success', async () => {
    sdk.getSession.mockRejectedValueOnce(new Error('exchange failed'));
    const result = await resolveOAuthCompletion(fakeClient(null));
    expect(result.status).toBe('failure');
    expect(sdk.exchangeCodeForSession).not.toHaveBeenCalled();
  });

  test('non-school and unconfirmed identities are ineligible', async () => {
    await expect(resolveOAuthCompletion(fakeClient({ email: 'x@gmail.com', email_confirmed_at: '2026-01-01' })).then(r => r.status)).resolves.toBe('ineligible');
    await expect(resolveOAuthCompletion(fakeClient({ email: 'stu@nehs.hc.edu.tw', email_confirmed_at: null })).then(r => r.status)).resolves.toBe('ineligible');
  });

  test('awaitSdkInit settles instead of throwing', async () => {
    sdk.getSession.mockRejectedValueOnce(new Error('down'));
    await expect(awaitSdkInit(fakeClient(null))).resolves.toBeUndefined();
  });
});

describe('startGoogleOAuth: one shared entry, no role split', () => {
  test('both login buttons share redirectTo origin plus the hd hint', async () => {
    await startGoogleOAuth(fakeClient(null), 'http://localhost:3000');
    await startGoogleOAuth(fakeClient(null), 'http://localhost:3000');
    expect(sdk.signInWithOAuth).toHaveBeenCalledTimes(2);
    for (const call of sdk.signInWithOAuth.mock.calls) {
      expect(call[0]).toEqual({
        provider: 'google',
        options: { redirectTo: 'http://localhost:3000', queryParams: { hd: 'nehs.hc.edu.tw' } },
      });
    }
  });
});

describe('callback page: verified headings only', () => {
  test('replayed code without a valid session never shows the login-success heading', async () => {
    setUrl('?code=replayed-code');
    sdk.getUser.mockResolvedValue({ data: { user: null }, error: null });
    render(<AuthCallbackPage />);
    expect(screen.getByText('登入驗證中…')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('登入失敗')).toBeInTheDocument());
    expect(screen.queryByText(/登入成功/)).toBeNull();
    expect(sdk.exchangeCodeForSession).not.toHaveBeenCalled();
    expect(window.location.search).not.toContain('code=');
    expect(sessionStorage.getItem('just_logged_in')).toBeNull();
    expect(nav.replace).not.toHaveBeenCalled();
  });

  test('exchange failure never shows the login-success heading', async () => {
    setUrl('?code=expired-code');
    sdk.getSession.mockRejectedValueOnce(new Error('exchange failed'));
    sdk.getUser.mockResolvedValue({ data: { user: null }, error: null });
    render(<AuthCallbackPage />);
    await waitFor(() => expect(screen.getByText('登入失敗')).toBeInTheDocument());
    expect(screen.queryByText(/登入成功/)).toBeNull();
    expect(sdk.exchangeCodeForSession).not.toHaveBeenCalled();
  });

  test('non-school account shows ineligible, not success', async () => {
    setUrl('?code=outside-code');
    sdk.getUser.mockResolvedValue({ data: { user: { email: 'x@gmail.com', email_confirmed_at: '2026-01-01' } }, error: null });
    render(<AuthCallbackPage />);
    await waitFor(() => expect(screen.getByText('無法使用登入功能')).toBeInTheDocument());
    expect(screen.queryByText(/登入成功/)).toBeNull();
    expect(nav.replace).not.toHaveBeenCalled();
  });

  test('unconfirmed school account shows ineligible, not success', async () => {
    setUrl('?code=unconfirmed-code');
    sdk.getUser.mockResolvedValue({ data: { user: { email: 'stu@nehs.hc.edu.tw', email_confirmed_at: null } }, error: null });
    render(<AuthCallbackPage />);
    await waitFor(() => expect(screen.getByText('無法使用登入功能')).toBeInTheDocument());
    expect(screen.queryByText(/登入成功/)).toBeNull();
    expect(nav.replace).not.toHaveBeenCalled();
  });

  test('verified school code welcomes once, cleans the URL, then replaces to root', async () => {
    setUrl('?code=good-code&next=/proposals', '#item-5');
    render(<AuthCallbackPage />);
    await waitFor(() => expect(screen.getByText(/登入成功/)).toBeInTheDocument());
    expect(sdk.getSession).toHaveBeenCalledTimes(1);
    expect(sdk.exchangeCodeForSession).not.toHaveBeenCalled();
    expect(window.location.search).toContain('next=');
    expect(window.location.search).not.toContain('code=');
    expect(window.location.hash).toBe('#item-5');
    expect(sessionStorage.getItem('just_logged_in')).toBe('true');
    expect(nav.replace).toHaveBeenCalledWith('/');
    expect(nav.refresh).toHaveBeenCalled();
  });
});
