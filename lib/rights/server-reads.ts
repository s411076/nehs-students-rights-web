import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/auth/server';
import { createRouteHandlerClient } from '@/lib/supabase/server';
import { makeFailure, makeSuccess, type RightsResult } from './contracts';
import { parsePage, parsePageParameters, type Page, type PageParameters } from './pagination';
import { isPublicStatus, toAuthorDTO, toCommentDTO, toFeedbackPublicDTO, toHomeSectionDTO, toProposalDTO } from './queries';
import { rightsDatabaseFailure, rightsException, rightsResponse } from './server-actions';
import { validateId } from './validation';

export type RightsPageRpc = 'rights_list_public_proposals' | 'rights_list_public_feedback' |
  'rights_list_public_comments' | 'rights_list_home_sections' | 'rights_list_pending_proposals';
export type RightsPageRead<T> = {
  readonly rpc: RightsPageRpc;
  readonly parameters?: PageParameters;
  readonly proposalId?: string;
  readonly parse: (data: unknown) => T | null;
};

export async function readRightsPage<T>(client: SupabaseClient, read: RightsPageRead<T>): Promise<RightsResult<Page<T>>> {
  if (read.rpc === 'rights_list_pending_proposals') await requireAdmin(client);
  const p = read.parameters ?? { p_limit: 20, p_cursor: null, p_query: '' };
  const args = { p_limit: p.p_limit, p_cursor: p.p_cursor };
  const rpcArgs = read.rpc === 'rights_list_public_proposals' || read.rpc === 'rights_list_public_feedback'
    ? { ...args, p_query: p.p_query }
    : read.rpc === 'rights_list_public_comments' ? { ...args, p_proposal_id: read.proposalId } : args;
  const { data, error } = await client.rpc(read.rpc, rpcArgs);
  if (error) return rightsDatabaseFailure(error);
  const page = parsePage(data, read.parse);
  return page ? makeSuccess(page) : makeFailure('UNAVAILABLE');
}

type ReadSurface = 'proposals' | 'feedback' | 'home-sections' | 'pending' | 'comments' | 'authors' | 'items';
export async function rightsReadRoute(request: NextRequest, surface: ReadSurface, proposalId?: string) {
  let context: ReturnType<typeof createRouteHandlerClient> | undefined;
  try {
    context = createRouteHandlerClient(request);
    const client = context.supabase;
    const params = new URL(request.url).searchParams;
    const run = async (): Promise<RightsResult<unknown>> => {
      if (surface === 'authors' || surface === 'items') {
        if (surface === 'authors') await requireAdmin(client);
        const kind = params.get('kind');
        const id = validateId(params.get('id'));
        if (!id.ok || params.getAll('kind').length !== 1 || params.getAll('id').length !== 1 ||
            (kind !== 'proposal' && kind !== 'feedback' && !(surface === 'authors' && kind === 'comment'))) return makeFailure('INVALID_PAYLOAD');
        const { data, error } = await client.rpc(surface === 'authors' ? 'rights_admin_author' : 'rights_get_public_item', { p_kind: kind, p_id: id.data });
        if (error) return rightsDatabaseFailure(error);
        if (surface === 'items' && data === null) return makeSuccess(null);
        const parsed = surface === 'authors' ? toAuthorDTO(data) : kind === 'proposal' ? publicProposal(data) : toFeedbackPublicDTO(data);
        return parsed ? makeSuccess(parsed) : makeFailure('UNAVAILABLE');
      }
      const parsed = parsePageParameters(params);
      if (!parsed.ok) return parsed;
      const parameters = parsed.data;
      switch (surface) {
        case 'proposals': return readRightsPage(client, { rpc: 'rights_list_public_proposals', parameters, parse: publicProposal });
        case 'feedback': return readRightsPage(client, { rpc: 'rights_list_public_feedback', parameters, parse: toFeedbackPublicDTO });
        case 'home-sections': return readRightsPage(client, { rpc: 'rights_list_home_sections', parameters, parse: toHomeSectionDTO });
        case 'pending': return readRightsPage(client, { rpc: 'rights_list_pending_proposals', parameters, parse: toProposalDTO });
        case 'comments': {
          const id = validateId(proposalId);
          if (!id.ok) return id;
          return readRightsPage(client, { rpc: 'rights_list_public_comments', parameters, proposalId: id.data, parse: toCommentDTO });
        }
        default: return assertNever(surface);
      }
    };
    return context.applyToResponse(rightsResponse(await run()));
  } catch (error) {
    const response = rightsResponse(rightsException(error));
    try { return context ? context.applyToResponse(response) : response; }
    catch { return rightsResponse(makeFailure('UNAVAILABLE')); }
  }
}
function publicProposal(data: unknown) {
  const proposal = toProposalDTO(data);
  return proposal && isPublicStatus(proposal.status) ? proposal : null;
}
function assertNever(value: never): never { throw new TypeError(`Unknown read surface: ${value}`); }
