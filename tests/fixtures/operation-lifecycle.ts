import { vi } from 'vitest';
import type { AuthContextValue } from '../../components/AuthProvider';
import type { CommentDTO, FeedbackPublicDTO, ProposalDTO } from '../../lib/rights/queries';
import { feedbackQueuePage, pendingQueuePage, proposalQueuePage } from './queue-pages';

export const adminIdentity = { id: 'admin', email: 'admin@nehs.hc.edu.tw', displayName: 'Admin', isAdmin: true };
export const adminAuth = { status: 'verified', identity: adminIdentity, user: adminIdentity,
  generation: 1, isAdmin: true, isLoggedIn: true } as const satisfies AuthContextValue;
export const feedbackRow: FeedbackPublicDTO = { id: 'f1', title: 'Library hours', content: 'Open later', category: '其他',
  is_anonymous: true, reply: '', replied_at: null, created_at: '2026-01-01T00:00:00Z', version: 1 };
export const proposalRow: ProposalDTO = { id: 'p1', title: 'Library proposal', content: 'Open later', author_name: 'Student',
  status: '處理中', reply: '', created_at: '2026-01-01T00:00:00Z', version: 1,
  upvotes_count: 4, viewer_voted: false, legacy_upvotes_count: 4 };

export function deferredResponse() {
  let resolve: (response: Response) => void = () => { throw new TypeError('Missing delayed operation'); };
  const promise = new Promise<Response>(done => { resolve = done; });
  return { promise, resolve };
}

export function installOperationFetch(action: (init: RequestInit) => Response | Promise<Response>, readItem?: () => Response | Promise<Response>) {
  const population: { feedback: FeedbackPublicDTO[]; proposals: ProposalDTO[]; comments: CommentDTO[] } = {
    feedback: [feedbackRow], proposals: [proposalRow], comments: [],
  };
  const fetcher = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const path = String(input);
    const url = new URL(path, 'http://localhost');
    if (init?.method === 'POST') return action(init);
    if (url.pathname === '/api/rights/items') return readItem ? readItem() : Response.json({ ok: true, data: population.proposals[0] });
    if (url.pathname.endsWith('/comments')) return Response.json({ ok: true, data: { items: population.comments, nextCursor: null } });
    const kind = url.searchParams.get('kind');
    const page = kind === 'feedback' ? feedbackQueuePage(population.feedback, path)
      : kind === 'pending' ? pendingQueuePage([], path) : proposalQueuePage(population.proposals, path);
    return Response.json({ ok: true, data: page });
  });
  vi.stubGlobal('fetch', fetcher);
  return { population, fetcher, posts: () => fetcher.mock.calls.filter(([, init]) => init?.method === 'POST') };
}
