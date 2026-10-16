"use client";

import { useAuth } from '@/components/AuthProvider';
import { RIGHTS_FEEDBACK_PATH } from '@/lib/rights/contracts';
import { toFeedbackPublicDTO } from '@/lib/rights/queries';
import { useRightsPage } from '@/components/rights/useRightsPage';
import { usePublicItemLink } from '@/components/rights/usePublicItemLink';
import { PageContinuation } from '@/components/rights/PageContinuation';
import { MessageSquareText, ShieldCheck } from 'lucide-react';
import { FeedbackComposer } from './FeedbackComposer';
import { FeedbackCard } from './FeedbackCard';
import { RightsDraftProvider, useForgetItemDrafts } from '@/components/rights/RightsDraftProvider';
import { ui } from '@/components/rights/ui';

export default function FeedbackPage() {
  const auth = useAuth();
  return <RightsDraftProvider><FeedbackContent key={`${auth.generation}:${auth.identity?.id ?? ''}`} /></RightsDraftProvider>;
}

function FeedbackContent() {
  const { isAdmin } = useAuth();
  const feedback = useRightsPage(RIGHTS_FEEDBACK_PATH, toFeedbackPublicDTO);
  const linked = usePublicItemLink('feedback', feedback.items, toFeedbackPublicDTO);
  const forgetDrafts = useForgetItemDrafts();
  const rows = linked.target ? [...feedback.items, linked.target] : feedback.items;
  return <main className="max-w-4xl mx-auto p-4 md:p-6 space-y-6">
    <div className={`${ui.card} flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-6`}>
      <div>
        <h1 className="text-2xl font-bold text-gray-800 dark:text-neutral-200 flex items-center gap-2"><MessageSquareText aria-hidden="true" size={18} className="shrink-0" /> 回饋與建言</h1>
        <p className="text-sm text-gray-500 dark:text-neutral-400 mt-1">歡迎向竹科實中學權組提出您的寶貴意見或學校生活中的問題！</p>
      </div>
      {isAdmin && <div className="shrink-0 self-start sm:self-center"><span className={ui.badge}><ShieldCheck aria-hidden="true" className="size-4 shrink-0" /> 您目前為學權組管理員</span></div>}
    </div>
    <FeedbackComposer refresh={feedback.refresh} />
    <div className="space-y-4">
      <h2 className="text-lg font-bold text-foreground px-1">近期建言與官方回應</h2>
      {linked.message && <div className="flex flex-wrap items-center gap-3">
        <p role="alert" className="text-sm text-red-700 dark:text-red-400">{linked.message}</p>
        {linked.canRefresh && <button type="button" onClick={() => void linked.refresh()} className={ui.secondaryButton}>重新載入連結項目</button>}
      </div>}
      {feedback.status === 'error' && <div role="alert" className="flex flex-wrap items-center gap-3 text-sm text-red-600 dark:text-red-400">
        <p>{rows.length ? '無法更新建言，已保留目前清單與回覆草稿。' : '無法載入建言，請稍後再試。'}</p>
        <button type="button" onClick={() => void feedback.refresh()} className={ui.secondaryButton}>重新載入</button>
      </div>}
      {feedback.status === 'loading' && rows.length === 0 && <p className={`${ui.card} text-gray-500 dark:text-neutral-400 text-center py-10`}>建言載入中…</p>}
      {feedback.status === 'ready' && rows.length === 0 && <p className={`${ui.card} text-gray-500 dark:text-neutral-400 text-center py-10`}>目前尚無意見回饋。</p>}
      {rows.map(item => <FeedbackCard key={item.id} item={item} refresh={linked.target?.id === item.id ? linked.refresh : feedback.refresh} remove={id => { feedback.remove(id); linked.remove(id); forgetDrafts('feedback', id); }} />)}
      <PageContinuation hasMore={feedback.nextCursor !== null} loading={feedback.status === 'loading'} onLoadMore={feedback.loadMore} label="載入更多建言" />
    </div>
  </main>;
}
