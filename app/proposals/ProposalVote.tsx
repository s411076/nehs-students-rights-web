'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { readRights } from '@/lib/rights/client';
import { isPublicStatus, isRecord, isSafeCount, toProposalDTO } from '@/lib/rights/queries';
import type { ProposalDTO } from '@/lib/rights/queries';
import { useRightsMutation } from '@/components/rights/useRightsMutation';
import { ActionFeedback } from '@/components/rights/ActionFeedback';

type Ballot = { readonly source: ProposalDTO; readonly voted: boolean; readonly count: number };

export function ProposalVote({ item }: { readonly item: ProposalDTO }) {
  const auth = useAuth();
  const mutation = useRightsMutation();
  const scope = `${auth.generation}:${auth.identity?.id ?? ''}`;
  const currentScope = useRef(scope);
  useLayoutEffect(() => {
    currentScope.current = scope;
    return () => { currentScope.current = ''; };
  }, [scope]);
  const [ballot, setBallot] = useState<Ballot | null>(null);
  const [uncertain, setUncertain] = useState(false);
  const displayed = ballot?.source === item ? ballot : { voted: item.viewer_voted, count: item.upvotes_count };

  const reconcile = async () => {
    const result = await readRights(`/api/rights/items?${new URLSearchParams({ kind: 'proposal', id: item.id })}`, value => {
      const proposal = toProposalDTO(value);
      if (!proposal || proposal.id !== item.id || !isPublicStatus(proposal.status)) throw new TypeError('Invalid public vote state');
      return proposal;
    });
    if (currentScope.current !== scope) return;
    if (result.ok) {
      setBallot({ source: item, voted: result.data.viewer_voted, count: result.data.upvotes_count });
      setUncertain(false);
    }
  };
  const vote = async () => {
    if (!auth.isLoggedIn) { window.alert('請先登入才能進行覆議！'); return; }
    if (uncertain) return;
    const result = await mutation.run({ action: 'setVote', payload: { proposalId: item.id, voted: !displayed.voted } });
    if (!result) return;
    if (result.ok && isRecord(result.data) && result.data.id === item.id &&
        'voted' in result.data && 'upvotes_count' in result.data &&
        typeof result.data.voted === 'boolean' && isSafeCount(result.data.upvotes_count) &&
        result.data.upvotes_count >= item.legacy_upvotes_count) {
      setBallot({ source: item, voted: result.data.voted, count: result.data.upvotes_count });
      mutation.setNotice('');
      return;
    }
    if (result.ok || result.code === 'OUTCOME_UNKNOWN') {
      setUncertain(true);
      mutation.setNotice('');
      mutation.setError('無法確認是否已儲存，請先更新清單確認，勿重複提交。');
      await reconcile();
    }
  };

  return <div className="pt-1 space-y-2">
    <button type="button" onClick={() => void vote()} disabled={mutation.busy || uncertain}
      aria-pressed={displayed.voted} aria-busy={mutation.busy}
      className={`min-h-11 px-3.5 py-1.5 text-xs font-semibold rounded-full border transition flex items-center gap-1.5 shadow-sm focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-60 ${displayed.voted
        ? 'bg-blue-600 text-white border-transparent hover:bg-blue-700'
        : 'bg-blue-50 dark:bg-blue-950/50 hover:bg-blue-100 dark:hover:bg-blue-900/50 text-blue-700 dark:text-blue-300 border-gray-200 dark:border-slate-700'}`}>
      👍 {displayed.voted ? '已聯署 (點擊取消)' : '覆議/聯署'}{' '}
      <span className={`px-1.5 py-0.5 rounded-full text-[11px] ${displayed.voted ? 'bg-blue-800 text-white' : 'bg-blue-200 text-blue-900'}`}>{displayed.count}</span>
    </button>
    {item.legacy_upvotes_count > 0 && <p className="text-xs text-gray-500 dark:text-slate-400">
      含歷史連署 {item.legacy_upvotes_count} 票；取消只影響您的新連署，不會扣除歷史票數。
    </p>}
    <ActionFeedback error={mutation.error} notice="" />
    {uncertain && <button type="button" onClick={() => void reconcile()}
      className="min-h-11 text-sm font-semibold underline text-blue-700 dark:text-blue-300 focus-visible:ring-2 focus-visible:ring-blue-500 rounded">更新連署狀態</button>}
  </div>;
}
