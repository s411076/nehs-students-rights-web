'use client';

import type { ProposalDTO } from '@/lib/rights/queries';
import { useRightsMutation } from '@/components/rights/useRightsMutation';
import { ActionFeedback } from '@/components/rights/ActionFeedback';
import { AuthorReveal } from '@/components/admin/AuthorReveal';

export function PendingProposal({ item, refresh }: { readonly item: ProposalDTO; readonly refresh: () => Promise<unknown> }) {
  const mutation = useRightsMutation();
  const review = (action: 'approveProposal' | 'rejectProposal') => {
    if (action === 'rejectProposal' && !window.confirm('確定要退回這項提案嗎？')) return;
    void mutation.run({ action, payload: { id: item.id, expectedVersion: item.version } }, refresh);
  };
  return <div id={`item-${item.id}`} className="scroll-mt-20 p-4 bg-white dark:bg-slate-800 rounded-xl border border-amber-200 dark:border-slate-700 shadow-sm space-y-2">
    <div className="flex items-center justify-between">
      <span className="px-2.5 py-0.5 bg-amber-100 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300 text-xs font-semibold rounded-full">待審核</span>
      <span className="text-xs text-gray-400 dark:text-slate-400">{new Date(item.created_at).toLocaleDateString()}</span>
    </div>
    <h3 className="text-base font-bold text-gray-900 dark:text-slate-200">{item.title}</h3>
    <p className="text-sm text-gray-700 dark:text-slate-300 whitespace-pre-line">{item.content}</p>
    <div className="text-xs text-gray-400 dark:text-slate-400">提案人：{item.author_name || '學生'}</div>
    <AuthorReveal kind="proposal" id={item.id} />
    <ActionFeedback error={mutation.error} notice={mutation.notice} />
    {mutation.error && <button type="button" onClick={() => void refresh()} className="min-h-11 text-sm underline text-blue-700 dark:text-blue-300">重新載入最新資料</button>}
    <div className="flex items-center gap-2 pt-2 border-t border-gray-100 dark:border-slate-700 justify-end">
      <button type="button" disabled={mutation.busy} onClick={() => review('approveProposal')} className="min-h-11 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs font-medium rounded-lg transition shadow-sm">✅ 核可發布</button>
      <button type="button" disabled={mutation.busy} onClick={() => review('rejectProposal')} className="min-h-11 px-3 py-1.5 bg-red-50 dark:bg-red-950/50 hover:bg-red-100 dark:hover:bg-red-900/60 text-red-600 dark:text-red-400 border border-red-200 dark:border-slate-700 text-xs font-medium rounded-lg transition">❌ 退回提案</button>
    </div>
  </div>;
}
