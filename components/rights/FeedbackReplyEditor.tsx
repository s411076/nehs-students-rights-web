'use client';

import type { ReactNode } from 'react';
import type { FeedbackPublicDTO } from '@/lib/rights/queries';
import { useVersionedDraft } from './useVersionedDraft';
import { useRightsMutation } from './useRightsMutation';
import { ActionFeedback } from './ActionFeedback';
import { DraftReconciliation } from './DraftReconciliation';
import { InlineSpinner } from './InlineSpinner';
import { useFeedbackReplyDraft } from './RightsDraftProvider';

type EditorProps = {
  readonly item: FeedbackPublicDTO;
  readonly refresh: () => Promise<unknown>;
  readonly onDenied?: () => void;
  readonly presentation: 'inline' | 'panel';
  readonly actions?: ReactNode;
};

export function FeedbackReplyEditor({ item, refresh, onDenied, presentation, actions }: EditorProps) {
  const draft = useVersionedDraft(item.reply, item.version, useFeedbackReplyDraft(item.id));
  const mutation = useRightsMutation();
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
      label = '✏️ 學權組管理員回覆區：';
      buttonLabel = '💾 發布官方回覆';
      field = <input id={`feedback-reply-${item.id}`} type="text" value={draft.value} disabled={mutation.busy}
        onChange={event => draft.edit(event.target.value)} placeholder="請在此輸入官方回應內容..."
        aria-label={`回覆「${item.title || item.content.slice(0, 10)}」`}
        className="min-w-0 flex-1 p-2.5 border border-purple-300 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-sm text-gray-800 dark:text-slate-200 dark:placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500" />;
      break;
    case 'panel':
      label = '官方回覆';
      buttonLabel = '發布/更新回覆';
      field = <textarea id={`feedback-reply-${item.id}`} value={draft.value} rows={3} disabled={mutation.busy}
        onChange={event => draft.edit(event.target.value)}
        className="w-full p-3 border border-gray-300 dark:border-slate-700 rounded-lg bg-gray-50 dark:bg-slate-800 text-gray-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500" />;
      break;
    default: return assertNever(presentation);
  }
  return <div aria-busy={mutation.busy} className={presentation === 'inline' ? 'p-4 bg-purple-50/60 dark:bg-purple-950/40 border border-purple-200 dark:border-slate-700 rounded-xl space-y-3 mt-3' : 'space-y-3'}>
    <label htmlFor={`feedback-reply-${item.id}`} className={presentation === 'inline'
      ? 'text-xs font-bold text-purple-900 dark:text-purple-300 flex items-center gap-1'
      : 'block text-sm font-bold text-blue-900 dark:text-blue-300'}>{label}</label>
    <div className={presentation === 'inline' ? 'flex flex-col sm:flex-row items-stretch sm:items-center gap-2' : 'space-y-3'}>
      {field}
      <div className={presentation === 'panel' ? 'flex flex-wrap justify-end gap-3' : 'contents'}>
      {actions}
      <button type="button" disabled={mutation.busy} onClick={() => void save()}
        className={presentation === 'inline'
          ? 'min-h-11 px-4 py-2.5 bg-purple-700 hover:bg-purple-800 text-white text-xs font-medium rounded-xl transition disabled:opacity-50 shrink-0 shadow-sm inline-flex items-center justify-center gap-1.5'
          : 'min-h-11 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50'}>
        {mutation.busy && presentation === 'inline' && <InlineSpinner />}
        {mutation.busy ? '發布中...' : buttonLabel}
      </button>
      </div>
    </div>
    <ActionFeedback error={mutation.error} notice={mutation.notice} />
    <DraftReconciliation stale={draft.stale} reload={refresh} reset={draft.reset} busy={mutation.busy} />
  </div>;
}
function assertNever(value: never): never { throw new TypeError(`Unknown editor presentation: ${value}`); }
