import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { AuthorizationError, getVerifiedIdentity, requireAdmin } from '@/lib/auth/server';
import { ADMIN_ACTIONS, makeFailure, makeSuccess } from './contracts';
import type { ResultCode, RightsActionRequest, RightsResult } from './contracts';
import { parseMutationReceipt, type MutationReceipt } from './receipts';
export type { MutationReceipt } from './receipts';

const STATUS: Record<ResultCode, number> = {
  INVALID_PAYLOAD: 400, UNAUTHORIZED: 401, FORBIDDEN: 403, CONFLICT: 409,
  PAYLOAD_TOO_LARGE: 413, UNSUPPORTED_MEDIA: 415, UNAVAILABLE: 503,
};
export function rightsResponse<T>(result: RightsResult<T>) {
  return NextResponse.json(result, { status: result.ok ? 200 : STATUS[result.code], headers: { 'Cache-Control': 'private, no-store' } });
}
export function rightsException(error: unknown) {
  if (error instanceof AuthorizationError) {
    return makeFailure(error.status === 401 ? 'UNAUTHORIZED' : error.status === 403 ? 'FORBIDDEN' : 'UNAVAILABLE');
  }
  return makeFailure('UNAVAILABLE');
}
export function rightsDatabaseFailure(error: { readonly code?: string }) {
  switch (error.code) {
    case 'PT400': case '22P02': case '22003': case '22007': case '22008': case '22023': case '23502': case '23514':
      return makeFailure('INVALID_PAYLOAD');
    case 'PT401': case 'PGRST301': case 'PGRST302': case 'PGRST303': return makeFailure('UNAUTHORIZED');
    case 'PT403': case '42501': return makeFailure('FORBIDDEN');
    case 'PT409': case '23503': case '23505': case '40001': case '40P01': return makeFailure('CONFLICT');
    default: return makeFailure('UNAVAILABLE');
  }
}

export function actionRpc(request: RightsActionRequest) {
  switch (request.action) {
    case 'createProposal': return { name: 'rights_create_proposal', args: { p_title: request.payload.title, p_content: request.payload.content, p_category: request.payload.category } };
    case 'createFeedback': return { name: 'rights_create_feedback', args: { p_title: request.payload.title, p_content: request.payload.content, p_category: request.payload.category, p_is_anonymous: request.payload.isAnonymous } };
    case 'addComment': return { name: 'rights_add_comment', args: { p_proposal_id: request.payload.proposalId, p_content: request.payload.content, p_is_anonymous: request.payload.isAnonymous } };
    case 'setVote': return { name: 'rights_set_vote', args: { p_proposal_id: request.payload.proposalId, p_voted: request.payload.voted } };
    case 'updateProposalControl': return { name: 'rights_update_proposal_control', args: { p_id: request.payload.id, p_status: request.payload.status, p_reply: request.payload.reply, p_expected_version: request.payload.expectedVersion } };
    case 'approveProposal': return { name: 'rights_approve_proposal', args: { p_id: request.payload.id, p_expected_version: request.payload.expectedVersion } };
    case 'rejectProposal': return { name: 'rights_reject_proposal', args: { p_id: request.payload.id, p_expected_version: request.payload.expectedVersion } };
    case 'deleteProposal': return { name: 'rights_delete_proposal', args: { p_id: request.payload.id, p_expected_version: request.payload.expectedVersion } };
    case 'deleteComment': return { name: 'rights_delete_comment', args: { p_id: request.payload.id, p_proposal_id: request.payload.proposalId, p_expected_version: request.payload.expectedVersion } };
    case 'saveFeedbackReply': return { name: 'rights_save_feedback_reply', args: { p_id: request.payload.id, p_reply: request.payload.reply, p_expected_version: request.payload.expectedVersion } };
    case 'deleteFeedback': return { name: 'rights_delete_feedback', args: { p_id: request.payload.id, p_expected_version: request.payload.expectedVersion } };
    case 'createHomeSection': return { name: 'rights_create_home_section', args: { p_title: request.payload.title, p_content: request.payload.content } };
    case 'deleteHomeSection': return { name: 'rights_delete_home_section', args: { p_id: request.payload.id, p_expected_version: request.payload.expectedVersion } };
    default: return assertNever(request);
  }
}
export async function executeRightsAction(client: SupabaseClient, request: RightsActionRequest): Promise<RightsResult<MutationReceipt>> {
  if (ADMIN_ACTIONS.some(action => action === request.action)) await requireAdmin(client);
  else await getVerifiedIdentity(client);
  const rpc = actionRpc(request);
  const { data, error } = await client.rpc(rpc.name, rpc.args);
  if (error) return rightsDatabaseFailure(error);
  const receipt = parseMutationReceipt(data, request);
  return receipt ? makeSuccess(receipt) : makeFailure('UNAVAILABLE');
}
function assertNever(_value: never): never { throw new TypeError('Unknown rights action'); }
