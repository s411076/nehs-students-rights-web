'use client';

import { useAuth } from '@/components/AuthProvider';
import type { FeedbackPublicDTO } from '@/lib/rights/queries';
import { useRightsMutation } from '@/components/rights/useRightsMutation';
import { ActionFeedback } from '@/components/rights/ActionFeedback';
import { FeedbackReplyEditor } from '@/components/rights/FeedbackReplyEditor';
import { AuthorReveal } from '@/components/admin/AuthorReveal';
import { Trash2 } from 'lucide-react';
import { InlineSpinner } from '@/components/rights/InlineSpinner';
import { OfficialReply } from '@/components/rights/OfficialReply';
import { ui } from '@/components/rights/ui';

type CardProps = { readonly item: FeedbackPublicDTO; readonly refresh: () => Promise<unknown>; readonly remove: (id: string) => void };

export function FeedbackCard({ item, refresh, remove }: CardProps) {
  const { isAdmin } = useAuth();
  const mutation = useRightsMutation({ key: `delete-feedback:${item.id}`, label: `刪除「${item.title || item.content.slice(0, 10)}」建言` });
  return <div id={`item-${item.id}`} data-rights-row aria-busy={mutation.busy}
    className={`${ui.card} scroll-mt-20 p-5 space-y-3 relative`}>
    <ActionFeedback {...mutation.feedback} />
    <div className={`flex flex-wrap items-center justify-between gap-2 pb-2 border-b ${ui.border}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className={ui.badge}>{item.category || '其他'}</span>
        <span className="text-xs text-gray-500 dark:text-neutral-400">{new Date(item.created_at).toLocaleDateString()}</span>
      </div>
      {isAdmin && <button type="button" disabled={mutation.busy || !mutation.canWrite} onClick={() => {
        if (!window.confirm('確定要刪除這條建言嗎？刪除後將無法復原！')) return;
        void mutation.run({ action: 'deleteFeedback', payload: { id: item.id, expectedVersion: item.version } },
          undefined, () => remove(item.id));
      }} className={ui.dangerButton}>
        {mutation.busy && <InlineSpinner />} <Trash2 aria-hidden="true" className="size-4 shrink-0" /> {mutation.busy ? '刪除中...' : '刪除建言'}
      </button>}
    </div>
    {item.title && <h3 className="text-base font-bold text-gray-900 dark:text-neutral-200 break-words">{item.title}</h3>}
    <p className="text-gray-800 dark:text-neutral-300 whitespace-pre-line text-sm leading-relaxed break-words">{item.content}</p>
    <div className="text-xs text-gray-500 dark:text-neutral-400">— {item.is_anonymous ? '匿名學生' : item.author_name ?? '匿名學生'}</div>
    {item.reply && <OfficialReply reply={item.reply} repliedAt={item.replied_at} />}
    {isAdmin && <><FeedbackReplyEditor item={item} refresh={refresh} presentation="inline" /><AuthorReveal kind="feedback" id={item.id} /></>}
  </div>;
}
