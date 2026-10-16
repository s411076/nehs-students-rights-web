import type { User } from '@supabase/supabase-js';
import type { FixtureData, Row } from './supabase-data.ts';
import { admin, FixtureRpcError, isAdmin, publicProposal, requiredText, text } from './supabase-rpc-common.ts';

const fields = {
  proposals: ['id', 'title', 'content', 'author_name', 'status', 'upvotes_count', 'reply', 'created_at', 'version'],
  feedback: ['id', 'title', 'content', 'category', 'is_anonymous', 'author_name', 'reply', 'replied_at', 'created_at', 'version'],
  proposal_comments: ['id', 'proposal_id', 'content', 'author_name', 'created_at', 'version'],
  home_sections: ['id', 'title', 'content', 'created_at', 'version'],
} as const;
type Table = keyof typeof fields;
export function projectRpcRow(data: FixtureData, table: Table, context: { readonly row: Row; readonly user: User | undefined; readonly privileged?: boolean }) {
  const { row, user } = context;
  const result: Row = Object.fromEntries(fields[table].map(field => [field, row[field]]));
  if (table === 'proposals') {
    result.legacy_upvotes_count = data.legacyVotes.get(String(row.id)) ?? 0;
    result.upvotes_count = Number(result.legacy_upvotes_count) + (data.votes.get(String(row.id))?.size ?? 0);
    result.viewer_voted = data.votes.get(String(row.id))?.has(user?.id ?? '') ?? false;
  }
  if (table === 'feedback') result.is_anonymous = row.is_anonymous ?? true;
  if (row.is_anonymous !== false) {
    if (table === 'feedback') delete result.author_name;
    if (table === 'proposal_comments' || table === 'proposals') result.author_name = '匿名學生';
  } else if (table !== 'home_sections') {
    result.author_name = row.author_name ?? '匿名學生';
  }
  return result;
}
function cursor(value: unknown): { readonly created_at: string; readonly id: string } | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'object' || Array.isArray(value)) throw new FixtureRpcError(400, 'Invalid cursor');
  const row = Object.fromEntries(Object.entries(value));
  const created_at = requiredText(row.created_at, 64);
  if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,6})?(?:Z|[+-]\d\d:\d\d)$/.test(created_at) || !Number.isFinite(Date.parse(created_at))) throw new FixtureRpcError(400, 'Invalid timestamp');
  if (Object.keys(row).some(key => !['id', 'created_at'].includes(key))) throw new FixtureRpcError(400, 'Invalid cursor fields');
  return { created_at, id: requiredText(row.id, 128) };
}
// Numeric epoch microseconds retain database precision; output keeps original strings.
function micros(value: unknown) {
  const stamp = String(value);
  const fraction = /\.(\d+)/.exec(stamp)?.[1] ?? '';
  return BigInt(Date.parse(stamp)) * BigInt(1000) + BigInt(fraction.padEnd(6, '0').slice(3, 6));
}
function compare(a: Row, b: Row) {
  const delta = micros(a.created_at) - micros(b.created_at);
  return delta < BigInt(0) ? -1 : delta > BigInt(0) ? 1 : String(a.id) < String(b.id) ? -1 : a.id === b.id ? 0 : 1;
}
export function readRpc(data: FixtureData, name: string, context: { readonly body: Row; readonly user: User | undefined }): unknown {
  const { body, user } = context;
  if (name === 'rights_is_admin') return isAdmin(data, user);
  if (name === 'rights_admin_author') {
    admin(data, user);
    const table = kindTable(body.p_kind, true);
    const id = requiredText(body.p_id, 128);
    const row = data.tables[table].find(item => item.id === id);
    if (!row) return null;
    const author = data.authors.get(`${table}:${row.id}`);
    return { attribution: author ? 'known' : row.author_name ? 'legacy_unverified' : 'unknown', user_id: author?.id ?? null,
      email: author?.email ?? null, display_name: author ? row.author_name : null };
  }
  if (name === 'rights_get_public_item') {
    const table = kindTable(body.p_kind);
    const id = requiredText(body.p_id, 128);
    const row = data.tables[table].find(item => item.id === id && (table !== 'proposals' || publicProposal(item)));
    return row ? projectRpcRow(data, table, { row, user }) : null;
  }
  let table: Table;
  let privileged = false;
  let ascending = false;
  switch (name) {
    case 'rights_list_public_proposals': table = 'proposals'; break;
    case 'rights_list_public_feedback': table = 'feedback'; break;
    case 'rights_list_home_sections': table = 'home_sections'; break;
    case 'rights_list_public_comments': table = 'proposal_comments'; ascending = true; break;
    case 'rights_list_pending_proposals': admin(data, user); table = 'proposals'; privileged = true; break;
    case 'rights_list_admin_feedback': admin(data, user); table = 'feedback'; privileged = true; break;
    default: throw new FixtureRpcError(400, 'Unknown read RPC');
  }
  const limit = body.p_limit === undefined ? 20 : body.p_limit;
  if (typeof limit !== 'number' || !Number.isInteger(limit) || limit < 1 || limit > 50) throw new FixtureRpcError(400, 'Invalid limit');
  const after = cursor(body.p_cursor);
  const query = body.p_query === undefined ? '' : text(body.p_query, 100).toLowerCase();
  if (table === 'proposal_comments') {
    requiredText(body.p_proposal_id, 128);
  }
  const direction = ascending ? 1 : -1;
  const rows = data.tables[table].filter(row => {
    if (table === 'proposals' && (privileged ? row.status !== '待審核' : !publicProposal(row))) return false;
    if (table === 'proposal_comments' && (row.proposal_id !== body.p_proposal_id || !data.tables.proposals.some(proposal => proposal.id === row.proposal_id && publicProposal(proposal)))) return false;
    if (table !== 'proposal_comments' && query && ![row.title, row.content].some(value => String(value).toLowerCase().includes(query))) return false;
    return !after || compare(row, after) * direction > 0;
  }).sort((a, b) => compare(a, b) * direction);
  const page = rows.slice(0, limit);
  const last = page.at(-1);
  return { items: page.map(row => projectRpcRow(data, table, { row, user, privileged })),
    nextCursor: rows.length > limit && last ? { created_at: last.created_at, id: last.id } : null };
}
function kindTable(kind: unknown, comments = false): 'proposals' | 'feedback' | 'proposal_comments' {
  switch (kind) {
    case 'proposal': return 'proposals';
    case 'feedback': return 'feedback';
    case 'comment': if (comments) return 'proposal_comments';
  }
  throw new FixtureRpcError(400, 'Invalid kind');
}
