'use client';

import { useAuth } from '@/components/AuthProvider';
import type { ProposalDTO } from '@/lib/rights/queries';
import { useRightsMutation } from '@/components/rights/useRightsMutation';
import { ActionFeedback } from '@/components/rights/ActionFeedback';
import { AuthorReveal } from '@/components/admin/AuthorReveal';
import { Trash2 } from 'lucide-react';
import { ProposalVote } from './ProposalVote';
import { ProposalControl } from './ProposalControl';
import { ProposalComments } from './ProposalComments';
import { OfficialReply } from '@/components/rights/OfficialReply';
import { ui } from '@/components/rights/ui';

type CardProps = { readonly item: ProposalDTO; readonly refresh: () => Promise<unknown>; readonly remove: (id: string) => void };

export function ProposalCard({ item, refresh, remove }: CardProps) {
  const auth = useAuth();
  const mutation = useRightsMutation({ key: `delete-proposal:${item.id}`, label: `刪除「${item.title}」提案` });
  return <div id={`item-${item.id}`} data-rights-row className={`${ui.card} scroll-mt-20 p-5 space-y-4 relative`}>
    <ActionFeedback {...mutation.feedback} />
    <div className={`flex flex-wrap items-center justify-between gap-2 pb-2 border-b ${ui.border}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className={ui.badge}>{item.status}</span>
        <span className="text-xs text-gray-500 dark:text-neutral-400">{new Date(item.created_at).toLocaleDateString()}</span>
      </div>
      {auth.isAdmin && <button type="button" disabled={mutation.busy || !mutation.canWrite} onClick={() => {
        if (!window.confirm('確定要刪除這條提案嗎？刪除後將無法復原！')) return;
        void mutation.run({ action: 'deleteProposal', payload: { id: item.id, expectedVersion: item.version } },
          undefined, () => remove(item.id));
      }} className={ui.dangerButton}><Trash2 aria-hidden="true" className="size-4 shrink-0" /> 刪除</button>}
    </div>
    <div>
      <h3 className="text-lg font-bold text-gray-900 dark:text-neutral-200 break-words">{item.title}</h3>
      <div className="text-xs text-gray-500 dark:text-neutral-400 mt-1">提案人：{item.author_name || '學生'} • 發布時間：{new Date(item.created_at).toLocaleString()}</div>
    </div>
    <p className="text-gray-800 dark:text-neutral-300 whitespace-pre-line text-sm leading-relaxed break-words">{item.content}</p>
    <ProposalVote item={item} />
    {auth.isAdmin && <><ProposalControl item={item} refresh={refresh} /><AuthorReveal kind="proposal" id={item.id} /></>}
    {item.reply && <OfficialReply reply={item.reply} />}
    <hr className={`${ui.border} my-2`} />
    <ProposalComments item={item} />
  </div>;
}
