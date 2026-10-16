'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { readRights } from '@/lib/rights/client';
import { makeFailure } from '@/lib/rights/contracts';
import type { RightsResult } from '@/lib/rights/contracts';
import { validateId } from '@/lib/rights/validation';

function subscribe(listener: () => void) {
  window.addEventListener('hashchange', listener);
  return () => window.removeEventListener('hashchange', listener);
}
const browserHash = () => window.location.hash;
const serverHash = () => '';
type TargetRead<T> = { readonly current: () => boolean; readonly result: RightsResult<T | null> };

/** Hash targets never fall back to private admin lists. */
export function usePublicItemLink<T extends { readonly id: string }>(
  kind: 'proposal' | 'feedback', items: readonly T[], parser: (value: unknown) => T | null,
) {
  const auth = useAuth();
  const hash = useSyncExternalStore(subscribe, browserHash, serverHash);
  const id = useMemo(() => hash.startsWith('#item-') ? validateId(hash.slice(6)) : null, [hash]);
  const scope = `${auth.generation}:${auth.status}:${auth.identity?.id ?? ''}:${auth.isAdmin}:${kind}:${hash}`;
  const currentScope = useRef(scope);
  useLayoutEffect(() => { currentScope.current = scope; }, [scope]);
  const active = useRef(true);
  const sequence = useRef(0);
  const invalidate = useCallback(() => { sequence.current++; }, []);
  const listedIndex = items.findIndex(item => hash === `#item-${item.id}`);
  const listed = listedIndex !== -1;
  const [linked, setLinked] = useState<{ readonly scope: string; readonly item: T | null; readonly message: string } | null>(null);
  const [wasListed, setWasListed] = useState(listed);
  const [dismissedScope, setDismissedScope] = useState<string | null>(null);
  if (wasListed !== listed) {
    setWasListed(listed);
    setLinked(null);
  }
  const dismissed = dismissedScope === scope;
  const load = useCallback(async (): Promise<TargetRead<T>> => {
    if (!active.current || currentScope.current !== scope) return { current: () => false, result: makeFailure('UNAVAILABLE') };
    const request = ++sequence.current;
    const current = () => active.current && currentScope.current === scope && sequence.current === request;
    if (!id) return { current, result: makeFailure('INVALID_PAYLOAD') };
    if (!id.ok) return { current, result: id };
    try {
      const result = await readRights(`/api/rights/items?${new URLSearchParams({ kind, id: id.data })}`, value => {
        if (value === null) return { item: null };
        const item = parser(value);
        if (!item || item.id !== id.data) throw new TypeError('Invalid linked item');
        return { item };
      });
      return { current, result: result.ok ? { ok: true, data: result.data.item } : result };
    } catch (error) {
      if (!(error instanceof Error)) throw error;
      return { current, result: makeFailure('UNAVAILABLE') };
    }
  }, [id, kind, parser, scope]);
  const receive = useCallback((read: TargetRead<T>): RightsResult<T | null> => {
    if (!read.current()) return makeFailure('UNAVAILABLE');
    const result = read.result;
    setLinked({ scope, item: result.ok ? result.data : null, message: result.ok
      ? result.data ? '' : '此項目未公開、已刪除或無法存取。'
      : '無法載入連結項目，請重新載入。' });
    return result;
  }, [scope]);
  const refresh = useCallback(async () => receive(await load()), [load, receive]);
  useEffect(() => {
    active.current = true;
    if (!listed && !dismissed && id?.ok) void load().then(receive);
    return () => { active.current = false; invalidate(); };
  }, [load, receive, listed, dismissed, id, invalidate]);
  const target = linked?.scope === scope ? linked.item : null;
  const present = listed || (target !== null && hash === `#item-${target.id}`);
  // Async list rows can move a fetched target without changing present.
  const position = listed ? listedIndex : items.length;
  const destination = useMemo(() => present ? { id: hash.slice(1), position } : null, [hash, present, position]);
  useEffect(() => {
    if (!destination) return;
    const scroll = () => {
      const element = document.getElementById(destination.id);
      if (!element) return false;
      element.scrollIntoView({ block: 'start' });
      return true;
    };
    let frame = requestAnimationFrame(() => {
      if (!scroll()) frame = requestAnimationFrame(scroll);
    });
    return () => cancelAnimationFrame(frame);
  }, [destination]);
  return {
    target: listed ? null : target,
    message: id && !id.ok ? '連結格式不正確。' : linked?.scope === scope ? linked.message : '',
    canRefresh: id?.ok === true,
    refresh,
    remove: (id: string) => {
      if (hash === `#item-${id}`) { invalidate(); setDismissedScope(scope); }
      setLinked(previous => previous?.item?.id === id ? { ...previous, item: null } : previous);
    },
  };
}
