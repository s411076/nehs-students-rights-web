'use client';
import { createContext, Fragment, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { SessionIdentity } from '@/lib/auth/types';
import { createClient } from '@/lib/supabase';
import { consumeOAuthResultParams, hasOAuthResultParams, resolveOAuthCompletion } from '@/lib/auth/oauth-completion';
import type { CompletionResult } from '@/lib/auth/oauth-completion';
import { VerificationContext } from './VerificationContext';
import type { VerificationState } from './VerificationContext';
import { VerificationBanner } from './VerificationBanner';

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

function sameIdentity(
  left: Readonly<SessionIdentity> | null,
  right: Readonly<SessionIdentity> | null,
): boolean {
  if (left === null || right === null) return left === null && right === null;
  return left.id === right.id && left.email === right.email && left.isAdmin === right.isAdmin;
}

type SessionCheck =
  | { readonly status: 'verified'; readonly identity: Readonly<SessionIdentity> }
  | { readonly status: 'anonymous' | 'ineligible' | 'unavailable'; readonly identity: null };

export function AuthProvider({ children }: { readonly children: ReactNode }) {
  const [oauthReturn] = useState(captureOAuthReturn);
  const [state, setState] = useState<AuthState>({ status: 'loading', identity: null, generation: 0 });
  const [logoutError, setLogoutError] = useState<string | null>(null);
  const [logoutPending, setLogoutPending] = useState(false);
  const logoutBlocked = useRef(false);
  const pendingLogout = useRef(false);
  const invalidateLogout = useRef(() => {});
  const retryVerification = useRef(() => {});
  const [verification, setVerification] = useState<VerificationState>({ status: 'checking', epoch: 0 });
  const verificationRef = useRef(verification);
  const retry = useCallback(() => { retryVerification.current(); }, []);
  const isCurrent = useCallback((epoch: number) => !logoutBlocked.current &&
    verificationRef.current.status === 'ready' && verificationRef.current.epoch === epoch, []);
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
    let sequence = 0;
    let controller = new AbortController();
    let committedIdentity: Readonly<SessionIdentity> | null = null;
    const commit = (next: AuthState) => {
      committedIdentity = next.identity;
      setState(next);
    };
    const readiness = (status: VerificationState['status']) => {
      const next = { status, epoch: sequence };
      verificationRef.current = next;
      setVerification(next);
    };
    const invalidate = (status: 'loading' | 'anonymous') => {
      controller.abort();
      sequence++;
      generation++;
      commit({ status, identity: null, generation });
      readiness('ready');
    };
    invalidateLogout.current = () => { invalidate('anonymous'); };
    const verify = async (request: { readonly sequence: number; readonly generation: number; readonly controller: AbortController }) => {
      const current = () => active && request.sequence === sequence && request.generation === generation && !logoutBlocked.current;
      if (!current()) return;
      let next: SessionCheck;
      try {
        const response = await fetch('/api/rights/session', {
          credentials: 'same-origin', cache: 'no-store',
          signal: AbortSignal.any([request.controller.signal, AbortSignal.timeout(15_000)]),
        });
        switch (response.status) {
          case 200: next = { status: 'verified', identity: parseIdentity(await response.json()) }; break;
          case 401: next = { status: 'anonymous', identity: null }; break;
          case 403: next = { status: 'ineligible', identity: null }; break;
          default: next = { status: 'unavailable', identity: null };
        }
      } catch (error) {
        if (!(error instanceof Error || error instanceof DOMException)) throw error;
        next = { status: 'unavailable', identity: null };
      }
      if (!current()) return;
      switch (next.status) {
        case 'unavailable':
          if (committedIdentity === null) commit({ ...next, generation });
          readiness('unavailable');
          return;
        case 'verified':
          if (committedIdentity !== null && !sameIdentity(committedIdentity, next.identity)) generation++;
          commit({ ...next, generation });
          readiness('ready');
          setLogoutError(null);
          return;
        case 'anonymous':
        case 'ineligible':
          if (committedIdentity !== null) generation++;
          commit({ ...next, generation });
          readiness('ready');
          return;
        default: return assertNever(next);
      }
    };
    const startCheck = (deferred: boolean) => {
      if (!active || logoutBlocked.current) return;
      controller.abort();
      controller = new AbortController();
      const request = { sequence: ++sequence, generation, controller };
      readiness('checking');
      if (deferred) queueMicrotask(() => { void verify(request); });
      else void verify(request);
    };
    retryVerification.current = () => { startCheck(false); };
    let unsubscribe = () => {};
    try {
      const { data } = createClient().auth.onAuthStateChange((event, session) => {
        if (!active || event === 'INITIAL_SESSION') return;
        // Logout holds identity closed; only a later explicit sign-in can recover.
        if (logoutBlocked.current && event !== 'SIGNED_OUT') {
          if (pendingLogout.current || event !== 'SIGNED_IN') return;
          logoutBlocked.current = false;
        }
        if (event === 'SIGNED_OUT') {
          logoutBlocked.current = true;
          invalidate('anonymous');
          return;
        }
        if ((event === 'SIGNED_IN' && committedIdentity === null) ||
          (committedIdentity && session?.user.id && session.user.id !== committedIdentity.id)) invalidate('loading');
        startCheck(true);
      });
      unsubscribe = () => data.subscription.unsubscribe();
      startCheck(false);
    } catch (error) {
      if (!(error instanceof Error || error instanceof DOMException)) throw error;
      commit({ status: 'unavailable', identity: null, generation });
      readiness('unavailable');
    }
    return () => {
      active = false;
      generation++;
      sequence++;
      controller.abort();
      invalidateLogout.current = () => {};
      retryVerification.current = () => {};
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
      <Context.Provider value={value}>
        <VerificationContext.Provider value={{ ...verification, canWrite: verification.status === 'ready', retry, isCurrent }}>
          <VerificationBanner hasIdentity={state.identity !== null} />
          <Fragment key={state.generation}>{children}</Fragment>
        </VerificationContext.Provider>
      </Context.Provider>
    </OAuthReturnContext.Provider>
  </LogoutNoticeContext.Provider>;
}
function assertNever(value: never): never { throw new TypeError(`Unknown session state: ${value}`); }
