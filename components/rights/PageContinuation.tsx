import { ui } from './ui';

type ContinuationProps = {
  readonly hasMore: boolean;
  readonly loading: boolean;
  readonly onLoadMore: () => Promise<unknown>;
  readonly label: string;
};

export function PageContinuation({ hasMore, loading, onLoadMore, label }: ContinuationProps) {
  if (!hasMore) return null;
  return <button type="button" disabled={loading} onClick={() => void onLoadMore()}
    className={ui.secondaryButton}>
    {loading ? '載入中…' : label}
  </button>;
}
