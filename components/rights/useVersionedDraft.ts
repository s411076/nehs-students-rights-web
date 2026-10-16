'use client';

import { isRecord, isSafeCount } from '@/lib/rights/queries';
import type { DraftSlot } from './draftStore';

export type VersionedDraftSnapshot<T> = { readonly value: T; readonly baseVersion: number; readonly dirty: boolean };

export function useVersionedDraft<T>(value: T, version: number, slot: DraftSlot<VersionedDraftSnapshot<T>>) {
  const draft = slot.snapshot;
  const retained = draft !== null && (draft.dirty || version < draft.baseVersion) ? draft : null;
  return {
    value: retained ? retained.value : value,
    baseVersion: retained ? retained.baseVersion : version,
    changed: draft?.dirty === true,
    stale: draft?.dirty === true && version > draft.baseVersion,
    edit: (next: T) => slot.write({ value: next, baseVersion: retained?.baseVersion ?? version, dirty: true }),
    reset: () => slot.write(null),
    acknowledge: (receipt: unknown, savedValue: T) => {
      if (isRecord(receipt) && isSafeCount(receipt.version) && slot.read() === draft) {
        slot.write({ value: savedValue, baseVersion: receipt.version, dirty: false });
      }
    },
  };
}
