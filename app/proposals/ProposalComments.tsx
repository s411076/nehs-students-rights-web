'use client';

import { useAuth } from '@/components/AuthProvider';
import { toCommentDTO } from '@/lib/rights/queries';
import type { CommentDTO, ProposalDTO } from '@/lib/rights/queries';
import { useRightsPage } from '@/components/rights/useRightsPage';
import { useRightsMutation } from '@/components/rights/useRightsMutation';
import { PageContinuation } from '@/components/rights/PageContinuation';
import { ActionFeedback } from '@/components/rights/ActionFeedback';
import { MessageSquareText } from 'lucide-react';
import { AuthorReveal } from '@/components/admin/AuthorReveal';
import { useProposalCommentDraft } from '@/components/rights/RightsDraftProvider';

export function ProposalComments({ item }: { readonly item: ProposalDTO }) {
  const auth = useAuth();
  const comments = useRightsPage(`/api/rights/proposals/${encodeURIComponent(item.id)}/comments`, toCommentDTO);
  const mutation = useRightsMutation();
  const draft = useProposalCommentDraft(item.id);
  const { content, anonymous } = draft.value;
  const rows = comments.items.filter(comment => comment.proposal_id === item.id);
  const remove = async (comment: CommentDTO) => {
    const result = await mutation.run({ action: 'deleteComment', payload: {
      id: comment.id, proposalId: item.id, expectedVersion: comment.version,
    } });
    if (result?.ok) comments.remove(comment.id);
  };
  return <div className="space-y-3 pt-1">
    <div className="text-xs font-bold text-gray-700 dark:text-slate-300 flex items-center gap-1"><MessageSquareText aria-hidden="true" size={14} className="shrink-0" /> 討論與留言（已載入 {rows.length} 筆）</div>
    <ActionFeedback error={mutation.error} notice={mutation.notice} />
    {mutation.error && <button type="button" onClick={() => void comments.refresh()}
      className="min-h-11 text-sm font-semibold underline text-blue-700 dark:text-blue-300 rounded focus-visible:ring-2 focus-visible:ring-blue-500">更新留言清單</button>}
    {comments.status === 'loading' && <p role="status" className="text-xs text-gray-500 dark:text-slate-400">留言載入中…</p>}
    {comments.status === 'error' && <div className="flex flex-wrap items-center gap-2 text-xs">
      <p role="alert" className="text-red-700 dark:text-red-400">留言載入失敗，請重試。</p>
      <button type="button" onClick={() => void comments.refresh()} aria-label={`重試留言：${item.title}`}
        className="min-h-11 px-3 py-2 rounded-lg bg-gray-100 dark:bg-slate-800 text-blue-700 dark:text-blue-300 font-semibold">重試留言</button>
    </div>}
    {comments.status === 'ready' && rows.length === 0 && <p className="text-xs text-gray-500 dark:text-slate-400">尚無留言，歡迎分享您的看法。</p>}
    {rows.map(comment => <div key={comment.id} className="p-3 bg-gray-50 dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 text-xs space-y-1 relative">
      <div className="flex flex-wrap gap-2 items-center justify-between text-gray-500 dark:text-slate-400">
        <span className="font-semibold text-gray-800 dark:text-slate-200 flex items-center gap-1">👤 {comment.author_name || '學生'}</span>
        <div className="flex items-center gap-2">
          <span>{new Date(comment.created_at).toLocaleString()}</span>
          {auth.isAdmin && <button type="button" disabled={mutation.busy} onClick={() => void remove(comment)} aria-label={`刪除留言：${comment.content.slice(0, 30)}`}
            className="inline-flex size-11 items-center justify-center rounded-lg text-red-500 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 font-bold">✕</button>}
        </div>
      </div>
      <p className="text-gray-800 dark:text-slate-300 text-xs">{comment.content}</p>
      {auth.isAdmin && <AuthorReveal kind="comment" id={comment.id} />}
    </div>)}
    <PageContinuation hasMore={comments.nextCursor !== null} loading={comments.status === 'loading'} onLoadMore={comments.loadMore} label={`載入更多留言：${item.title}`} />
    {auth.isLoggedIn && <div className="space-y-2 pt-2">
      <label htmlFor={`proposal-comment-${item.id}`} className="block text-xs font-semibold text-gray-700 dark:text-slate-300">新增留言<span className="sr-only">：{item.title}</span></label>
      <textarea id={`proposal-comment-${item.id}`} value={content} onChange={event => draft.edit({ ...draft.value, content: event.target.value })} rows={2} disabled={mutation.busy}
        placeholder="寫下您的看法與建議..."
        className="w-full p-2.5 border border-gray-300 dark:border-slate-700 rounded-xl bg-gray-50 dark:bg-slate-800 text-xs text-gray-800 dark:text-slate-200 dark:placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500" />
      <div className="flex flex-wrap gap-2 items-center justify-between">
        <label className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-slate-300 cursor-pointer">
          <input type="checkbox" checked={anonymous} onChange={event => draft.edit({ ...draft.value, anonymous: event.target.checked })} disabled={mutation.busy} className="w-3.5 h-3.5 text-blue-600 rounded" />
          <span>🕵️ 匿名留言 (隱藏姓名)</span>
        </label>
        <button type="button" disabled={mutation.busy} onClick={() => {
          void mutation.run({ action: 'addComment', payload: { proposalId: item.id, content, isAnonymous: anonymous } }, comments.refresh, draft.acknowledge);
        }} className="min-h-11 px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-xl transition shadow-sm disabled:opacity-50">送出留言</button>
      </div>
    </div>}
  </div>;
}
