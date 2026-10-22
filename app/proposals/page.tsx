"use client";

import { useState } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { isPublicStatus, toProposalDTO } from '@/lib/rights/queries';
import type { ProposalQueueFilter } from '@/lib/rights/queues';
import { useRightsQueue } from '@/components/rights/useRightsQueue';
import { usePublicItemLink } from '@/components/rights/usePublicItemLink';
import { PageContinuation } from '@/components/rights/PageContinuation';
import { ProposalCard } from './ProposalCard';
import { Clock, Lightbulb, ShieldCheck } from 'lucide-react';
import { ProposalComposer } from './ProposalComposer';
import { PendingProposal } from './PendingProposal';
import { ProposalsTabs } from './ProposalsTabs';
import type { ProposalsTab } from './ProposalsTabs';
import { RightsDraftProvider, useForgetItemDrafts } from '@/components/rights/RightsDraftProvider';
import { ui } from '@/components/rights/ui';
import { RightsOperationFeedback } from '@/components/rights/RightsOperationFeedback';

const EMPTY_MESSAGES = {
  all: '目前尚無公開提案。',
  處理中: '目前尚無處理中的提案。',
  已結案: '目前尚無已結案的提案。',
} as const satisfies Record<ProposalsTab, string>;
const QUEUE_FILTERS = { all: 'all', 處理中: 'processing', 已結案: 'closed' } as const satisfies Record<ProposalsTab, ProposalQueueFilter>;

function publicProposal(value: unknown) {
  const item = toProposalDTO(value);
  return item && isPublicStatus(item.status) ? item : null;
}

export default function ProposalsPage() {
  const auth = useAuth();
  return <RightsDraftProvider pageFeedback><ProposalsContent key={`${auth.generation}:${auth.identity?.id ?? ''}`} /></RightsDraftProvider>;
}

function ProposalsContent() {
  const { isAdmin } = useAuth();
  const [activeTab, setActiveTab] = useState<ProposalsTab>('all');
  const proposals = useRightsQueue({ kind: 'proposal', filter: QUEUE_FILTERS[activeTab] }, toProposalDTO);
  const pending = useRightsQueue({ kind: 'pending', filter: 'pending' }, toProposalDTO, { enabled: isAdmin });
  const pendingRows = pending.items.filter(item => item.status === '待審核');
  const rows = proposals.items.filter(item => isPublicStatus(item.status));
  const linked = usePublicItemLink('proposal', rows, { parse: publicProposal, ready: proposals.status !== 'loading' });
  const forgetDrafts = useForgetItemDrafts();
  const counts = proposals.counts && 'processing' in proposals.counts
    ? { all: proposals.counts.all, 處理中: proposals.counts.processing, 已結案: proposals.counts.closed } : null;
  const visible = linked.target ? [...rows, linked.target] : rows;
  const refresh = async () => {
    const result = await proposals.refresh();
    if (!result.ok || !isAdmin) return result;
    return pending.refresh();
  };
  return <main className="max-w-4xl mx-auto p-4 md:p-6 space-y-6">
    <div className={`${ui.card} flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-6`}>
      <div>
        <h1 className="text-2xl font-bold text-gray-800 dark:text-neutral-200 flex items-center gap-2"><Lightbulb aria-hidden="true" size={18} className="shrink-0" /> 學生提案區</h1>
        <p className="text-sm text-gray-500 dark:text-neutral-400 mt-1">發起關於校園生活與權益的提案，獲得同學支持與學權組關注！</p>
      </div>
      {isAdmin && <div className="shrink-0 self-start sm:self-center"><span className={ui.badge}><ShieldCheck aria-hidden="true" className="size-4 shrink-0" /> 您目前為學權組管理員</span></div>}
    </div>
    <RightsOperationFeedback />
    {isAdmin && <div className={`${ui.card} p-4 sm:p-6 space-y-4`}>
      <div className={`flex flex-wrap gap-2 items-center justify-between border-b ${ui.border} pb-3`}>
        <h2 className="text-base font-bold text-gray-800 dark:text-neutral-200 flex items-center gap-2"><Clock aria-hidden="true" className="size-4 shrink-0" /> 待審核提案區（已載入 {pendingRows.length}／{pending.total ?? '—'} 筆）</h2>
        <span className={ui.badge}><ShieldCheck aria-hidden="true" className="size-4 shrink-0" />僅管理員可見此區塊</span>
      </div>
      {pending.status === 'loading' && pendingRows.length === 0 && <p role="status" className="text-xs text-gray-500 dark:text-neutral-400 text-center py-4">待審核提案載入中…</p>}
      {pending.status === 'error' && <div><p role="alert" className="text-sm text-red-700 dark:text-red-400">待審核提案清單更新失敗，請重試。</p>
        <button type="button" onClick={() => void pending.refresh()} className={ui.secondaryButton}>重試待審核提案</button></div>}
      {pending.status === 'ready' && pending.total === 0 && <p className="text-xs text-gray-500 dark:text-neutral-400 text-center py-4">目前尚無等待審核的提案。</p>}
      <div>{pendingRows.map(item => <PendingProposal key={item.id} item={item} refresh={refresh} />)}</div>
      <PageContinuation hasMore={pending.nextCursor !== null} loading={pending.status === 'loading'} onLoadMore={pending.loadMore} label="載入更多待審核提案" />
    </div>}
    <ProposalComposer refresh={refresh} />
    <ProposalsTabs activeTab={activeTab} onTabChange={setActiveTab} counts={counts}
      loading={proposals.status === 'loading' && counts === null} />
    <div role="tabpanel" id="proposals-list-panel" aria-labelledby={`proposals-tab-${activeTab}`}
      className="space-y-4 [&>[id^=item-]]:scroll-mt-36 sm:[&>[id^=item-]]:scroll-mt-32">
      <h2 className="text-lg font-bold text-gray-800 dark:text-neutral-200 px-1">熱門學生提案</h2>
      <p className="text-sm text-muted-foreground">已載入 {rows.length}／{proposals.total ?? '—'} 筆</p>
      {linked.message && <div className="flex flex-wrap items-center gap-3">
        <p role="alert" className="text-sm text-red-700 dark:text-red-400">{linked.message}</p>
        {linked.canRefresh && <button type="button" onClick={() => void linked.refresh()} className={ui.secondaryButton}>重新載入連結項目</button>}
      </div>}
      {proposals.status === 'loading' && rows.length === 0 && <p role="status" className="text-gray-500 dark:text-neutral-400 text-center py-10">公開提案載入中…</p>}
      {proposals.status === 'error' && <div><p role="alert" className="text-sm text-red-700 dark:text-red-400">提案清單更新失敗，請重試。</p>
        <button type="button" onClick={() => void proposals.refresh()} className={ui.secondaryButton}>重試公開提案</button></div>}
      {proposals.status === 'ready' && proposals.total === 0 && visible.length === 0 && <div className={`${ui.card} text-muted-foreground text-center py-10`}>
        <p>{EMPTY_MESSAGES[activeTab]}</p>
      </div>}
      {visible.map(item => <ProposalCard key={item.id} item={item} refresh={linked.target?.id === item.id ? async () => {
        const result = await linked.refresh();
        if (!result.ok) return result;
        return proposals.refresh();
      } : proposals.refresh} remove={id => { proposals.remove(id); linked.remove(id); forgetDrafts('proposal', id); }} />)}
      <PageContinuation hasMore={proposals.nextCursor !== null} loading={proposals.status === 'loading'} onLoadMore={proposals.loadMore} label="載入更多公開提案" />
    </div>
  </main>;
}
