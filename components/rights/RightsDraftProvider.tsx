'use client';

import { createContext, useContext, useState } from 'react';
import type { ReactNode } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { createDraftStore, useDraftSlot } from './draftStore';
import type { DraftStore } from './draftStore';
import type { VersionedDraftSnapshot } from './useVersionedDraft';

type ProposalControlValue = { readonly status: string; readonly reply: string };
type CommentDraft = { readonly content: string; readonly anonymous: boolean };
type Drafts = {
  readonly feedback: DraftStore<VersionedDraftSnapshot<string>>;
  readonly proposals: DraftStore<VersionedDraftSnapshot<ProposalControlValue>>;
  readonly comments: DraftStore<CommentDraft>;
};
const Context = createContext<Drafts | null>(null);
const EMPTY_COMMENT = { content: '', anonymous: false } as const;

export function RightsDraftProvider({ children }: { readonly children: ReactNode }) {
  const auth = useAuth();
  const scope = `${auth.generation}:${auth.status}:${auth.identity?.id ?? ''}:${auth.isAdmin}`;
  return <DraftOwner key={scope}>{children}</DraftOwner>;
}

function DraftOwner({ children }: { readonly children: ReactNode }) {
  const [drafts] = useState<Drafts>(() => ({
    feedback: createDraftStore(), proposals: createDraftStore(), comments: createDraftStore(),
  }));
  return <Context.Provider value={drafts}>{children}</Context.Provider>;
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
