import { useState } from 'react';
import type { ProposalDTO } from '@/lib/rights/queries';
import { useRightsMutation } from '@/components/rights/useRightsMutation';
import { ActionFeedback } from '@/components/rights/ActionFeedback';
import { AuthorReveal } from '@/components/admin/AuthorReveal';
import { ChevronDown } from 'lucide-react';
import { ui } from '@/components/rights/ui';

export function PendingProposal({ item, refresh }: { readonly item: ProposalDTO; readonly refresh: () => Promise<unknown> }) {
  const mutation = useRightsMutation();
  const [expanded, setExpanded] = useState(false);
  const review = (action: 'approveProposal' | 'rejectProposal') => {
    if (action === 'rejectProposal' && !window.confirm('確定要退回這項提案嗎？')) return;
    setExpanded(true);
    void mutation.run({ action, payload: { id: item.id, expectedVersion: item.version } }, refresh);
  };
  return <div className={`border-b ${ui.border} py-2 last:border-b-0`}>
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <a href={`#item-${item.id}`} title={item.title}
        className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-xl p-2 text-foreground hover:bg-neutral-100 active:bg-neutral-200 dark:hover:bg-neutral-800 dark:active:bg-neutral-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-inset">
        <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-muted-foreground" />
        <span className="sr-only">待審核</span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold">{item.title}</h3>
          <p className="text-xs text-muted-foreground"><time dateTime={item.created_at}>{new Date(item.created_at).toLocaleDateString()}</time> · {item.upvotes_count} 票</p>
        </div>
      </a>
      <div className="flex flex-wrap items-center justify-end gap-2 sm:shrink-0">
        <button type="button" disabled={mutation.busy} onClick={event => {
          event.stopPropagation(); review('approveProposal');
        }} className={`${ui.primaryButton} min-w-11`}>核准上架</button>
        <button type="button" disabled={mutation.busy} onClick={event => {
          event.stopPropagation(); review('rejectProposal');
        }} className={`${ui.secondaryButton} min-w-11`}>退回提案</button>
        <button type="button" aria-label={`提案詳情：${item.title}`} aria-expanded={expanded}
          aria-controls={`pending-detail-${item.id}`} onClick={event => {
            event.stopPropagation(); setExpanded(value => !value);
          }} className={ui.iconButton}>
          <ChevronDown aria-hidden="true" className={`size-4 shrink-0 ${expanded ? 'rotate-180' : ''}`} />
        </button>
      </div>
    </div>
    <div id={`pending-detail-${item.id}`} hidden={!expanded} className="space-y-2 p-2">
      <p className="text-sm text-foreground whitespace-pre-line wrap-anywhere">{item.content}</p>
      <div className="text-xs text-muted-foreground wrap-anywhere">提案人：{item.author_name || '學生'}</div>
      <AuthorReveal kind="proposal" id={item.id} />
      <ActionFeedback error={mutation.error} notice={mutation.notice} />
      {mutation.error && <button type="button" onClick={() => void refresh()} className={ui.secondaryButton}>重新載入最新資料</button>}
    </div>
  </div>;
}
