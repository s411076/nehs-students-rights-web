'use client';

import { useAuth } from '@/components/AuthProvider';
import type { FeedbackPublicDTO } from '@/lib/rights/queries';
import { useRightsMutation } from '@/components/rights/useRightsMutation';
import { ActionFeedback } from '@/components/rights/ActionFeedback';
import { FeedbackReplyEditor } from '@/components/rights/FeedbackReplyEditor';
import { AuthorReveal } from '@/components/admin/AuthorReveal';
import { InlineSpinner } from '@/components/rights/InlineSpinner';

type CardProps = { readonly item: FeedbackPublicDTO; readonly refresh: () => Promise<unknown>; readonly remove: (id: string) => void };

export function FeedbackCard({ item, refresh, remove }: CardProps) {
  const { isAdmin } = useAuth();
  const mutation = useRightsMutation();
  return <div id={`item-${item.id}`} aria-busy={mutation.busy}
    className="scroll-mt-20 p-5 bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-800 shadow-sm space-y-3 relative">
    <ActionFeedback error={mutation.error} notice={mutation.notice} />
    <div className="flex items-center justify-between pb-2 border-b border-gray-100 dark:border-slate-800">
      <div className="flex items-center gap-2">
        <span className="px-2.5 py-1 bg-blue-50 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 text-xs font-semibold rounded-full border border-blue-100 dark:border-slate-700">{item.category || '其他'}</span>
        <span className="text-xs text-gray-500 dark:text-slate-400">{new Date(item.created_at).toLocaleDateString()}</span>
      </div>
      {isAdmin && <button type="button" disabled={mutation.busy} onClick={() => {
        if (!window.confirm('⚠️ 確定要刪除這條建言嗎？刪除後將無法復原！')) return;
        void mutation.run({ action: 'deleteFeedback', payload: { id: item.id, expectedVersion: item.version } })
          .then(result => { if (result?.ok) remove(item.id); });
      }} className="min-h-11 text-xs px-2.5 py-1 bg-red-50 dark:bg-red-950/50 hover:bg-red-100 dark:hover:bg-red-900/60 text-red-600 dark:text-red-400 font-medium rounded-lg border border-red-200 dark:border-slate-700 transition disabled:opacity-50 flex items-center gap-1">
        {mutation.busy && <InlineSpinner />} 🗑️ {mutation.busy ? '刪除中...' : '刪除建言'}
      </button>}
    </div>
    {item.title && <h3 className="text-base font-bold text-gray-900 dark:text-slate-200 break-words">{item.title}</h3>}
    <p className="text-gray-800 dark:text-slate-300 whitespace-pre-line text-sm leading-relaxed break-words">{item.content}</p>
    <div className="text-xs text-gray-500 dark:text-slate-400">— {item.is_anonymous ? '匿名學生' : item.author_name ?? '匿名學生'}</div>
    {item.reply && <div className="p-4 bg-blue-50/80 dark:bg-blue-950/50 rounded-xl space-y-1 mt-2">
      <div className="font-bold text-blue-900 dark:text-blue-300 flex items-center justify-between text-xs">
        <span className="flex items-center gap-1">📢 學權組官方回覆：</span>
        {item.replied_at && <span className="text-xs text-blue-600 dark:text-blue-400 font-normal">{new Date(item.replied_at).toLocaleDateString()}</span>}
      </div>
      <p className="text-blue-950 dark:text-slate-200 text-sm whitespace-pre-line">{item.reply}</p>
    </div>}
    {isAdmin && <><FeedbackReplyEditor item={item} refresh={refresh} presentation="inline" /><AuthorReveal kind="feedback" id={item.id} /></>}
  </div>;
}
