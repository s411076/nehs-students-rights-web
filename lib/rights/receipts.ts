import { isRecord, isSafeCount } from './queries';
import type { RightsActionRequest } from './contracts';

export type MutationReceipt =
  | { readonly inserted: true; readonly id: string; readonly version: number }
  | { readonly id: string; readonly version: number }
  | { readonly id: string; readonly deleted: true }
  | { readonly id: string; readonly voted: boolean; readonly upvotes_count: number };

export function parseMutationReceipt(data: unknown, request: RightsActionRequest): MutationReceipt | null {
  if (!isRecord(data) || typeof data.id !== 'string' || data.id.length === 0) return null;
  if ('id' in request.payload && request.payload.id !== data.id) return null;
  const keys = Object.keys(data).sort().join(',');
  switch (request.action) {
    case 'createProposal': case 'createFeedback': case 'addComment': case 'createHomeSection':
      return keys === 'id,inserted,version' && data.inserted === true && isSafeCount(data.version)
        ? { id: data.id, inserted: true, version: data.version } : null;
    case 'updateProposalControl': case 'approveProposal': case 'rejectProposal': case 'saveFeedbackReply':
      return keys === 'id,version' && isSafeCount(data.version)
        ? { id: data.id, version: data.version } : null;
    case 'deleteProposal': case 'deleteFeedback': case 'deleteComment': case 'deleteHomeSection':
      return keys === 'deleted,id' && data.deleted === true ? { id: data.id, deleted: true } : null;
    case 'setVote':
      return keys === 'id,upvotes_count,voted' && data.id === request.payload.proposalId &&
        data.voted === request.payload.voted && isSafeCount(data.upvotes_count)
        ? { id: data.id, voted: data.voted, upvotes_count: data.upvotes_count } : null;
    default: return assertNever(request);
  }
}
function assertNever(value: never): never { throw new TypeError(`Unknown action: ${value}`); }
