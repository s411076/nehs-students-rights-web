import { useMemo } from 'react';
import { useAuth } from '../../components/AuthProvider';
import { FeedbackCard } from '../../app/feedback/FeedbackCard';
import { RightsDraftProvider, useForgetItemDrafts } from '../../components/rights/RightsDraftProvider';
import { useRightsPage } from '../../components/rights/useRightsPage';
import { PageContinuation } from '../../components/rights/PageContinuation';
import { toFeedbackPublicDTO, type FeedbackPublicDTO } from '../../lib/rights/queries';
import type { PageCursor } from '../../lib/rights/pagination';

type Props = { readonly feedback: readonly FeedbackPublicDTO[]; readonly nextCursor: PageCursor | null };

export function InlineFeedbackList(props: Props) {
  const auth = useAuth();
  return <RightsDraftProvider><FeedbackList key={`${auth.identity?.id}:${auth.generation}`} {...props} /></RightsDraftProvider>;
}

function FeedbackList({ feedback, nextCursor }: Props) {
  const initialPage = useMemo(() => ({ items: [...feedback], nextCursor }), [feedback, nextCursor]);
  const list = useRightsPage('/api/rights/feedback', toFeedbackPublicDTO, { initialPage });
  const forgetDrafts = useForgetItemDrafts();
  return <section>
    <button type="button" onClick={() => void list.refresh()}>重新載入建言清單</button>
    {list.items.map(item => <article key={item.id}><FeedbackCard item={item} refresh={list.refresh}
      remove={id => { list.remove(id); forgetDrafts('feedback', id); }} /></article>)}
    <PageContinuation hasMore={list.nextCursor !== null} loading={list.status === 'loading'} onLoadMore={list.loadMore} label="載入更多建言" />
  </section>;
}
