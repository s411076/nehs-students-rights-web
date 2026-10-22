import { ui } from '@/components/rights/ui';
import type { FeedbackQueueCounts } from '@/lib/rights/queues';

const TABS = [
  { id: 'all', label: '全部' },
  { id: 'awaiting', label: '待回覆' },
  { id: 'replied', label: '已回覆' },
] as const;

export type FeedbackTab = typeof TABS[number]['id'];
type FeedbackTabsProps = {
  readonly activeTab: FeedbackTab;
  readonly onTabChange: (tab: FeedbackTab) => void;
  readonly counts: FeedbackQueueCounts | null;
  readonly loading: boolean;
};

export function FeedbackTabs({ activeTab, onTabChange, counts, loading }: FeedbackTabsProps) {
  return <div role="tablist" aria-label="建言回覆狀態"
    className={`sticky top-16 z-20 flex border-b ${ui.border} bg-background`}>
    {TABS.map((tab, index) => <button key={tab.id} type="button" role="tab" id={`feedback-tab-${tab.id}`}
      aria-controls="feedback-queue-panel" aria-selected={activeTab === tab.id} aria-busy={loading}
      tabIndex={activeTab === tab.id ? 0 : -1} onClick={() => onTabChange(tab.id)}
      onKeyDown={event => {
        let nextIndex: number;
        switch (event.key) {
          case 'ArrowRight': nextIndex = (index + 1) % TABS.length; break;
          case 'ArrowLeft': nextIndex = (index + TABS.length - 1) % TABS.length; break;
          case 'Home': nextIndex = 0; break;
          case 'End': nextIndex = TABS.length - 1; break;
          default: return;
        }
        event.preventDefault();
        const nextTab = TABS.at(nextIndex);
        if (nextTab) {
          onTabChange(nextTab.id);
          document.getElementById(`feedback-tab-${nextTab.id}`)?.focus();
        }
      }}
      className={`relative flex min-h-11 min-w-0 flex-1 flex-col items-center justify-center gap-1 px-2 py-2 text-sm text-foreground hover:bg-neutral-100 active:bg-neutral-200 dark:hover:bg-neutral-800 dark:active:bg-neutral-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-inset sm:flex-row sm:gap-2 sm:px-4 ${activeTab === tab.id ? 'font-bold' : 'font-normal'}`}>
      <span>{tab.label}</span>
      <span aria-hidden={loading} className="inline-flex h-4 w-11 shrink-0 items-center justify-center text-xs font-normal tabular-nums">
        {loading ? <span className="h-3 w-6 rounded bg-foreground/10 motion-safe:animate-pulse" />
          : counts === null ? <><span aria-hidden="true">—</span><span className="sr-only">總筆數無法取得</span></> : counts[tab.id]}
      </span>
      {activeTab === tab.id && <span aria-hidden="true" className="absolute inset-x-0 bottom-0 h-0.5 bg-primary" />}
    </button>)}
  </div>;
}
