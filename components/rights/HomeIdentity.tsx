'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { PartyPopper, ShieldCheck } from 'lucide-react';
import { createClient } from '@/lib/supabase';
import confetti from 'canvas-confetti';
import { useAuth, useOAuthReturn } from '@/components/AuthProvider';
import { clearLoginCelebrationFlag, consumeLoginCelebrationFlag, markLoginCelebrationFlag, startGoogleOAuth } from '@/lib/auth/oauth-completion';
import { ui } from './ui';

export function HomeIdentity() {
  const [supabase] = useState(createClient);
  const auth = useAuth();
  const oauthReturn = useOAuthReturn();
  const { generation, isLoggedIn, isAdmin, status: authStatus } = auth;
  const genRef = useRef(generation);
  useLayoutEffect(() => {
    genRef.current = generation;
    return () => { genRef.current = -1; };
  }, [generation]);
  const [authRetryNonce, setAuthRetryNonce] = useState(0);
  const [loginPending, setLoginPending] = useState(false);
  const loginFlight = useRef(false);
  const [oauthOutcome, setOauthOutcome] = useState<'failure' | 'ineligible' | null>(null);
  useEffect(() => { if (authRetryNonce > 0) window.location.reload(); }, [authRetryNonce]);
  useEffect(() => {
    let active = true;
    const gen = generation;
    void (async () => {
      if (!oauthReturn.intended) return;
      const result = await oauthReturn.complete();
      if (!active || genRef.current !== gen || authStatus === 'loading') return;
      if (result.status === 'success' && isLoggedIn) {
        setOauthOutcome(null);
        if (consumeLoginCelebrationFlag()) confetti({ particleCount: 120, spread: 80, origin: { y: 0.6 } });
        return;
      }
      setOauthOutcome(result.status === 'ineligible' || authStatus === 'ineligible' ? 'ineligible' : 'failure');
      clearLoginCelebrationFlag();
    })().catch(() => {
      if (!active || genRef.current !== gen) return;
      clearLoginCelebrationFlag(); setOauthOutcome('failure');
    });
    return () => { active = false; };
  }, [authStatus, isLoggedIn, generation, oauthReturn]);
  const login = async () => {
    if (loginFlight.current) return;
    loginFlight.current = true; setLoginPending(true);
    const gen = generation;
    markLoginCelebrationFlag();
    try {
      const result = await startGoogleOAuth(supabase, window.location.origin);
      if (result && typeof result === 'object' && 'error' in result && result.error) throw result.error;
    } catch {
      loginFlight.current = false; clearLoginCelebrationFlag();
      if (genRef.current === gen) { setOauthOutcome('failure'); setLoginPending(false); }
    }
  };
  const userName = auth.user?.displayName || auth.user?.email?.split('@')[0];
  return <>
    {authStatus !== 'unavailable' && (authStatus === 'ineligible' || oauthOutcome) && <p role="alert" className="mb-4 text-sm font-bold text-red-600 dark:text-red-400">
      {authStatus === 'ineligible' || oauthOutcome === 'ineligible'
        ? '登入資格不符：請使用已驗證的竹科實中學校帳號。'
        : '登入失敗：Google 回傳錯誤或登入未完成，請再試一次。'}
    </p>}
    {authStatus === 'unavailable' ? <div className={`${ui.card} p-6 mb-8 text-center`}>
      <p role="alert" className="text-sm font-bold text-red-600 dark:text-red-400 mb-4">登入服務暫時無法使用，無法確認目前的登入狀態。請稍後重試。</p>
      <button type="button" onClick={() => setAuthRetryNonce(n => n + 1)} disabled={authRetryNonce > 0}
        className={ui.secondaryButton}>{authRetryNonce > 0 ? '重試中…' : '重試身分驗證'}</button>
    </div> : !isLoggedIn ? <div className={`${ui.card} p-6 mb-8 text-center`}>
      <h2 className="text-xl font-bold mb-4 text-gray-800 dark:text-neutral-200">登入學生權益網</h2>
      <div className="flex items-center justify-center">
        <button type="button" onClick={() => void login()} disabled={loginPending} aria-busy={loginPending}
          className={`${ui.primaryButton} w-full sm:w-auto flex-col sm:flex-row`}>
          <span aria-live="polite">{loginPending ? '登入中…' : '以學校帳號登入'}</span>
          <span className="text-sm font-normal">（限 @nehs.hc.edu.tw）</span>
        </button>
      </div>
    </div> : <div className={`${ui.card} p-4 mb-8 flex flex-wrap justify-between items-center gap-3`}>
      <span className="font-bold text-gray-800 dark:text-neutral-200 inline-flex items-center gap-2"><PartyPopper aria-hidden="true" className="size-4 shrink-0" /> 歡迎回來，{userName}！</span>
      {isAdmin && <span className={ui.badge}><ShieldCheck aria-hidden="true" className="size-4 shrink-0" />學權組管理員權限</span>}
    </div>}
  </>;
}
