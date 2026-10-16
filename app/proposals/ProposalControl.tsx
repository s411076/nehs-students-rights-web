'use client';

import { CONTROL_STATUSES } from '@/lib/rights/contracts';
import type { ProposalDTO } from '@/lib/rights/queries';
import { useVersionedDraft } from '@/components/rights/useVersionedDraft';
import { useRightsMutation } from '@/components/rights/useRightsMutation';
import { ActionFeedback } from '@/components/rights/ActionFeedback';
import { DraftReconciliation } from '@/components/rights/DraftReconciliation';
import { useProposalControlDraft } from '@/components/rights/RightsDraftProvider';
import { PencilLine, Save, ShieldCheck } from 'lucide-react';
import { ui } from '@/components/rights/ui';

export function ProposalControl({ item, refresh }: { readonly item: ProposalDTO; readonly refresh: () => Promise<unknown> }) {
  const draft = useVersionedDraft({ status: item.status, reply: item.reply }, item.version, useProposalControlDraft(item.id));
  const mutation = useRightsMutation();
  const save = async () => {
    const value = draft.value;
    if (item.reply && !value.reply.trim() && !window.confirm('確定要清除官方回覆嗎？')) return;
    await mutation.run({ action: 'updateProposalControl', payload: {
      id: item.id, status: value.status, reply: value.reply, expectedVersion: draft.baseVersion,
    } }, refresh, receipt => draft.acknowledge(receipt, value));
  };
  return <div className={`${ui.card} p-4 space-y-3 mt-3`}>
    <div className="text-sm font-bold text-gray-800 dark:text-neutral-200 flex items-center gap-1.5"><ShieldCheck aria-hidden="true" className="size-4 shrink-0" /> 管理員控制台（修改狀態與官方回覆）：</div>
    <ActionFeedback error={mutation.error} notice={mutation.notice} />
    <div className="flex flex-col sm:flex-row items-stretch sm:items-end gap-2">
      <div className="space-y-1">
        <label htmlFor={`proposal-status-${item.id}`} className="block text-xs font-semibold text-gray-700 dark:text-neutral-300">提案狀態<span className="sr-only">：{item.title}</span></label>
        <select id={`proposal-status-${item.id}`} value={draft.value.status} disabled={mutation.busy}
          onChange={event => draft.edit({ ...draft.value, status: event.target.value })}
          className={ui.field}>
          {CONTROL_STATUSES.map(status => <option key={status} value={status}>{status}</option>)}
        </select>
      </div>
      <div className="min-w-0 flex-1 space-y-1">
        <label htmlFor={`proposal-reply-${item.id}`} className="flex items-center gap-1.5 text-xs font-semibold text-gray-700 dark:text-neutral-300"><PencilLine aria-hidden="true" className="size-4 shrink-0" />官方回覆<span className="sr-only">：{item.title}</span></label>
        <input id={`proposal-reply-${item.id}`} type="text" value={draft.value.reply} disabled={mutation.busy}
          onChange={event => draft.edit({ ...draft.value, reply: event.target.value })} placeholder="輸入官方回覆內容..."
          className={ui.field} />
      </div>
      <button type="button" onClick={() => void save()} disabled={mutation.busy}
        className={ui.primaryButton}>
        <Save aria-hidden="true" className="size-4 shrink-0" />{mutation.busy ? '儲存中...' : '儲存修改'}
      </button>
    </div>
    <DraftReconciliation stale={draft.stale} reload={refresh} reset={draft.reset} busy={mutation.busy} />
  </div>;
}
