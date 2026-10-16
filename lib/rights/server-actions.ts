import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { AuthorizationError, getVerifiedIdentity, requireAdmin } from '@/lib/auth/server';
import { ADMIN_ACTIONS, makeFailure, makeSuccess, PUBLIC_STATUSES } from './contracts';
import type { ResultCode, RightsActionRequest, RightsResult } from './contracts';
import { fallbackFeedbackTitle, formatProposalTitle } from './validation';

export type MutationReceipt = { readonly inserted: true } | { readonly id: string; readonly upvotes_count?: number };
const STATUS: Record<ResultCode, number> = {
  INVALID_PAYLOAD: 400, UNAUTHORIZED: 401, FORBIDDEN: 403, CONFLICT: 409,
  PAYLOAD_TOO_LARGE: 413, UNSUPPORTED_MEDIA: 415, UNAVAILABLE: 503,
};

export function rightsResponse<T>(result: RightsResult<T>) {
  return NextResponse.json(result, {
    status: result.ok ? 200 : STATUS[result.code], headers: { 'Cache-Control': 'private, no-store' },
  });
}

export function rightsException(error: unknown) {
  if (error instanceof AuthorizationError) {
    return makeFailure(error.status === 401 ? 'UNAUTHORIZED' : error.status === 403 ? 'FORBIDDEN' : 'UNAVAILABLE');
  }
  return makeFailure('UNAVAILABLE');
}

function returnedRow(data: unknown, expectedId: string, count?: number): RightsResult<MutationReceipt> {
  if (!Array.isArray(data) || data.length !== 1) return makeFailure('CONFLICT');
  const row: unknown = data[0];
  if (typeof row !== 'object' || row === null || !('id' in row) || row.id !== expectedId) {
    return makeFailure('UNAVAILABLE');
  }
  if (count !== undefined) {
    if (!('upvotes_count' in row) || row.upvotes_count !== count) return makeFailure('UNAVAILABLE');
    return makeSuccess({ id: expectedId, upvotes_count: count });
  }
  return makeSuccess({ id: expectedId });
}

export async function executeRightsAction(client: SupabaseClient, request: RightsActionRequest): Promise<RightsResult<MutationReceipt>> {
  const identity = ADMIN_ACTIONS.some(action => action === request.action)
    ? await requireAdmin(client) : await getVerifiedIdentity(client);
  const insert = async (table: 'proposals' | 'feedback' | 'proposal_comments' | 'home_sections', values: Record<string, unknown>) => {
    const { error } = await client.from(table).insert(values);
    return error ? makeFailure('UNAVAILABLE') : makeSuccess({ inserted: true } as const);
  };
  const update = async (table: 'proposals' | 'feedback', id: string, values: Record<string, unknown>) => {
    const { data, error } = await client.from(table).update(values).eq('id', id).select('id');
    return error ? makeFailure('UNAVAILABLE') : returnedRow(data, id);
  };
  const remove = async (table: 'proposals' | 'feedback' | 'home_sections' | 'proposal_comments', id: string, proposalId?: string) => {
    const query = client.from(table).delete().eq('id', id);
    const { data, error } = await (proposalId === undefined ? query : query.eq('proposal_id', proposalId)).select('id');
    return error ? makeFailure('UNAVAILABLE') : returnedRow(data, id);
  };
  switch (request.action) {
    case 'createProposal': {
      const title = formatProposalTitle(request.payload.title, request.payload.category);
      if (!title.ok) return title;
      return insert('proposals', { title: title.data, content: request.payload.content,
        author_name: identity.displayName, status: '待審核', upvotes_count: 0 });
    }
    case 'createFeedback': {
      const p = request.payload;
      const title = fallbackFeedbackTitle(p.title, p.content);
      return insert('feedback', { title, content: p.content, category: p.category,
        is_anonymous: p.isAnonymous, author_name: p.isAnonymous ? '匿名學生' : identity.displayName });
    }
    case 'addComment': {
      const p = request.payload;
      const { data, error } = await client.from('proposals').select('id').eq('id', p.proposalId)
        .in('status', [...PUBLIC_STATUSES]).limit(2);
      if (error) return makeFailure('UNAVAILABLE');
      const visible = returnedRow(data, p.proposalId);
      if (!visible.ok) return visible;
      return insert('proposal_comments', { proposal_id: p.proposalId, content: p.content,
        author_name: p.isAnonymous ? '匿名學生' : identity.displayName });
    }
    case 'setVoteCount': {
      const p = request.payload;
      // Client-chosen totals retain duplicate-vote/lost-update risk; this is not an atomic vote ledger.
      const { data, error } = await client.from('proposals').update({ upvotes_count: p.count })
        .eq('id', p.proposalId).in('status', [...PUBLIC_STATUSES]).select('id,upvotes_count');
      return error ? makeFailure('UNAVAILABLE') : returnedRow(data, p.proposalId, p.count);
    }
    case 'updateProposalControl':
      return update('proposals', request.payload.id, { status: request.payload.status, reply: request.payload.reply });
    case 'approveProposal': return update('proposals', request.payload.id, { status: '研議中' });
    case 'rejectProposal': return update('proposals', request.payload.id, { status: '被退回' });
    case 'deleteProposal': return remove('proposals', request.payload.id);
    case 'deleteComment': return remove('proposal_comments', request.payload.id, request.payload.proposalId);
    case 'saveFeedbackReply':
      return update('feedback', request.payload.id, { reply: request.payload.reply, replied_at: new Date().toISOString() });
    case 'deleteFeedback': return remove('feedback', request.payload.id);
    case 'createHomeSection': return insert('home_sections', { title: request.payload.title, content: request.payload.content });
    case 'deleteHomeSection': return remove('home_sections', request.payload.id);
    default: return assertNever(request);
  }
}

function assertNever(_value: never): never { throw new TypeError('Unknown rights action'); }
