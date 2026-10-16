type ContinuationProps = {
  readonly hasMore: boolean;
  readonly loading: boolean;
  readonly onLoadMore: () => Promise<unknown>;
  readonly label: string;
};

export function PageContinuation({ hasMore, loading, onLoadMore, label }: ContinuationProps) {
  if (!hasMore) return null;
  return <button type="button" disabled={loading} onClick={() => void onLoadMore()}
    className="min-h-11 px-4 py-2 rounded-xl bg-gray-100 dark:bg-slate-800 text-sm font-semibold text-blue-700 dark:text-blue-300 hover:bg-blue-50 dark:hover:bg-slate-700 focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-60">
    {loading ? '載入中…' : label}
  </button>;
}
