import { CONFLICT_DRAFT_MESSAGE } from './useRightsMutation';

type ReconciliationProps = {
  readonly stale: boolean;
  readonly reload: () => Promise<unknown>;
  readonly reset: () => void;
  readonly busy: boolean;
};

export function DraftReconciliation({ stale, reload, reset, busy }: ReconciliationProps) {
  return <div className="flex flex-wrap items-center gap-3 text-sm">
    {stale && <p className="w-full text-red-700 dark:text-red-400">{CONFLICT_DRAFT_MESSAGE}</p>}
    <button type="button" disabled={busy} onClick={() => void reload()}
      className="min-h-11 font-semibold underline text-blue-700 dark:text-blue-300 focus-visible:ring-2 focus-visible:ring-blue-500 rounded">
      重新載入最新資料
    </button>
    {stale && <button type="button" disabled={busy} onClick={() => {
      if (window.confirm('確定捨棄此草稿並使用目前載入的最新內容嗎？')) reset();
    }} className="min-h-11 font-semibold underline text-gray-700 dark:text-slate-300 focus-visible:ring-2 focus-visible:ring-blue-500 rounded">
      捨棄草稿並使用最新內容
    </button>}
  </div>;
}
