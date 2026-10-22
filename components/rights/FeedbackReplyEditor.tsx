'use client';

import type { ReactNode } from 'react';
import { PencilLine, Save, ShieldCheck } from 'lucide-react';
import type { FeedbackPublicDTO } from '@/lib/rights/queries';
import { useVersionedDraft } from './useVersionedDraft';
import { useRightsMutation } from './useRightsMutation';
import { ActionFeedback } from './ActionFeedback';
import { DraftReconciliation } from './DraftReconciliation';
import { InlineSpinner } from './InlineSpinner';
import { useFeedbackReplyDraft } from './RightsDraftProvider';
import { ui } from './ui';

type EditorProps = {
  readonly item: FeedbackPublicDTO;
  readonly refresh: () => Promise<unknown>;
  readonly onDenied?: () => void;
  readonly presentation: 'inline' | 'panel';
  readonly actions?: ReactNode;
};

export function FeedbackReplyEditor({ item, refresh, onDenied, presentation, actions }: EditorProps) {
  const draft = useVersionedDraft(item.reply, item.version, useFeedbackReplyDraft(item.id));
  const mutation = useRightsMutation({ key: `reply:${item.id}`, label: `「${item.title || item.content.slice(0, 10)}」官方回覆` });
  const save = async () => {
    const reply = draft.value;
    if (item.reply.trim() && !reply.trim() && !window.confirm('確定要清除現有的官方回覆嗎？')) return;
    const result = await mutation.run({ action: 'saveFeedbackReply', payload: {
      id: item.id, reply, expectedVersion: draft.baseVersion,
    } }, refresh, receipt => draft.acknowledge(receipt, reply));
    if (!result) return;
    if (!result.ok && (result.code === 'UNAUTHORIZED' || result.code === 'FORBIDDEN')) onDenied?.();
  };
  let field: ReactNode;
  let buttonLabel: string;
  let label: string;
  switch (presentation) {
    case 'inline':
      label = '學權組管理員回覆區：';
      buttonLabel = '發布官方回覆';
      field = <input id={`feedback-reply-${item.id}`} type="text" value={draft.value} disabled={mutation.busy}
        onChange={event => draft.edit(event.target.value)} placeholder="請在此輸入官方回應內容..."
        aria-label={`回覆「${item.title || item.content.slice(0, 10)}」`}
        className={`${ui.field} flex-1`} />;
      break;
    case 'panel':
      label = '官方回覆';
      buttonLabel = '發布/更新回覆';
      field = <textarea id={`feedback-reply-${item.id}`} value={draft.value} rows={3} disabled={mutation.busy}
        onChange={event => draft.edit(event.target.value)}
        className={ui.field} />;
      break;
    default: return assertNever(presentation);
  }
  return <div aria-busy={mutation.busy} className={`${ui.card} p-4 space-y-3 ${presentation === 'inline' ? 'mt-3' : ''}`}>
    <div className="flex flex-wrap items-center justify-between gap-2">
      <label htmlFor={`feedback-reply-${item.id}`} className="text-sm font-bold text-gray-800 dark:text-neutral-200 flex items-center gap-1.5"><PencilLine aria-hidden="true" className="size-4 shrink-0" />{label}</label>
      <span className={ui.badge}><ShieldCheck aria-hidden="true" className="size-4 shrink-0" />管理員專用</span>
    </div>
    <div className={presentation === 'inline' ? 'flex flex-col sm:flex-row items-stretch sm:items-center gap-2' : 'space-y-3'}>
      {field}
      <div className={presentation === 'panel' ? 'flex flex-wrap justify-end gap-3' : 'contents'}>
      {actions}
      <button type="button" disabled={mutation.busy || !mutation.canWrite} onClick={() => void save()}
        className={ui.primaryButton}>
        {mutation.busy && presentation === 'inline' && <InlineSpinner />}
        <Save aria-hidden="true" className="size-4 shrink-0" />
        {mutation.busy ? '發布中...' : buttonLabel}
      </button>
      </div>
    </div>
    <ActionFeedback {...mutation.feedback} />
    <DraftReconciliation stale={draft.stale} reload={refresh} reset={draft.reset} busy={mutation.busy} />
  </div>;
}
function assertNever(value: never): never { throw new TypeError(`Unknown editor presentation: ${value}`); }
