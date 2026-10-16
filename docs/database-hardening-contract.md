# Database hardening implementation contract

Local implementation contract. Production migration remains gated on a fresh
backup, restored-stack application verification and coordinated deployment.
Existing uncommitted changes must be preserved; no commits or pushes are implied.

## User decisions

- Preserve historical articles and displayed vote totals.
- Historical votes become an immutable baseline; new ballots start empty.
- Unknown historical authors stay unknown. Never infer ownership from names.
- Only administrators may identify anonymous authors. Public projections stay
  redacted even when viewed by administrators.
- A short write-maintenance window is permitted for the eventual cutover.
- Do not delete legacy tables or columns in this implementation.

## Data boundary

Use request-scoped user JWT clients, not service-role credentials. Deny raw
application-role access to sensitive tables and unsafe legacy RPCs. Every exposed
mutation independently verifies confirmed school identity from auth.users; admin
operations also verify protected admins membership. Definer RPCs have explicit
execute grants, empty search_path and qualified object references.

## Read contract

RPCs return JSON data, not the HTTP RightsResult envelope:

    Page<T> = { items: T[], nextCursor: { created_at: string, id: string } | null }

Default p_limit=20, maximum 50, lookahead limit+1. Reject invalid limits/cursors.
Preserve exact database timestamp precision. Descending (created_at,id) for lists;
ascending for per-proposal comments. p_cursor is the cursor JSON object or null.
p_query filters title/content before pagination, maximum 100 Unicode code points.

| RPC | Parameters |
| --- | --- |
| rights_list_public_proposals | p_limit, p_cursor, p_query |
| rights_list_public_feedback | p_limit, p_cursor, p_query |
| rights_list_public_comments | p_proposal_id, p_limit, p_cursor |
| rights_list_home_sections | p_limit, p_cursor |
| rights_list_pending_proposals | p_limit, p_cursor |
| rights_list_admin_feedback | p_limit, p_cursor |
| rights_get_public_item | p_kind ('proposal' or 'feedback'), p_id |
| rights_is_admin | none; caller-only boolean |
| rights_admin_author | p_kind ('proposal', 'feedback', 'comment'), p_id |

Existing DTO fields remain. All list DTOs add version:number. Proposal DTO also
adds viewer_voted:boolean and legacy_upvotes_count:number. Counts are safe integer
JSON numbers. Public feedback omits author_name for anonymous rows; public comments
use the anonymous display label. No public DTO includes author UUID/email.
Admin author lookup returns {attribution:'known'|'legacy_unverified'|'unknown',
user_id:string|null,email:string|null,display_name:string|null}; only reliable new
attribution is known. Historical identifiers are not automatically trusted.

HTTP list endpoints use the existing RightsResult envelope containing Page<T>.
Endpoints: /api/rights/proposals, /feedback, /home-sections, /proposals/pending,
/admin/feedback, /proposals/[id]/comments, /authors, /items (all under /api/rights).
List query parameters are limit, cursor (JSON), query; targeted reads use kind,id.
Admin lists and author lookup require the server admin guard as well as DB checks.

## Mutation contract

Retain the 13-action union, replacing setVoteCount with setVote. No unsafe legacy
total-write compatibility. CamelCase payload keys map to the RPC parameters below.
All ID mutations except setVote/addComment require expectedVersion.

| Action / RPC suffix (rights_) | RPC parameters |
| --- | --- |
| createProposal / create_proposal | p_title,p_content,p_category |
| createFeedback / create_feedback | p_title,p_content,p_category,p_is_anonymous |
| addComment / add_comment | p_proposal_id,p_content,p_is_anonymous |
| setVote / set_vote | p_proposal_id,p_voted |
| updateProposalControl / update_proposal_control | p_id,p_status,p_reply,p_expected_version |
| approveProposal / approve_proposal | p_id,p_expected_version |
| rejectProposal / reject_proposal | p_id,p_expected_version |
| deleteProposal / delete_proposal | p_id,p_expected_version |
| deleteComment / delete_comment | p_id,p_proposal_id,p_expected_version |
| saveFeedbackReply / save_feedback_reply | p_id,p_reply,p_expected_version |
| deleteFeedback / delete_feedback | p_id,p_expected_version |
| createHomeSection / create_home_section | p_title,p_content |
| deleteHomeSection / delete_home_section | p_id,p_expected_version |

Receipts: create {inserted:true,id,version}; edit {id,version}; delete
{id,deleted:true}; vote {id,voted,upvotes_count}. Create derives UUID and display
attribution in DB, enforces defaults and existing Unicode-safe title rules.
Vote derives user from auth.uid(), serializes on proposal, is desired-state
idempotent, and cannot reduce historical baseline. Old ledgers are not double-counted.

version is content_version for proposals/feedback, unaffected by votes/comments.
Approve/reject require matching version AND pending status. Drafts retain their
original baseVersion across refreshes and conflicts. Private mutation history
records actor/time/before/after and survives target deletion.

SQLSTATE PT400/PT401/PT403/PT409 map to existing 400/401/403/409 result codes.
Other known native errors are classified deliberately; raw DB messages stay private.
Transport/ambiguous failures keep OUTCOME_UNKNOWN and no automatic mutation retry.

## Verification and release

Real local PostgreSQL authorization/concurrency tests are required in addition to
the fake provider suite. Test direct table/RPC access and anonymous identity leaks.
Use only synthetic identities for browser/application integration evidence.
Audit all legacy count functions/triggers before revocation or retirement.
No production writes or deployment until recovery plus application gates pass.
