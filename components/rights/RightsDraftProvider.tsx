'use client';

import { createContext, useCallback, useContext, useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { createDraftStore, useDraftSlot } from './draftStore';
import type { DraftStore } from './draftStore';
import type { VersionedDraftSnapshot } from './useVersionedDraft';
import { createOperationStore } from './operationStore';
import type { OperationStore } from './operationStore';

type ProposalControlValue = { readonly status: string; readonly reply: string };
type CommentDraft = { readonly content: string; readonly anonymous: boolean };
type Drafts = {
  readonly feedback: DraftStore<VersionedDraftSnapshot<string>>;
  readonly proposals: DraftStore<VersionedDraftSnapshot<ProposalControlValue>>;
  readonly comments: DraftStore<CommentDraft>;
  readonly operations: OperationStore;
};
const Context = createContext<Drafts | null>(null);
const EMPTY_COMMENT = { content: '', anonymous: false } as const;

export function RightsDraftProvider({ children, pageFeedback = false }: { readonly children: ReactNode; readonly pageFeedback?: boolean }) {
  const auth = useAuth();
  const scope = `${auth.generation}:${auth.status}:${auth.identity?.id ?? ''}:${auth.isAdmin}`;
  return <DraftOwner key={scope} scope={scope} pageFeedback={pageFeedback}>{children}</DraftOwner>;
}

function DraftOwner({ children, pageFeedback, scope }: { readonly children: ReactNode; readonly pageFeedback: boolean; readonly scope: string }) {
  const [drafts] = useState<Drafts>(() => ({
    feedback: createDraftStore(), proposals: createDraftStore(), comments: createDraftStore(),
    operations: createOperationStore(scope, pageFeedback),
  }));
  useLayoutEffect(() => {
    drafts.operations.activate();
    return drafts.operations.retire;
  }, [drafts]);
  return <Context.Provider value={drafts}>{children}</Context.Provider>;
}

export function useRightsOperationOwner() {
  return useContext(Context)?.operations ?? null;
}

export function useCommentRefresh(id: string, refresh: () => Promise<unknown>) {
  const owner = useRightsOperationOwner();
  const mounted = useRef(false);
  useLayoutEffect(() => {
    mounted.current = true;
    owner?.commentRefreshers.write(id, refresh);
    return () => {
      mounted.current = false;
      if (owner?.commentRefreshers.read(id) === refresh) owner.commentRefreshers.write(id, null);
    };
  }, [owner, id, refresh]);
  return useCallback(async () => {
    if (owner) return owner.commentRefreshers.read(id)?.();
    if (mounted.current) return refresh();
  }, [owner, id, refresh]);
}

function useDrafts() {
  const drafts = useContext(Context);
  if (!drafts) throw new TypeError('Draft hooks require RightsDraftProvider');
  return drafts;
}

export function useFeedbackReplyDraft(id: string) {
  return useDraftSlot(useDrafts().feedback, id);
}

export function useProposalControlDraft(id: string) {
  return useDraftSlot(useDrafts().proposals, id);
}

export function useProposalCommentDraft(id: string) {
  const slot = useDraftSlot(useDrafts().comments, id);
  const value = slot.snapshot ?? EMPTY_COMMENT;
  return {
    value,
    edit: slot.write,
    acknowledge: () => {
      if (slot.read() === slot.snapshot) slot.write({ ...value, content: '' });
    },
  };
}

export function useForgetItemDrafts() {
  const drafts = useDrafts();
  return (kind: 'feedback' | 'proposal', id: string) => {
    switch (kind) {
      case 'feedback': drafts.feedback.write(id, null); return;
      case 'proposal': drafts.proposals.write(id, null); drafts.comments.write(id, null); return;
      default: return assertNever(kind);
    }
  };
}
function assertNever(value: never): never { throw new TypeError(`Unknown draft kind: ${value}`); }
