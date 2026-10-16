'use client';

import type { ProposalDTO } from '@/lib/rights/queries';
import { useRightsMutation } from '@/components/rights/useRightsMutation';
import { ActionFeedback } from '@/components/rights/ActionFeedback';
import { AuthorReveal } from '@/components/admin/AuthorReveal';
import { Check, Clock, X } from 'lucide-react';
import { ui } from '@/components/rights/ui';

export function PendingProposal({ item, refresh }: { readonly item: ProposalDTO; readonly refresh: () => Promise<unknown> }) {
  const mutation = useRightsMutation();
  const review = (action: 'approveProposal' | 'rejectProposal') => {
    if (action === 'rejectProposal' && !window.confirm('確定要退回這項提案嗎？')) return;
    void mutation.run({ action, payload: { id: item.id, expectedVersion: item.version } }, refresh);
  };
  return <div id={`item-${item.id}`} className={`${ui.card} scroll-mt-20 p-4 space-y-2`}>
    <div className="flex flex-wrap items-center justify-between gap-2">
      <span className={ui.badge}><Clock aria-hidden="true" className="size-4 shrink-0" />待審核</span>
      <span className="text-xs text-gray-500 dark:text-neutral-400">{new Date(item.created_at).toLocaleDateString()}</span>
    </div>
    <h3 className="text-base font-bold text-gray-900 dark:text-neutral-200">{item.title}</h3>
    <p className="text-sm text-gray-700 dark:text-neutral-300 whitespace-pre-line">{item.content}</p>
    <div className="text-xs text-gray-500 dark:text-neutral-400">提案人：{item.author_name || '學生'}</div>
    <AuthorReveal kind="proposal" id={item.id} />
    <ActionFeedback error={mutation.error} notice={mutation.notice} />
    {mutation.error && <button type="button" onClick={() => void refresh()} className={ui.secondaryButton}>重新載入最新資料</button>}
    <div className={`flex flex-wrap items-center gap-2 pt-2 border-t ${ui.border} justify-end`}>
      <button type="button" disabled={mutation.busy} onClick={() => review('approveProposal')} className={ui.primaryButton}><Check aria-hidden="true" className="size-4 shrink-0" /> 核可發布</button>
      <button type="button" disabled={mutation.busy} onClick={() => review('rejectProposal')} className={ui.secondaryButton}><X aria-hidden="true" className="size-4 shrink-0" /> 退回提案</button>
    </div>
  </div>;
}
