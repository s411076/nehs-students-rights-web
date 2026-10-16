'use client';

import { useAuth } from '@/components/AuthProvider';
import type { ProposalDTO } from '@/lib/rights/queries';
import { useRightsMutation } from '@/components/rights/useRightsMutation';
import { ActionFeedback } from '@/components/rights/ActionFeedback';
import { AuthorReveal } from '@/components/admin/AuthorReveal';
import { ProposalVote } from './ProposalVote';
import { ProposalControl } from './ProposalControl';
import { ProposalComments } from './ProposalComments';

type CardProps = { readonly item: ProposalDTO; readonly refresh: () => Promise<unknown>; readonly remove: (id: string) => void };

export function ProposalCard({ item, refresh, remove }: CardProps) {
  const auth = useAuth();
  const mutation = useRightsMutation();
  return <div id={`item-${item.id}`} className="scroll-mt-20 p-5 bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-800 shadow-sm space-y-4 relative">
    <ActionFeedback error={mutation.error} notice={mutation.notice} />
    <div className="flex items-center justify-between pb-1 border-b border-gray-100 dark:border-slate-800">
      <div className="flex items-center gap-2">
        <span className="px-2.5 py-1 bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-300 text-xs font-semibold rounded-full border border-blue-200 dark:border-slate-700">{item.status}</span>
        <span className="text-xs text-gray-400 dark:text-slate-400">{new Date(item.created_at).toLocaleDateString()}</span>
      </div>
      {auth.isAdmin && <button type="button" disabled={mutation.busy} onClick={() => {
        if (!window.confirm('⚠️ 確定要刪除這條提案嗎？刪除後將無法復原！')) return;
        void mutation.run({ action: 'deleteProposal', payload: { id: item.id, expectedVersion: item.version } })
          .then(result => { if (result?.ok) remove(item.id); });
      }} className="min-h-11 text-xs px-2.5 py-1 bg-red-50 dark:bg-red-950/50 hover:bg-red-100 dark:hover:bg-red-900/60 text-red-600 dark:text-red-400 font-medium rounded-lg border border-red-200 dark:border-slate-700 transition flex items-center gap-1">🗑️ 刪除</button>}
    </div>
    <div>
      <h3 className="text-lg font-bold text-gray-900 dark:text-slate-200 break-words">{item.title}</h3>
      <div className="text-xs text-gray-400 dark:text-slate-400 mt-1">提案人：{item.author_name || '學生'} • 發布時間：{new Date(item.created_at).toLocaleString()}</div>
    </div>
    <p className="text-gray-800 dark:text-slate-300 whitespace-pre-line text-sm leading-relaxed break-words">{item.content}</p>
    <ProposalVote item={item} />
    {auth.isAdmin && <><ProposalControl item={item} refresh={refresh} /><AuthorReveal kind="proposal" id={item.id} /></>}
    {item.reply && <div className="p-4 bg-purple-50/80 dark:bg-purple-950/40 rounded-xl space-y-1 mt-2">
      <div className="font-bold text-purple-900 dark:text-purple-300 flex items-center gap-1 text-xs">📢 學權組官方回覆：</div>
      <p className="text-purple-950 dark:text-slate-200 text-sm whitespace-pre-line">{item.reply}</p>
    </div>}
    <hr className="border-gray-100 dark:border-slate-800 my-2" />
    <ProposalComments item={item} />
  </div>;
}
