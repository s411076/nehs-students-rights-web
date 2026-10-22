import { CONFLICT_DRAFT_MESSAGE } from './useRightsMutation';
import { ui } from './ui';

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
      className={ui.secondaryButton}>
      重新載入最新資料
    </button>
    {stale && <button type="button" disabled={busy} onClick={() => {
      if (window.confirm('確定捨棄此草稿並使用目前載入的最新內容嗎？')) reset();
    }} className={ui.secondaryButton}>
      捨棄草稿並使用最新內容
    </button>}
  </div>;
}
