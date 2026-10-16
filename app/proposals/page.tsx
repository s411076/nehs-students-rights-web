"use client";

import { useAuth } from '@/components/AuthProvider';
import { RIGHTS_PENDING_PATH } from '@/lib/rights/contracts';
import { isPublicStatus, toProposalDTO } from '@/lib/rights/queries';
import { useRightsPage } from '@/components/rights/useRightsPage';
import { usePublicItemLink } from '@/components/rights/usePublicItemLink';
import { PageContinuation } from '@/components/rights/PageContinuation';
import { ProposalCard } from './ProposalCard';
import { Clock, Lightbulb, ShieldCheck } from 'lucide-react';
import { ProposalComposer } from './ProposalComposer';
import { PendingProposal } from './PendingProposal';
import { RightsDraftProvider, useForgetItemDrafts } from '@/components/rights/RightsDraftProvider';
import { ui } from '@/components/rights/ui';

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
  const proposals = useRightsPage('/api/rights/proposals', toProposalDTO);
  const pending = useRightsPage(RIGHTS_PENDING_PATH, toProposalDTO, { enabled: isAdmin });
  const rows = proposals.items.filter(item => isPublicStatus(item.status));
  const linked = usePublicItemLink('proposal', rows, publicProposal);
  const forgetDrafts = useForgetItemDrafts();
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
    {isAdmin && <div className={`${ui.card} p-6 space-y-4`}>
      <div className={`flex flex-wrap gap-2 items-center justify-between border-b ${ui.border} pb-3`}>
        <h2 className="text-base font-bold text-gray-800 dark:text-neutral-200 flex items-center gap-2"><Clock aria-hidden="true" className="size-4 shrink-0" /> 待審核提案區（已載入 {pending.items.length} 筆）</h2>
        <span className={ui.badge}><ShieldCheck aria-hidden="true" className="size-4 shrink-0" />僅管理員可見此區塊</span>
      </div>
      {pending.status === 'loading' && pending.items.length === 0 && <p role="status" className="text-xs text-gray-500 dark:text-neutral-400 text-center py-4">待審核提案載入中…</p>}
      {pending.status === 'error' && <div><p role="alert" className="text-sm text-red-700 dark:text-red-400">待審核提案清單更新失敗，請重試。</p>
        <button type="button" onClick={() => void pending.refresh()} className={ui.secondaryButton}>重試待審核提案</button></div>}
      {pending.status === 'ready' && pending.items.length === 0 && <p className="text-xs text-gray-500 dark:text-neutral-400 text-center py-4">目前尚無等待審核的提案。</p>}
      {pending.items.filter(item => item.status === '待審核').map(item => <PendingProposal key={item.id} item={item} refresh={refresh} />)}
      <PageContinuation hasMore={pending.nextCursor !== null} loading={pending.status === 'loading'} onLoadMore={pending.loadMore} label="載入更多待審核提案" />
    </div>}
    <ProposalComposer refresh={refresh} />
    <div className="space-y-4">
      <h2 className="text-lg font-bold text-gray-800 dark:text-neutral-200 px-1">熱門學生提案</h2>
      {linked.message && <div className="flex flex-wrap items-center gap-3">
        <p role="alert" className="text-sm text-red-700 dark:text-red-400">{linked.message}</p>
        {linked.canRefresh && <button type="button" onClick={() => void linked.refresh()} className={ui.secondaryButton}>重新載入連結項目</button>}
      </div>}
      {proposals.status === 'loading' && visible.length === 0 && <p role="status" className="text-gray-500 dark:text-neutral-400 text-center py-10">公開提案載入中…</p>}
      {proposals.status === 'error' && <div><p role="alert" className="text-sm text-red-700 dark:text-red-400">提案清單更新失敗，請重試。</p>
        <button type="button" onClick={() => void proposals.refresh()} className={ui.secondaryButton}>重試公開提案</button></div>}
      {proposals.status === 'ready' && visible.length === 0 && <p className={`${ui.card} text-gray-500 dark:text-neutral-400 text-center py-10`}>目前尚無公開提案。</p>}
      {visible.map(item => <ProposalCard key={item.id} item={item} refresh={linked.target?.id === item.id ? linked.refresh : proposals.refresh} remove={id => { proposals.remove(id); linked.remove(id); forgetDrafts('proposal', id); }} />)}
      <PageContinuation hasMore={proposals.nextCursor !== null} loading={proposals.status === 'loading'} onLoadMore={proposals.loadMore} label="載入更多公開提案" />
    </div>
  </main>;
}
