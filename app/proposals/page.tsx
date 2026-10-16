"use client";

import { useState, useSyncExternalStore } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { RIGHTS_PENDING_PATH } from '@/lib/rights/contracts';
import { isPublicStatus, toProposalDTO } from '@/lib/rights/queries';
import type { ProposalDTO } from '@/lib/rights/queries';
import { useRightsPage } from '@/components/rights/useRightsPage';
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

const EMPTY_MESSAGES = {
  all: '目前尚無公開提案。',
  研議中: '目前尚無研議中的提案。',
  通過: '目前尚無通過的提案。',
  已採納: '目前尚無已採納的提案。',
  不採納: '目前尚無不採納的提案。',
} as const satisfies Record<ProposalsTab, string>;

function subscribeToHash(listener: () => void) {
  window.addEventListener('hashchange', listener);
  return () => window.removeEventListener('hashchange', listener);
}

function publicProposal(value: unknown) {
  const item = toProposalDTO(value);
  return item && isPublicStatus(item.status) ? item : null;
}

export default function ProposalsPage() {
  const auth = useAuth();
  return <RightsDraftProvider><ProposalsContent key={`${auth.generation}:${auth.identity?.id ?? ''}`} /></RightsDraftProvider>;
}

function ProposalsContent() {
  const { isAdmin } = useAuth();
  const [activeTab, setActiveTab] = useState<ProposalsTab>('all');
  const hash = useSyncExternalStore(subscribeToHash, () => window.location.hash, () => '');
  const proposals = useRightsPage('/api/rights/proposals', toProposalDTO);
  const pending = useRightsPage(RIGHTS_PENDING_PATH, toProposalDTO, { enabled: isAdmin });
  const pendingRows = pending.items.filter(item => item.status === '待審核').reverse();
  const rows = proposals.items.filter(item => isPublicStatus(item.status));
  const linked = usePublicItemLink('proposal', rows, publicProposal);
  const forgetDrafts = useForgetItemDrafts();
  const queues: Readonly<Record<ProposalsTab, readonly ProposalDTO[]>> = {
    all: rows,
    研議中: rows.filter(item => item.status === '研議中'),
    通過: rows.filter(item => item.status === '通過'),
    已採納: rows.filter(item => item.status === '已採納'),
    不採納: rows.filter(item => item.status === '不採納'),
  };
  // Counts cover loaded pages only; server-side filtering would need an RPC/migration change.
  const counts = { all: queues.all.length, 研議中: queues.研議中.length, 通過: queues.通過.length,
    已採納: queues.已採納.length, 不採納: queues.不採納.length };
  const selectedRows = queues[activeTab];
  // Keep the link hook on the full public list so tabs never refetch or hide a loaded hash target.
  const targetRow = (linked.target ? [...rows, linked.target] : rows).find(item => hash === `#item-${item.id}`);
  const visible = targetRow && !selectedRows.some(item => item.id === targetRow.id)
    ? [...selectedRows, targetRow] : selectedRows;
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
    {isAdmin && <div className={`${ui.card} p-4 sm:p-6 space-y-4`}>
      <div className={`flex flex-wrap gap-2 items-center justify-between border-b ${ui.border} pb-3`}>
        <h2 className="text-base font-bold text-gray-800 dark:text-neutral-200 flex items-center gap-2"><Clock aria-hidden="true" className="size-4 shrink-0" /> 待審核提案區（已載入 {pendingRows.length} 筆）</h2>
        <span className={ui.badge}><ShieldCheck aria-hidden="true" className="size-4 shrink-0" />僅管理員可見此區塊</span>
      </div>
      {pending.status === 'loading' && pendingRows.length === 0 && <p role="status" className="text-xs text-gray-500 dark:text-neutral-400 text-center py-4">待審核提案載入中…</p>}
      {pending.status === 'error' && <div><p role="alert" className="text-sm text-red-700 dark:text-red-400">待審核提案清單更新失敗，請重試。</p>
        <button type="button" onClick={() => void pending.refresh()} className={ui.secondaryButton}>重試待審核提案</button></div>}
      {pending.status === 'ready' && pendingRows.length === 0 && <p className="text-xs text-gray-500 dark:text-neutral-400 text-center py-4">目前尚無等待審核的提案。</p>}
      <div>{pendingRows.map(item => <PendingProposal key={item.id} item={item} refresh={refresh} />)}</div>
      <PageContinuation hasMore={pending.nextCursor !== null} loading={pending.status === 'loading'} onLoadMore={pending.loadMore} label="載入更多待審核提案" />
    </div>}
    <ProposalComposer refresh={refresh} />
    <ProposalsTabs activeTab={activeTab} onTabChange={setActiveTab} counts={counts}
      loading={proposals.status === 'loading' && proposals.items.length === 0} />
    <div role="tabpanel" id="proposals-list-panel" aria-labelledby={`proposals-tab-${activeTab}`}
      className="space-y-4 [&>[id^=item-]]:scroll-mt-36 sm:[&>[id^=item-]]:scroll-mt-32">
      <h2 className="text-lg font-bold text-gray-800 dark:text-neutral-200 px-1">熱門學生提案</h2>
      {linked.message && <div className="flex flex-wrap items-center gap-3">
        <p role="alert" className="text-sm text-red-700 dark:text-red-400">{linked.message}</p>
        {linked.canRefresh && <button type="button" onClick={() => void linked.refresh()} className={ui.secondaryButton}>重新載入連結項目</button>}
      </div>}
      {proposals.status === 'loading' && visible.length === 0 && <p role="status" className="text-gray-500 dark:text-neutral-400 text-center py-10">公開提案載入中…</p>}
      {proposals.status === 'error' && <div><p role="alert" className="text-sm text-red-700 dark:text-red-400">提案清單更新失敗，請重試。</p>
        <button type="button" onClick={() => void proposals.refresh()} className={ui.secondaryButton}>重試公開提案</button></div>}
      {proposals.status === 'ready' && visible.length === 0 && <div className={`${ui.card} text-muted-foreground text-center py-10`}>
        <p>{EMPTY_MESSAGES[activeTab]}</p>
      </div>}
      {visible.map(item => <ProposalCard key={item.id} item={item} refresh={linked.target?.id === item.id ? linked.refresh : proposals.refresh} remove={id => { proposals.remove(id); linked.remove(id); forgetDrafts('proposal', id); }} />)}
      <PageContinuation hasMore={proposals.nextCursor !== null} loading={proposals.status === 'loading'} onLoadMore={proposals.loadMore} label="載入更多公開提案" />
    </div>
  </main>;
}
