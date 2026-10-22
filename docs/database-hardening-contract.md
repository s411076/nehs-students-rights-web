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

`rights_list_admin_feedback` remains a database contract; no app route calls it after removal of the separate admin page/API.

Existing DTO fields remain. All list DTOs add version:number. Proposal DTO also
adds viewer_voted:boolean and legacy_upvotes_count:number. Counts are safe integer
JSON numbers. Public feedback omits author_name for anonymous rows; public comments
use the anonymous display label. No public DTO includes author UUID/email.
Admin author lookup returns {attribution:'known'|'legacy_unverified'|'unknown',
user_id:string|null,email:string|null,display_name:string|null}; only reliable new
attribution is known. Historical identifiers are not automatically trusted.

HTTP list endpoints use the existing RightsResult envelope containing Page<T>.
Endpoints: /api/rights/proposals, /feedback, /home-sections, /proposals/pending,
/proposals/[id]/comments, /authors, /items (all under /api/rights).
List query parameters are limit, cursor (JSON), query; targeted reads use kind,id.
Pending proposal lists and author lookup require the server admin guard as well as DB checks.

## Filtered queue contract

`GET /api/rights/queue?kind=feedback|proposal|pending&filter=...&limit=20&cursor=...&query=...`
is a separate queue API; the old Page<T> RPCs and their interfaces are untouched.
Kind-specific filters only: feedback all|awaiting|replied, proposal
all|processing|closed, pending pending. Unknown or repeated query keys are rejected.

The queue envelope extends the old Page shape with required totals:

    QueuePage<T> = { items: T[], nextCursor: { created_at: string, id: string } | null,
                     total: number, counts: { all, awaiting, replied } | { all, processing, closed } | { pending } }

`total` always equals `counts[filter]`. Counts cover every query-matched row
before the selected filter/cursor/limit, computed in the same snapshot as the
items, so totals stay accurate even when a page is empty. Counts are nonnegative
safe integers, never optional or zero fallbacks. Awaiting means `reply = ''`;
whitespace replies stay nonempty (replied) per the existing contract.
Awaiting and pending queues sort oldest-first (created_at,id ASC); all other
queues sort newest-first (DESC), preserving microsecond cursor precision.
All filtered rows are reachable: the filter applies before keyset pagination,
never as a post-filter over a limited page. The pending queue requires the
strict admin actor check in the database as well as the server guard, and
public proposal counts never include pending rows. SQL entrypoint
`public.rights_queue_page` (definer, executor-owned, explicit anon +
authenticated grants; private implementation has no JWT execute grant).

TypeScript surface: `lib/rights/queues.ts` exposes QueueKind, QueueFilter,
QueueCounts, QueuePage<T>, parseQueueParameters, parseQueuePage (item parser
plus expected kind/filter), QueueParameters, queuePath and RIGHTS_QUEUE_PATH.
Server reads go through `readRightsQueue` / `rightsQueueRoute`
(`lib/rights/server-reads.ts`), reusing parsePage cursor validation, the
generic rights RPC read path, guarded error mapping and the no-store envelope.

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

Proposal status model: 待審核 (unpublished gate), 處理中 (all live undecided),
已結案 (decided), plus internal invisible 被退回. updateProposalControl
p_status accepts only 處理中 / 已結案; approveProposal lands 處理中 and
rejectProposal lands 被退回. Public list/item reads filter 處理中 / 已結案
only; pending reads filter 待審核. The decided outcome (採納 / 不採納 + 理由)
lives in the official reply text as the documented 決議：採納／不採納＋理由
convention (editor guidance/placeholder only, no hard DB validation).

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
