'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { useVerification } from '@/components/VerificationContext';
import { readRights } from '@/lib/rights/client';
import { makeFailure } from '@/lib/rights/contracts';
import type { PageCursor } from '@/lib/rights/pagination';
import { parseQueuePage, queuePath, RIGHTS_QUEUE_PATH } from '@/lib/rights/queues';
import type { FeedbackQueueFilter, ProposalQueueFilter, QueueCounts, QueuePage } from '@/lib/rights/queues';

type QueueSelection =
  | { readonly kind: 'feedback'; readonly filter: FeedbackQueueFilter }
  | { readonly kind: 'proposal'; readonly filter: ProposalQueueFilter }
  | { readonly kind: 'pending'; readonly filter: 'pending' };
type QueueSource = { readonly query?: string; readonly enabled?: boolean };
type QueueSummary = { readonly counts: QueueCounts; readonly total: number };
type QueueState<T> = {
  readonly scope: string;
  readonly pages: readonly QueuePage<T>[];
  readonly summary: QueueSummary | null;
  readonly status: 'loading' | 'ready' | 'error';
};

export function useRightsQueue<T extends { readonly id: string }>(
  selection: QueueSelection, itemParser: (item: unknown) => T | null, source: QueueSource = {},
) {
  const auth = useAuth();
  const verification = useVerification();
  const verificationRef = useRef(verification);
  useLayoutEffect(() => { verificationRef.current = verification; }, [verification]);
  const { kind, filter } = selection;
  const { query = '', enabled = true } = source;
  const scope = JSON.stringify([auth.generation, auth.status, auth.identity?.id, auth.isAdmin, kind, filter, query, enabled]);
  const currentScope = useRef(scope);
  const active = useRef(true);
  const sequence = useRef(0);
  const pending = useRef<number | null>(null);
  const [state, setState] = useState<QueueState<T>>({ scope, pages: [], summary: null, status: 'loading' });
  const visible = useMemo<QueueState<T>>(() => state.scope === scope
    ? state : { scope, pages: [], summary: null, status: 'loading' }, [state, scope]);
  const stateRef = useRef(visible);
  useLayoutEffect(() => {
    currentScope.current = scope;
    sequence.current++;
    pending.current = null;
  }, [scope]);
  useLayoutEffect(() => { stateRef.current = visible; }, [visible]);

  const load = useCallback(async (append: boolean) => {
    if (!enabled || !active.current || currentScope.current !== scope || (append && pending.current !== null)) {
      return makeFailure('UNAVAILABLE');
    }
    const readiness = verificationRef.current;
    if (kind === 'pending' && !readiness.isCurrent(readiness.epoch)) return makeFailure('UNAVAILABLE');
    const previous = stateRef.current;
    const cursor = append ? previous.pages.at(-1)?.nextCursor : null;
    if (append && !cursor) return makeFailure('INVALID_PAYLOAD');
    const request = ++sequence.current;
    pending.current = request;
    const current = () => active.current && currentScope.current === scope && sequence.current === request;
    setState({ ...previous, status: 'loading' });
    const loaded: QueuePage<T>[] = [];
    let next: PageCursor | null = cursor ?? null;
    let summary: QueueSummary | null = null;
    const batchCount = append ? 1 : Math.max(1, previous.pages.length);
    try {
      for (let index = 0; index < batchCount; index++) {
        const result = await readRights(queuePath(RIGHTS_QUEUE_PATH, { kind, filter, limit: 20, cursor: next, query }),
          value => parseQueuePage(value, itemParser, kind, filter));
        if (!current()) return makeFailure('UNAVAILABLE');
        if (kind === 'pending' && !verificationRef.current.isCurrent(readiness.epoch)) {
          setState({ ...previous, summary: null, status: 'error' });
          return makeFailure('UNAVAILABLE');
        }
        if (!result.ok) {
          const pages = result.code === 'UNAUTHORIZED' || result.code === 'FORBIDDEN' ? [] : previous.pages;
          setState({ scope, pages, summary: null, status: 'error' });
          return result;
        }
        loaded.push(result.data);
        summary = { counts: result.data.counts, total: result.data.total };
        next = result.data.nextCursor;
        if (!next) break;
      }
      setState({ scope, pages: append ? [...previous.pages, ...loaded] : loaded, summary, status: 'ready' });
      return { ok: true as const, data: loaded };
    } catch (error) {
      if (current()) setState({ ...previous, summary: null, status: 'error' });
      if (!(error instanceof Error)) throw error;
      return makeFailure('UNAVAILABLE');
    } finally {
      if (pending.current === request) pending.current = null;
    }
  }, [enabled, scope, kind, filter, query, itemParser]);

  const loadRef = useRef(load);
  useLayoutEffect(() => { loadRef.current = load; }, [load]);
  const refresh = useCallback(() => loadRef.current(false), []);
  const loadMore = useCallback(() => loadRef.current(true), []);
  useEffect(() => {
    active.current = true;
    if (enabled) void load(false);
    return () => { active.current = false; pending.current = null; };
  }, [enabled, load]);

  const seen = new Set<string>();
  const items = visible.pages.flatMap(page => page.items).filter(item => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
  return {
    items, status: visible.status, counts: visible.summary?.counts ?? null, total: visible.summary?.total ?? null,
    nextCursor: visible.pages.at(-1)?.nextCursor ?? null, refresh, loadMore,
    remove: (id: string) => {
      const previous = stateRef.current;
      const updated = { ...previous, summary: null,
        pages: previous.pages.map(page => ({ ...page, items: page.items.filter(item => item.id !== id) })),
      };
      stateRef.current = updated;
      setState(updated);
      void refresh();
    },
  };
}
