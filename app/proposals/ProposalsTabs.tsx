import { ui } from '@/components/rights/ui';
import { PUBLIC_STATUSES } from '@/lib/rights/contracts';

const TABS = ['all', ...PUBLIC_STATUSES] as const;

export type ProposalsTab = typeof TABS[number];
type ProposalsTabsProps = {
  readonly activeTab: ProposalsTab;
  readonly onTabChange: (tab: ProposalsTab) => void;
  readonly counts: Readonly<Record<ProposalsTab, number>>;
  readonly loading: boolean;
};

export function ProposalsTabs({ activeTab, onTabChange, counts, loading }: ProposalsTabsProps) {
  return <div role="tablist" aria-label="提案狀態"
    className={`sticky top-16 z-20 flex border-b ${ui.border} bg-background`}>
    {TABS.map((tab, index) => <button key={tab} type="button" role="tab" id={`proposals-tab-${tab}`}
      aria-controls="proposals-list-panel" aria-selected={activeTab === tab} aria-busy={loading}
      tabIndex={activeTab === tab ? 0 : -1} onClick={() => onTabChange(tab)}
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
          onTabChange(nextTab);
          document.getElementById(`proposals-tab-${nextTab}`)?.focus();
        }
      }}
      className={`relative flex min-h-11 min-w-0 flex-1 flex-col items-center justify-center gap-1 px-2 py-2 text-sm text-foreground hover:bg-neutral-100 active:bg-neutral-200 dark:hover:bg-neutral-800 dark:active:bg-neutral-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-inset sm:flex-row sm:gap-2 md:px-4 ${activeTab === tab ? 'font-bold' : 'font-normal'}`}>
      <span className="whitespace-nowrap">{tab === 'all' ? '全部' : tab}</span>
      <span aria-hidden={loading} className="inline-flex h-4 w-11 shrink-0 items-center justify-center text-xs font-normal tabular-nums">
        {loading ? <span className="h-3 w-6 rounded bg-foreground/10 motion-safe:animate-pulse" /> : counts[tab]}
      </span>
      {activeTab === tab && <span aria-hidden="true" className="absolute inset-x-0 bottom-0 h-0.5 bg-primary" />}
    </button>)}
  </div>;
}
