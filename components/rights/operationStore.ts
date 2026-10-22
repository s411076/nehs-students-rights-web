import type { ClientMutationResult, createRightsActionFlight } from '@/lib/rights/client';
import { createDraftStore } from './draftStore';

export type OperationTarget = {
  readonly key: `${'reply' | 'control' | 'vote' | 'review' | 'delete-feedback' | 'delete-proposal' | 'comment'}:${string}`;
  readonly label: string;
};
export type OperationState = {
  readonly busy: boolean;
  readonly error: string;
  readonly notice: string;
  readonly result: ClientMutationResult | null;
  readonly flight: ReturnType<typeof createRightsActionFlight> | null;
};
export type Ballot = { readonly voted: boolean; readonly count: number; readonly uncertain: boolean };
export type FocusRecovery = (target: HTMLElement | null) => void;
type Announcement = {
  readonly label: string;
  readonly state: OperationState;
  readonly recoverFocus: FocusRecovery | null;
};
export const EMPTY_OPERATION: OperationState = { busy: false, error: '', notice: '', result: null, flight: null };

export function createOperationStore(scope: string, pageFeedback = false) {
  const operations = createDraftStore<OperationState>();
  const announcements = createDraftStore<Announcement>();
  let lifetime = new AbortController();
  return {
    scope, operations, announcements, pageFeedback,
    ballots: createDraftStore<Ballot>(),
    ballotReads: new Map<string, number>(),
    commentRefreshers: createDraftStore<() => Promise<unknown>>(),
    get signal() { return lifetime.signal; },
    activate: () => { if (lifetime.signal.aborted) lifetime = new AbortController(); },
    retire: () => { lifetime.abort(); },
    publish: (target: OperationTarget, state: OperationState, recoverFocus: FocusRecovery | null = null) => {
      operations.write(target.key, state);
      if (pageFeedback) {
        announcements.read('latest')?.recoverFocus?.(null);
        announcements.write('latest', { label: target.label, state, recoverFocus });
      }
      else recoverFocus?.(null);
    },
  };
}
export type OperationStore = ReturnType<typeof createOperationStore>;
