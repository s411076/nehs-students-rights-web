import { useCallback, useSyncExternalStore } from 'react';

export type DraftStore<T> = {
  readonly read: (id: string) => T | null;
  readonly write: (id: string, snapshot: T | null) => void;
  readonly subscribe: (listener: () => void) => () => void;
};
export type DraftSlot<T> = {
  readonly snapshot: T | null;
  readonly read: () => T | null;
  readonly write: (snapshot: T | null) => void;
};

export function createDraftStore<T>(): DraftStore<T> {
  const snapshots = new Map<string, T>();
  const listeners = new Set<() => void>();
  return {
    read: id => snapshots.get(id) ?? null,
    write: (id, snapshot) => {
      if (snapshot === null) snapshots.delete(id);
      else snapshots.set(id, snapshot);
      listeners.forEach(listener => { listener(); });
    },
    subscribe: listener => {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
  };
}

const serverSnapshot = () => null;
export function useDraftSlot<T>(store: DraftStore<T>, id: string): DraftSlot<T> {
  const read = useCallback(() => store.read(id), [store, id]);
  const write = useCallback((snapshot: T | null) => store.write(id, snapshot), [store, id]);
  const snapshot = useSyncExternalStore(store.subscribe, read, serverSnapshot);
  return { snapshot, read, write };
}
