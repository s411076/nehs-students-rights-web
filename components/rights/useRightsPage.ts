'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { readRights } from '@/lib/rights/client';
import { makeFailure } from '@/lib/rights/contracts';
import { pagePath, parsePage } from '@/lib/rights/pagination';
import type { Page, PageCursor } from '@/lib/rights/pagination';

type PageState<T> = {
  readonly scope: string;
  readonly pages: readonly Page<T>[];
  readonly status: 'loading' | 'ready' | 'error';
};
type PageSource<T> = {
  readonly query?: string;
  readonly enabled?: boolean;
  readonly initialPage?: Page<T>;
};

/** Requests are bounded individually; a refresh retains the number of pages the reader opened. */
export function useRightsPage<T extends { readonly id: string }>(
  base: string, itemParser: (item: unknown) => T | null, source: PageSource<T> = {},
) {
  const auth = useAuth();
  const { query = '', enabled = true, initialPage } = source;
  const scope = `${auth.generation}:${auth.status}:${auth.identity?.id ?? ''}:${base}:${query}:${enabled}`;
  const currentScope = useRef(scope);
  useLayoutEffect(() => { currentScope.current = scope; }, [scope]);
  const active = useRef(true);
  const sequence = useRef(0);
  const pending = useRef(false);
  const [state, setState] = useState<PageState<T>>(() => ({
    scope, pages: initialPage ? [initialPage] : [], status: initialPage ? 'ready' : 'loading',
  }));
  const [serverPage, setServerPage] = useState(initialPage);
  if (serverPage !== initialPage) {
    setServerPage(initialPage);
    if (initialPage) setState(previous => ({ ...previous, pages: [initialPage, ...previous.pages.slice(1)] }));
  }
  const visible = state.scope === scope ? state : { scope, pages: [], status: 'loading' as const };
  const pagesRef = useRef(visible.pages);
  useLayoutEffect(() => { pagesRef.current = visible.pages; }, [visible.pages]);

  const load = useCallback(async (append: boolean) => {
    if (!enabled || (append && pending.current)) return makeFailure('UNAVAILABLE');
    const pages = pagesRef.current;
    const cursor = append ? pages.at(-1)?.nextCursor : null;
    if (append && !cursor) return makeFailure('INVALID_PAYLOAD');
    pending.current = true;
    const request = ++sequence.current;
    const current = () => active.current && currentScope.current === scope && sequence.current === request;
    setState({ scope, pages, status: 'loading' });
    const loaded: Page<T>[] = [];
    let next: PageCursor | null = cursor ?? null;
    const count = append ? 1 : Math.max(1, pages.length);
    try {
      for (let index = 0; index < count; index++) {
        const result = await readRights(pagePath(base, { limit: 20, cursor: next, query }), data => {
          const page = parsePage(data, itemParser);
          if (!page) throw new TypeError('Invalid paginated response');
          return page;
        });
        if (!current()) return makeFailure('UNAVAILABLE');
        if (!result.ok) {
          setState({ scope, pages: result.code === 'UNAUTHORIZED' || result.code === 'FORBIDDEN' ? [] : pages, status: 'error' });
          return result;
        }
        loaded.push(result.data);
        next = result.data.nextCursor;
        if (!next) break;
      }
      setState({ scope, status: 'ready', pages: append ? [...pages, ...loaded] : loaded });
      return { ok: true as const, data: loaded };
    } catch (error) {
      // Network/parsing boundary, including a rejected read adapter. Never report an empty success.
      if (current()) setState({ scope, pages, status: 'error' });
      if (!(error instanceof Error)) throw error;
      return makeFailure('UNAVAILABLE');
    } finally {
      if (sequence.current === request) pending.current = false;
    }
  }, [base, enabled, itemParser, query, scope]);

  useEffect(() => {
    active.current = true;
    if (enabled && !initialPage) void load(false);
    return () => { active.current = false; pending.current = false; };
  }, [load, enabled, initialPage]);

  const seen = new Set<string>();
  const items = visible.pages.flatMap(page => page.items).filter(item => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
  return {
    items, status: visible.status, nextCursor: visible.pages.at(-1)?.nextCursor ?? null,
    refresh: useCallback(() => load(false), [load]),
    loadMore: useCallback(() => load(true), [load]),
    remove: (id: string) => setState(previous => ({ ...previous,
      pages: previous.pages.map(page => ({ ...page, items: page.items.filter(item => item.id !== id) })),
    })),
  };
}
