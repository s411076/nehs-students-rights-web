'use client';

import { useCallback, useEffect } from 'react';
import { ThumbsUp } from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import { readRights } from '@/lib/rights/client';
import { isPublicStatus, isRecord, isSafeCount, toProposalDTO } from '@/lib/rights/queries';
import type { ProposalDTO } from '@/lib/rights/queries';
import { useRightsMutation } from '@/components/rights/useRightsMutation';
import { ActionFeedback } from '@/components/rights/ActionFeedback';
import { ui } from '@/components/rights/ui';
import { useDraftSlot } from '@/components/rights/draftStore';

export function ProposalVote({ item }: { readonly item: ProposalDTO }) {
  const auth = useAuth();
  const key = `vote:${item.id}` as const;
  const mutation = useRightsMutation({ key, label: `「${item.title}」連署` });
  const { owner } = mutation;
  const ballot = useDraftSlot(owner.ballots, item.id);
  const displayed = ballot.snapshot ?? { voted: item.viewer_voted, count: item.upvotes_count, uncertain: false };
  const { uncertain } = displayed;

  const reconcile = useCallback(async () => {
    const signal = owner.signal;
    const previous = owner.ballots.read(item.id);
    const request = (owner.ballotReads.get(item.id) ?? 0) + 1;
    owner.ballotReads.set(item.id, request);
    const result = await readRights(`/api/rights/items?${new URLSearchParams({ kind: 'proposal', id: item.id })}`, value => {
      const proposal = toProposalDTO(value);
      if (!proposal || proposal.id !== item.id || !isPublicStatus(proposal.status)) throw new TypeError('Invalid public vote state');
      return proposal;
    });
    if (signal.aborted || owner.ballotReads.get(item.id) !== request || owner.ballots.read(item.id) !== previous) return;
    if (result.ok) {
      owner.ballots.write(item.id, { voted: result.data.viewer_voted, count: result.data.upvotes_count, uncertain: false });
    }
  }, [owner, item.id]);
  useEffect(() => {
    if (owner.ballots.read(item.id) && !owner.operations.read(key)?.busy) void reconcile();
  }, [owner, item, key, reconcile]);
  const vote = async () => {
    if (!auth.isLoggedIn) { window.alert('請先登入才能進行覆議！'); return; }
    if (ballot.read()?.uncertain || owner.operations.read(key)?.busy) return;
    if (!mutation.checkReady()) return;
    const signal = owner.signal;
    ballot.write({ ...displayed, uncertain: false });
    const result = await mutation.run({ action: 'setVote', payload: { proposalId: item.id, voted: !displayed.voted } });
    if (!result || signal.aborted) return;
    if (result.ok && isRecord(result.data) && result.data.id === item.id &&
        'voted' in result.data && 'upvotes_count' in result.data &&
        typeof result.data.voted === 'boolean' && isSafeCount(result.data.upvotes_count) &&
        result.data.upvotes_count >= item.legacy_upvotes_count) {
      ballot.write({ voted: result.data.voted, count: result.data.upvotes_count, uncertain: false });
      return;
    }
    if (result.ok || result.code === 'OUTCOME_UNKNOWN') {
      ballot.write({ ...displayed, uncertain: true });
      mutation.setNotice('');
      mutation.setError('無法確認是否已儲存，請先更新清單確認，勿重複提交。');
      await reconcile();
    }
  };

  return <div className="pt-1 space-y-2">
    <button type="button" onClick={() => void vote()} disabled={mutation.busy || uncertain || !mutation.canWrite}
      aria-pressed={displayed.voted} aria-busy={mutation.busy}
      className={displayed.voted ? ui.primaryButton : ui.secondaryButton}>
      <ThumbsUp aria-hidden="true" className="size-4 shrink-0" /> {displayed.voted ? '已聯署 (點擊取消)' : '覆議/聯署'}{' '}
      <span className={ui.badge}>{displayed.count}</span>
    </button>
    {item.legacy_upvotes_count > 0 && <p className="text-xs text-gray-500 dark:text-neutral-400">
      含歷史連署 {item.legacy_upvotes_count} 票；取消只影響您的新連署，不會扣除歷史票數。
    </p>}
    <ActionFeedback {...mutation.feedback} notice="" />
    {uncertain && <button type="button" onClick={() => void reconcile()}
      className={ui.secondaryButton}>更新連署狀態</button>}
  </div>;
}
