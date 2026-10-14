'use client';
import { createContext, Fragment, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { SessionIdentity } from '@/lib/auth/types';
import { createClient } from '@/lib/supabase';
import { consumeOAuthResultParams, hasOAuthResultParams, resolveOAuthCompletion } from '@/lib/auth/oauth-completion';
import type { CompletionResult } from '@/lib/auth/oauth-completion';

type OAuthReturn = {
  readonly intended: boolean;
  readonly complete: () => Promise<CompletionResult>;
};
const OAuthReturnContext = createContext<OAuthReturn | null>(null);
function captureOAuthReturn(): OAuthReturn {
  const search = typeof window === 'undefined' ? '' : window.location.search;
  const params = new URLSearchParams(search);
  let intended: boolean | undefined;
  let completion: Promise<CompletionResult> | undefined;
  return {
    // Only the root's OAuth outcome consumer reads this optional UI intent flag;
    // mounting the identity provider never reads storage to verify a session.
    get intended() {
      if (intended !== undefined) return intended;
      intended = hasOAuthResultParams(search);
      if (!intended) {
        try { intended = sessionStorage.getItem('just_logged_in') === 'true'; }
        catch { intended = false; }
      }
      return intended;
    },
    complete: () => completion ??= resolveOAuthCompletion(createClient()).then(result => {
      consumeOAuthResultParams();
      return params.has('error') || params.has('error_description') || params.has('error_code')
        ? { status: 'failure', email: null } : result;
    }),
  };
}
export function useOAuthReturn(): OAuthReturn {
  const shared = useContext(OAuthReturnContext);
  const [local] = useState(captureOAuthReturn);
  return shared ?? local;
}

export type AuthState = (
  | { readonly status: 'verified'; readonly identity: Readonly<SessionIdentity> }
  | { readonly status: 'loading' | 'anonymous' | 'ineligible' | 'unavailable'; readonly identity: null }
) & { readonly generation: number };
export type AuthContextValue = AuthState & {
  readonly user: Readonly<SessionIdentity> | null;
  readonly isAdmin: boolean;
  readonly isLoggedIn: boolean;
};
type LogoutNotice = {
  readonly logoutError: string | null;
  readonly logoutPending: boolean;
  readonly beginLogout: () => void;
  readonly reportLogoutFailure: () => void;
};
const Context = createContext<AuthContextValue | null>(null);
const LogoutNoticeContext = createContext<LogoutNotice | null>(null);
export function useLogoutNotice(): LogoutNotice {
  const notice = useContext(LogoutNoticeContext);
  if (!notice) throw new TypeError('useLogoutNotice requires AuthProvider');
  return notice;
}
export function useAuth(): AuthContextValue {
  const auth = useContext(Context);
  if (!auth) throw new TypeError('useAuth requires AuthProvider');
  return auth;
}

function parseIdentity(value: unknown): Readonly<SessionIdentity> {
  if (!value || typeof value !== 'object' ||
    !('id' in value) || typeof value.id !== 'string' || !value.id ||
    !('email' in value) || typeof value.email !== 'string' || !value.email ||
    !('displayName' in value) || typeof value.displayName !== 'string' ||
    !('isAdmin' in value) || typeof value.isAdmin !== 'boolean') {
    throw new TypeError('Invalid verified session response');
  }
  return { id: value.id, email: value.email, displayName: value.displayName, isAdmin: value.isAdmin };
}

export function AuthProvider({ children }: { readonly children: ReactNode }) {
  const [oauthReturn] = useState(captureOAuthReturn);
  const [state, setState] = useState<AuthState>({ status: 'loading', identity: null, generation: 0 });
  const [logoutError, setLogoutError] = useState<string | null>(null);
  const [logoutPending, setLogoutPending] = useState(false);
  const logoutBlocked = useRef(false);
  const pendingLogout = useRef(false);
  const invalidateLogout = useRef(() => {});
  const beginLogout = useCallback(() => {
    logoutBlocked.current = true;
    pendingLogout.current = true;
    invalidateLogout.current();
    setLogoutPending(true);
  }, []);
  const reportLogoutFailure = useCallback(() => {
    pendingLogout.current = false;
    setLogoutPending(false);
    setLogoutError('登出失敗，請檢查網路連線後再試一次。目前已隱藏登入功能，直到重新驗證身分。');
  }, []);
  useEffect(() => {
    let active = true;
    let generation = 0;
    let controller = new AbortController();
    const current = (version: number) => active && version === generation;
    const invalidate = (status: 'loading' | 'anonymous') => {
      controller.abort();
      controller = new AbortController();
      generation++;
      setState({ status, identity: null, generation });
      return generation;
    };
    invalidateLogout.current = () => { invalidate('anonymous'); };
    const verify = async (version: number) => {
      if (!current(version)) return;
      try {
        const response = await fetch('/api/rights/session', {
          credentials: 'same-origin', cache: 'no-store',
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15_000)]),
        });
        let next: AuthState;
        switch (response.status) {
          case 200: next = { status: 'verified', identity: parseIdentity(await response.json()), generation: version }; break;
          case 401: next = { status: 'anonymous', identity: null, generation: version }; break;
          case 403: next = { status: 'ineligible', identity: null, generation: version }; break;
          default: next = { status: 'unavailable', identity: null, generation: version };
        }
        if (current(version)) {
          setState(next);
          if (next.status === 'verified') setLogoutError(null);
        }
      } catch (error) {
        // The network/JSON boundary fails closed, including SDK/storage restrictions.
        if (current(version)) setState({ status: 'unavailable', identity: null, generation: version });
      }
    };
    let unsubscribe = () => {};
    try {
      const { data } = createClient().auth.onAuthStateChange((event) => {
        if (!active || event === 'INITIAL_SESSION') return;
        // Logout holds identity closed; only a later explicit sign-in can recover.
        if (logoutBlocked.current && event !== 'SIGNED_OUT') {
          if (pendingLogout.current || event !== 'SIGNED_IN') return;
          logoutBlocked.current = false;
        }
        const version = invalidate(event === 'SIGNED_OUT' ? 'anonymous' : 'loading');
        if (event !== 'SIGNED_OUT') queueMicrotask(() => { void verify(version); });
      });
      unsubscribe = () => data.subscription.unsubscribe();
      void verify(generation);
    } catch (error) {
      // Client initialization is a boundary: unavailable never retains privilege.
      setState({ status: 'unavailable', identity: null, generation });
    }
    return () => {
      active = false;
      generation++;
      controller.abort();
      invalidateLogout.current = () => {};
      unsubscribe();
    };
  }, []);
  const value: AuthContextValue = {
    ...state, user: state.identity,
    isAdmin: state.identity?.isAdmin === true,
    isLoggedIn: state.status === 'verified',
  };
  return <LogoutNoticeContext.Provider value={{ logoutError, logoutPending, beginLogout, reportLogoutFailure }}>
    <OAuthReturnContext.Provider value={oauthReturn}>
      <Context.Provider value={value}><Fragment key={state.generation}>{children}</Fragment></Context.Provider>
    </OAuthReturnContext.Provider>
  </LogoutNoticeContext.Provider>;
}
