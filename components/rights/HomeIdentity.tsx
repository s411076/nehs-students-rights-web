'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase';
import confetti from 'canvas-confetti';
import { useAuth, useOAuthReturn } from '@/components/AuthProvider';
import { clearLoginCelebrationFlag, consumeLoginCelebrationFlag, markLoginCelebrationFlag, startGoogleOAuth } from '@/lib/auth/oauth-completion';

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
    {authStatus === 'unavailable' ? <div className="bg-white dark:bg-slate-900 border dark:border-slate-800 p-8 rounded-2xl shadow-lg mb-10 text-center">
      <p role="alert" className="text-sm font-bold text-red-600 dark:text-red-400 mb-4">登入服務暫時無法使用，無法確認目前的登入狀態。請稍後重試。</p>
      <button type="button" onClick={() => setAuthRetryNonce(n => n + 1)} disabled={authRetryNonce > 0}
        className="text-sm font-bold text-blue-600 dark:text-blue-400 underline rounded focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-60 disabled:cursor-wait">{authRetryNonce > 0 ? '重試中…' : '重試身分驗證'}</button>
    </div> : !isLoggedIn ? <div className="bg-white dark:bg-slate-900 border dark:border-slate-800 p-8 rounded-2xl shadow-lg mb-10 text-center relative overflow-hidden">
      <h2 className="text-xl font-bold mb-6 text-gray-800 dark:text-slate-200">登入學生權益網</h2>
      <div className="flex items-center justify-center py-6 relative min-h-[160px] sm:min-h-0">
        <button type="button" onClick={() => void login()} disabled={loginPending} aria-busy={loginPending}
          className="w-full sm:w-auto bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-extrabold text-xl sm:text-2xl py-6 px-4 sm:px-10 rounded-2xl shadow-xl hover:shadow-2xl transition-all duration-150 motion-reduce:transition-none flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-3 cursor-pointer focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900 disabled:opacity-60 disabled:cursor-wait">
          <span aria-live="polite">{loginPending ? '登入中…' : '以學校帳號登入'}</span>
          <span className="text-sm font-normal">（限 @nehs.hc.edu.tw）</span>
        </button>
      </div>
    </div> : <div className="bg-blue-50 dark:bg-slate-900/80 border border-blue-200 dark:border-slate-800 p-4 rounded-xl mb-8 flex justify-between items-center">
      <span className="font-bold text-blue-900 dark:text-blue-300">🎉 歡迎回來，{userName}！</span>
      {isAdmin && <span className="bg-purple-100 dark:bg-purple-900/60 text-purple-700 dark:text-purple-300 text-xs px-3 py-1 rounded-full font-bold">學權組管理員權限</span>}
    </div>}
  </>;
}
