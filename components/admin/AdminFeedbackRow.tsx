'use client';

import type { FeedbackAdminDTO } from '@/lib/rights/queries';
import { useRightsMutation } from '@/components/rights/useRightsMutation';
import { ActionFeedback } from '@/components/rights/ActionFeedback';
import { FeedbackReplyEditor } from '@/components/rights/FeedbackReplyEditor';
import { AuthorReveal } from './AuthorReveal';

type RowProps = {
  readonly item: FeedbackAdminDTO;
  readonly refresh: () => Promise<unknown>;
  readonly onDeleted: (id: string) => void;
  readonly onDenied: () => void;
};

export function AdminFeedbackRow({ item, refresh, onDeleted, onDenied }: RowProps) {
  const mutation = useRightsMutation();
  const remove = async () => {
    if (!window.confirm('確定要刪除此建言嗎？')) return;
    const result = await mutation.run({ action: 'deleteFeedback', payload: { id: item.id, expectedVersion: item.version } });
    if (!result) return;
    if (result.ok) onDeleted(item.id);
    else if (result.code === 'UNAUTHORIZED' || result.code === 'FORBIDDEN') onDenied();
  };
  return <article className="p-5 bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-800 shadow-sm space-y-4">
    <div className="text-sm text-gray-600 dark:text-slate-400">{item.category} · {new Date(item.created_at).toLocaleString()}</div>
    <h2 className="font-bold text-gray-800 dark:text-slate-200 break-words">{item.title}</h2>
    <p className="text-gray-800 dark:text-slate-300 whitespace-pre-line break-words">{item.content}</p>
    <p className="text-sm text-gray-600 dark:text-slate-400">發布者：{item.is_anonymous ? '匿名同學' : item.author_name || '學生'}</p>
    <AuthorReveal kind="feedback" id={item.id} />
    <FeedbackReplyEditor item={item} refresh={refresh} presentation="panel" onDenied={onDenied} actions={
      <button type="button" disabled={mutation.busy} onClick={() => void remove()}
        className="min-h-11 px-4 py-2 rounded-lg border border-gray-300 dark:border-slate-700 text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/50 disabled:opacity-50">刪除建言</button>
    } />
    <ActionFeedback error={mutation.error} notice={mutation.notice} />
  </article>;
}
