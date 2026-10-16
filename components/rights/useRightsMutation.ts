'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { createRightsActionFlight } from '@/lib/rights/client';
import { ADMIN_ACTIONS, makeFailure } from '@/lib/rights/contracts';
import { parseActionRequest } from '@/lib/rights/validation';
import type { MutationReceipt } from '@/lib/rights/receipts';

export const CONFLICT_DRAFT_MESSAGE = '資料狀態已變更，草稿已保留。請重新載入最新資料並比對，再決定如何合併；重新載入不會覆蓋草稿。';

export function useRightsMutation() {
  const auth = useAuth();
  const scope = `${auth.generation}:${auth.status}:${auth.identity?.id ?? ''}:${auth.isAdmin}`;
  const scopeRef = useRef(scope);
  useLayoutEffect(() => { scopeRef.current = scope; }, [scope]);
  const active = useRef(true);
  const locked = useRef(false);
  const [flight] = useState(createRightsActionFlight);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  useEffect(() => {
    active.current = true;
    return () => { active.current = false; };
  }, []);

  const run = async (request: unknown, refresh?: () => Promise<unknown>, acknowledge?: (receipt: MutationReceipt) => void) => {
    if (locked.current) return null;
    const parsed = parseActionRequest(request);
    if (!parsed.ok) { setError(parsed.message); return null; }
    if (!auth.isLoggedIn || (ADMIN_ACTIONS.some(action => action === parsed.data.action) && !auth.isAdmin)) {
      setError(makeFailure(auth.isLoggedIn ? 'FORBIDDEN' : 'UNAUTHORIZED').message);
      return null;
    }
    locked.current = true;
    setBusy(true); setError(''); setNotice('');
    const current = () => active.current && scopeRef.current === scope;
    try {
      const result = await flight(parsed.data, refresh ? async () => current() ? refresh() : makeFailure('UNAVAILABLE') : undefined);
      // Page-owned draft receipts survive row unmount; row UI remains generation guarded.
      if (result.ok) acknowledge?.(result.data);
      if (!current()) return null;
      if (!result.ok) setError(result.code === 'CONFLICT' ? CONFLICT_DRAFT_MESSAGE : result.message);
      else setNotice(result.refresh === 'failed' ? result.message ?? '已儲存，但清單更新失敗' : '操作已成功完成。');
      return result;
    } catch (caught) {
      if (!(caught instanceof Error)) throw caught;
      if (current()) setError('無法確認是否已儲存，請先更新清單確認，勿重複提交。');
      return null;
    } finally {
      locked.current = false;
      if (current()) setBusy(false);
    }
  };
  return { run, busy, error, notice, setError, setNotice };
}
