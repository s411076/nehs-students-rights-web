import type { User } from '@supabase/supabase-js';
import type { FixtureData, Row } from './supabase-data.ts';
import { admin, boolean, eligible, FixtureRpcError, publicProposal, recordWrite, requiredText, target, text, versioned } from './supabase-rpc-common.ts';

export const mutationRpcs = new Set([
  'rights_create_proposal', 'rights_create_feedback', 'rights_add_comment', 'rights_set_vote',
  'rights_update_proposal_control', 'rights_approve_proposal', 'rights_reject_proposal', 'rights_delete_proposal',
  'rights_delete_comment', 'rights_save_feedback_reply', 'rights_delete_feedback',
  'rights_create_home_section', 'rights_delete_home_section',
]);
const categories = ['環境與設備', '學聯與活動', '課程與教學', '其他'];
export function mutateRpc(data: FixtureData, name: string, context: { readonly body: Row; readonly user: User | undefined }): unknown {
  const { body, user } = context;
  const actor = eligible(user);
  if (!['rights_create_proposal', 'rights_create_feedback', 'rights_add_comment', 'rights_set_vote'].includes(name)) admin(data, actor);
  if (name === 'rights_set_vote') {
    const proposal = target(data.tables.proposals, body.p_proposal_id);
    if (!publicProposal(proposal)) throw new FixtureRpcError(409, 'Proposal unavailable');
    const voted = boolean(body.p_voted);
    const id = String(proposal.id);
    const ballots = data.votes.get(id) ?? new Set<string>();
    const baseline = data.legacyVotes.get(id) ?? Number(proposal.upvotes_count);
    data.legacyVotes.set(id, baseline);
    if (ballots.has(actor.id) !== voted) {
      if (voted) ballots.add(actor.id); else ballots.delete(actor.id);
      data.votes.set(id, ballots);
      proposal.upvotes_count = baseline + ballots.size;
      recordWrite(data, voted ? 'insert' : 'delete');
    }
    return { id, voted, upvotes_count: baseline + ballots.size };
  }
  if (['rights_create_proposal', 'rights_create_feedback', 'rights_add_comment', 'rights_create_home_section'].includes(name)) {
    const id = `insert-${data.counters.total + 1}`;
    const row: Row = { id, version: 1, created_at: '2026-01-02T00:00:00.000001Z' };
    let table: string;
    if (name === 'rights_add_comment') {
      const proposal = target(data.tables.proposals, body.p_proposal_id);
      if (!publicProposal(proposal)) throw new FixtureRpcError(409, 'Proposal unavailable');
      table = 'proposal_comments';
      Object.assign(row, { proposal_id: proposal.id, content: requiredText(body.p_content, 1000), is_anonymous: boolean(body.p_is_anonymous) });
    } else {
      const title = name === 'rights_create_feedback' ? text(body.p_title, 100) : requiredText(body.p_title, 100);
      const content = requiredText(body.p_content);
      if (name !== 'rights_create_home_section' && !categories.includes(String(body.p_category))) throw new FixtureRpcError(400, 'Invalid category');
      switch (name) {
        case 'rights_create_proposal':
          table = 'proposals'; Object.assign(row, { title: requiredText(title.startsWith('[') ? title : `[${body.p_category}] ${title}`, 120), content, is_anonymous: false, status: '待審核', reply: '', upvotes_count: 0 });
          data.legacyVotes.set(id, 0); break;
        case 'rights_create_feedback': {
          const points = Array.from(content);
          const feedbackTitle = title || points.slice(0, 15).join('') + (points.length > 15 ? '...' : '');
          table = 'feedback'; Object.assign(row, { title: feedbackTitle, content, category: body.p_category, is_anonymous: boolean(body.p_is_anonymous), reply: '', replied_at: null }); break;
        }
        case 'rights_create_home_section': table = 'home_sections'; Object.assign(row, { title, content }); break;
        default: throw new FixtureRpcError(400, 'Unknown create RPC');
      }
    }
    if (table !== 'home_sections') {
      const displayName = actor.user_metadata.full_name || actor.user_metadata.name || '學生';
      row.author_name = Array.from(String(displayName)).slice(0, 200).join('');
      row.user_id = actor.id; row.attribution_trusted = true;
      data.authors.set(`${table}:${id}`, actor);
    }
    data.tables[table].push(row);
    recordWrite(data, 'insert');
    return { inserted: true, id, version: 1 };
  }
  let table: string;
  switch (name) {
    case 'rights_update_proposal_control': case 'rights_approve_proposal': case 'rights_reject_proposal': case 'rights_delete_proposal': table = 'proposals'; break;
    case 'rights_save_feedback_reply': case 'rights_delete_feedback': table = 'feedback'; break;
    case 'rights_delete_comment': table = 'proposal_comments'; break;
    case 'rights_delete_home_section': table = 'home_sections'; break;
    default: throw new FixtureRpcError(400, 'Unknown mutation RPC');
  }
  const row = target(data.tables[table], body.p_id);
  versioned(row, body.p_expected_version);
  if (name === 'rights_delete_comment' && row.proposal_id !== body.p_proposal_id) throw new FixtureRpcError(409, 'Comment parent mismatch');
  if (name.startsWith('rights_delete_')) {
    data.tables[table] = data.tables[table].filter(item => item !== row);
    if (table === 'proposals') {
      data.tables.proposal_comments = data.tables.proposal_comments.filter(item => item.proposal_id !== row.id);
      data.votes.delete(String(row.id));
    }
    recordWrite(data, 'delete');
    return { id: row.id, deleted: true };
  }
  switch (name) {
    case 'rights_approve_proposal': case 'rights_reject_proposal':
      if (row.status !== '待審核') throw new FixtureRpcError(409, 'Review already completed');
      row.status = name === 'rights_approve_proposal' ? '研議中' : '被退回'; break;
    case 'rights_update_proposal_control': {
      if (!['研議中', '通過', '已採納', '不採納'].includes(String(body.p_status))) throw new FixtureRpcError(400, 'Invalid status');
      const reply = text(body.p_reply);
      row.status = body.p_status; row.reply = reply; break;
    }
    case 'rights_save_feedback_reply':
      row.reply = text(body.p_reply); row.replied_at = '2026-01-02T00:00:00Z'; break;
    default: throw new FixtureRpcError(400, 'Unknown edit RPC');
  }
  row.version = Number(row.version) + 1;
  recordWrite(data, 'update');
  return { id: row.id, version: row.version };
}
