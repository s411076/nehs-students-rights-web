import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { RouterContext } from 'next/dist/shared/lib/router-context.shared-runtime';
import type { NextRouter } from 'next/router';
import FeedbackPage from '../../app/feedback/page';
import ProposalsPage from '../../app/proposals/page';
import { useAuth } from '../../components/AuthProvider';
import { HomeSearch } from '../../components/rights/HomeSearch';
import { usePublicItemLink } from '../../components/rights/usePublicItemLink';
import { toFeedbackPublicDTO } from '../../lib/rights/queries';
import type { FeedbackPublicDTO, ProposalDTO } from '../../lib/rights/queries';

vi.mock('../../components/AuthProvider', () => ({ useAuth: vi.fn() }));

const feedback: FeedbackPublicDTO = {
  id: 'target-25', title: '目標建言', content: '公開建言內容', category: '其他',
  is_anonymous: true, reply: '', replied_at: null, created_at: '2026-01-01T00:00:00Z', version: 1,
};
const proposal: ProposalDTO = {
  id: 'target-25', title: '目標提案', content: '公開提案內容', author_name: '學生', status: '研議中',
  reply: '', created_at: '2026-01-01T00:00:00Z', version: 1,
  upvotes_count: 0, viewer_voted: false, legacy_upvotes_count: 0,
};

function deferredResponse() {
  let resolve: (response: Response) => void = () => { throw new TypeError('Missing deferred read'); };
  const promise = new Promise<Response>(done => { resolve = done; });
  return { promise, resolve };
}
const pageResponse = (items: readonly unknown[]) => Response.json({ ok: true, data: { items, nextCursor: null } });
const frames = new Map<number, FrameRequestCallback>();
let frameId = 0;
let scrollPositions: number[] = [];
function nextFrame() {
  const pending = Array.from(frames);
  frames.clear();
  for (const [, callback] of pending) callback(0);
}

beforeEach(() => {
  vi.mocked(useAuth).mockReturnValue({ status: 'anonymous', identity: null, user: null, generation: 0, isAdmin: false, isLoggedIn: false });
  window.history.replaceState(null, '', '/');
  localStorage.clear();
  frames.clear();
  frameId = 0;
  scrollPositions = [];
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frames.set(++frameId, callback);
    return frameId;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => { frames.delete(id); });
  HTMLElement.prototype.scrollIntoView = vi.fn(function (this: HTMLElement) {
    scrollPositions.push(Array.from(document.querySelectorAll('[id^="item-"]')).indexOf(this));
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

test.each(['feedback', 'proposal'] as const)('uses client navigation for a %s search result instead of reloading the document', async kind => {
  // Given real next/link (the Node entry uses RouterContext) and public search responses.
  const destination = `/${kind === 'feedback' ? 'feedback' : 'proposals'}#item-target-25`;
  const router: NextRouter = {
    basePath: '', pathname: '/', route: '/', query: {}, asPath: '/', isFallback: false, isReady: true, isPreview: false, isLocaleDomain: false,
    push: vi.fn(async (url: Parameters<NextRouter['push']>[0]) => {
      if (typeof url !== 'string') throw new TypeError('Expected a search result URL');
      window.history.pushState(null, '', url);
      return true;
    }),
    replace: vi.fn(async () => true), prefetch: vi.fn(async () => undefined),
    reload: vi.fn(), back: vi.fn(), forward: vi.fn(), beforePopState: vi.fn(),
    events: { on: vi.fn(), off: vi.fn(), emit: vi.fn() },
  };
  vi.stubGlobal('fetch', async (input: string | URL | Request) =>
    pageResponse(String(input).includes('/feedback') ? [feedback] : [proposal]));
  render(<RouterContext.Provider value={router}><HomeSearch /></RouterContext.Provider>);
  fireEvent.change(screen.getByLabelText(/搜尋全站提案與建言/), { target: { value: '目標' } });
  const result = await screen.findByRole('link', { name: kind === 'feedback' ? /目標建言/ : /目標提案/ });
  result.focus();
  expect(result).toHaveFocus();
  let clientNavigation = false;
  document.addEventListener('click', event => {
    clientNavigation = event.defaultPrevented;
    event.preventDefault(); // jsdom cannot perform a full document navigation.
  }, { once: true });
  // When the result is activated.
  fireEvent.click(result);
  // Then Next intercepts the native reload while retaining the exact fragment URL.
  expect(clientNavigation).toBe(true);
  expect(router.push).toHaveBeenCalledTimes(1);
  expect(window.location.pathname + window.location.hash).toBe(destination);
});

test.each([
  { kind: 'feedback', offPage: false, itemFirst: false },
  { kind: 'feedback', offPage: false, itemFirst: true },
  { kind: 'feedback', offPage: true, itemFirst: false },
  { kind: 'feedback', offPage: true, itemFirst: true },
  { kind: 'proposal', offPage: false, itemFirst: false },
  { kind: 'proposal', offPage: false, itemFirst: true },
  { kind: 'proposal', offPage: true, itemFirst: false },
  { kind: 'proposal', offPage: true, itemFirst: true },
] as const)('scrolls the mounted $kind target after async list placement (offPage=$offPage, itemFirst=$itemFirst)', async ({ kind, offPage, itemFirst }) => {
  // Given hash navigation before either independent public read has completed.
  const target = kind === 'feedback' ? feedback : proposal;
  window.history.pushState(null, '', `/${kind === 'feedback' ? 'feedback' : 'proposals'}#item-${target.id}`);
  const list = deferredResponse();
  const item = deferredResponse();
  const firstPage = Array.from({ length: 20 }, (_, index) => !offPage && index === 19 ? target
    : { ...target, id: `recent-${index}`, title: `近期貼文 ${index}` });
  const fetcher = vi.fn(async (input: string | URL | Request) => {
    const url = new URL(String(input), 'http://localhost');
    if (url.pathname === '/api/rights/items') return item.promise;
    if (url.pathname.endsWith('/comments')) return pageResponse([]);
    return list.promise;
  });
  vi.stubGlobal('fetch', fetcher);
  render(kind === 'feedback' ? <FeedbackPage /> : <ProposalsPage />);
  expect(HTMLElement.prototype.scrollIntoView).not.toHaveBeenCalled();
  // When item and list reads complete in either order, with a paint between them.
  const finishList = () => list.resolve(Response.json({ ok: true, data: { items: firstPage,
    nextCursor: offPage ? { created_at: target.created_at, id: 'recent-19' } : null } }));
  const finishItem = () => item.resolve(Response.json({ ok: true, data: target }));
  await act(async () => { (itemFirst ? finishItem : finishList)(); });
  act(nextFrame);
  await act(async () => { (itemFirst ? finishList : finishItem)(); });
  act(nextFrame);
  // Then the last scroll uses the real card at its final list position, with the navbar offset intact.
  const card = document.getElementById(`item-${target.id}`);
  expect(card).toHaveClass('scroll-mt-20');
  expect(HTMLElement.prototype.scrollIntoView).toHaveBeenLastCalledWith({ block: 'start' });
  expect(vi.mocked(HTMLElement.prototype.scrollIntoView).mock.instances.at(-1)).toBe(card);
  expect(scrollPositions.at(-1)).toBe(offPage ? 20 : 19);
  const reads = fetcher.mock.calls.map(([input]) => new URL(String(input), 'http://localhost'));
  expect(reads.find(url => url.pathname === '/api/rights/items')?.searchParams.get('kind')).toBe(kind);
  expect(reads.some(url => url.searchParams.has('cursor'))).toBe(false);
});

function DelayedCard({ mounted }: { readonly mounted: boolean }) {
  usePublicItemLink('feedback', [feedback], toFeedbackPublicDTO);
  return mounted ? <div id={`item-${feedback.id}`} /> : null;
}

test('retries scrolling on the next frame when a present target card has not mounted yet', () => {
  // Given a present list target whose DOM card is not mounted at the first lookup.
  window.history.replaceState(null, '', '/feedback#item-target-25');
  const view = render(<DelayedCard mounted={false} />);
  act(nextFrame);
  expect(HTMLElement.prototype.scrollIntoView).not.toHaveBeenCalled();
  // When the card mounts without changing the hash or present state.
  view.rerender(<DelayedCard mounted />);
  act(nextFrame);
  // Then the retry scrolls the mounted card rather than silently abandoning the link.
  expect(vi.mocked(HTMLElement.prototype.scrollIntoView).mock.instances.at(-1)).toBe(document.getElementById('item-target-25'));
  expect(HTMLElement.prototype.scrollIntoView).toHaveBeenCalledWith({ block: 'start' });
});

test('cancels a pending target scroll when the page unmounts', () => {
  // Given a scroll waiting for a target card to mount.
  window.history.replaceState(null, '', '/feedback#item-target-25');
  const view = render(<DelayedCard mounted={false} />);
  act(nextFrame);
  // When navigation unmounts the old page.
  view.unmount();
  act(nextFrame);
  // Then no old-page retry or scroll remains.
  expect(frames.size).toBe(0);
  expect(HTMLElement.prototype.scrollIntoView).not.toHaveBeenCalled();
});

test.each(['feedback', 'proposal'] as const)('keeps an unavailable %s target unrendered and unscrolled', async kind => {
  // Given a deleted or non-public target returned as null by the public endpoint.
  window.history.replaceState(null, '', `/${kind === 'feedback' ? 'feedback' : 'proposals'}#item-target-25`);
  vi.stubGlobal('fetch', async (input: string | URL | Request) => String(input).includes('/items?')
    ? Response.json({ ok: true, data: null }) : pageResponse([]));
  // When the public page loads the fragment.
  render(kind === 'feedback' ? <FeedbackPage /> : <ProposalsPage />);
  // Then the existing visibility message remains, with no card or stray scroll.
  expect(await screen.findByRole('alert')).toHaveTextContent('此項目未公開、已刪除或無法存取。');
  act(nextFrame);
  expect(document.getElementById('item-target-25')).toBeNull();
  expect(HTMLElement.prototype.scrollIntoView).not.toHaveBeenCalled();
});
