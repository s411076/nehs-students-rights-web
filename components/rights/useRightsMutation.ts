'use client';

import { useLayoutEffect, useMemo } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { useVerification, VERIFICATION_PAUSED_MESSAGE } from '@/components/VerificationContext';
import { createRightsActionFlight } from '@/lib/rights/client';
import { ADMIN_ACTIONS, makeFailure } from '@/lib/rights/contracts';
import { parseActionRequest } from '@/lib/rights/validation';
import type { MutationReceipt } from '@/lib/rights/receipts';
import type { ClientMutationResult } from '@/lib/rights/client';
import { useDraftSlot } from './draftStore';
import { useRightsOperationOwner } from './RightsDraftProvider';
import { createOperationStore, EMPTY_OPERATION } from './operationStore';
import type { OperationState, OperationTarget } from './operationStore';
import { captureOperationFocus } from './operationFocus';

export const CONFLICT_DRAFT_MESSAGE = '資料狀態已變更，草稿已保留。請重新載入最新資料並比對，再決定如何合併；重新載入不會覆蓋草稿。';

export function useRightsMutation(target?: OperationTarget) {
  const auth = useAuth();
  const verification = useVerification();
  const scope = `${auth.generation}:${auth.status}:${auth.identity?.id ?? ''}:${auth.isAdmin}`;
  const sharedOwner = useRightsOperationOwner();
  const localOwner = useMemo(() => createOperationStore(scope), [scope]);
  useLayoutEffect(() => { localOwner.activate(); return localOwner.retire; }, [localOwner]);
  const owner = target && sharedOwner ? sharedOwner : localOwner;
  const key = target?.key ?? 'local';
  const slot = useDraftSlot(owner.operations, key);
  const state = slot.snapshot ?? EMPTY_OPERATION;
  const publish = (next: OperationState, recoverFocus: ReturnType<typeof captureOperationFocus> | null = null) => {
    if (target) owner.publish(target, next, recoverFocus);
    else { slot.write(next); recoverFocus?.(null); }
  };
  const setError = (error: string) => {
    if (!owner.signal.aborted) publish({ ...(slot.read() ?? EMPTY_OPERATION), error });
  };
  const setNotice = (notice: string) => {
    if (!owner.signal.aborted) publish({ ...(slot.read() ?? EMPTY_OPERATION), notice });
  };
  const checkReady = () => {
    if (owner.signal.aborted) return false;
    if (verification.isCurrent(verification.epoch)) return true;
    setError(VERIFICATION_PAUSED_MESSAGE);
    return false;
  };

  const run = async (request: unknown, refresh?: () => Promise<unknown>, acknowledge?: (receipt: MutationReceipt) => void) => {
    const signal = owner.signal;
    if (signal.aborted || slot.read()?.busy) return null;
    if (!checkReady()) return null;
    const parsed = parseActionRequest(request);
    if (!parsed.ok) { setError(parsed.message); return null; }
    if (!auth.isLoggedIn || (ADMIN_ACTIONS.some(action => action === parsed.data.action) && !auth.isAdmin)) {
      setError(makeFailure(auth.isLoggedIn ? 'FORBIDDEN' : 'UNAUTHORIZED').message);
      return null;
    }
    const flight = slot.read()?.flight ?? createRightsActionFlight();
    const pending = { ...EMPTY_OPERATION, busy: true, flight };
    const recoverFocus = captureOperationFocus(signal);
    publish(pending);
    let result: ClientMutationResult;
    try {
      result = await flight(parsed.data, refresh ? async () => signal.aborted ? makeFailure('UNAVAILABLE') : refresh() : undefined);
    } catch (caught) {
      if (!(caught instanceof Error)) throw caught;
      result = { ok: false, code: 'OUTCOME_UNKNOWN', message: '無法確認是否已儲存，請先更新清單確認，勿重複提交。' };
    }
    if (signal.aborted) return null;
    if (result.ok) acknowledge?.(result.data);
    const error = result.ok ? '' : result.code === 'CONFLICT' ? CONFLICT_DRAFT_MESSAGE : result.message;
    const notice = result.ok ? result.refresh === 'failed' ? result.message ?? '已儲存，但清單更新失敗' : '操作已成功完成。' : '';
    publish({ busy: false, error, notice, result, flight }, recoverFocus);
    return result;
  };
  return { run, ...state, setError, setNotice, owner, canWrite: verification.canWrite, checkReady,
    feedback: { error: state.error, notice: owner.pageFeedback ? '' : state.notice, announce: !owner.pageFeedback },
  };
}
