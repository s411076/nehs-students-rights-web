# Student rights behavior index

Paths below are relative to `tests/`. PostgreSQL assertions run against the migrated synthetic legacy schema, not the HTTP simulator.

## Identity and access
- A1 Each privileged request verifies with Auth; revoked, absent, unconfirmed and non-school identities cannot use cached or claimed privileges. — `integration/server-auth.test.ts`
- A2 Only a confirmed full school email and a positive caller-only admin lookup confer admin access; membership lookup failure fails closed. — `integration/server-auth.test.ts`, `database/regression.sql`
- A3 Students may create a proposal, feedback or comment and set their own vote; only admins may approve, reject, edit or delete proposals, delete comments, save replies, delete feedback and create/delete home sections. — `integration/rights-actions.test.ts`
- A4 Public list/get RPCs and caller-only role checks allow guest reads; pending/admin lists, author attribution and admin mutations require an eligible admin; raw tables and private functions are inaccessible to API roles. — `database/regression.sql`, `database/queues.sql`
- A5 Pending-list, pending-queue and author routes reject ineligible callers before requesting private data. A successful guarded read forwards refreshed cookies and is not cacheable. — `integration/rights-reads.test.ts`

## Write endpoint and receipts
- W1 POST requires a matching Origin, the application request header, JSON media type and valid JSON; even streamed bodies cannot exceed 65,536 bytes. — `integration/rights-actions.test.ts`
- W2 Only allowlisted actions and exact envelope/payload keys are accepted, including matching versions for existing-row moderation. — `unit/rights-contracts.test.ts`, `integration/rights-actions.test.ts`
- W3 A successful action returns a scoped typed receipt; malformed receipts and DB errors do not disclose raw data. — `integration/rights-actions.test.ts`
- W4 Repeating a create with the same actor, key and payload recovers the original receipt; changing the payload conflicts and a different actor may reuse the key. — `database/regression.sql`
- W5 Voting sets desired state; duplicate votes/cancellations preserve count and content version, and cancellation never subtracts historical votes. — `database/regression.sql`

## Reads and queues
- R1 Public pages default to 20, cap at 50 and traverse ties by timestamp and UUID after filtering; hidden proposals and their comments stay private. — `database/regression.sql`
- R2 Public projections omit private identity; anonymous feedback omits author_name, anonymous comments use the anonymous label, and only guarded attribution identifies trusted authors. — `database/regression.sql`, `unit/rights-contracts.test.ts`
- R3 Counts describe the entire query-matching population before cursor/limit; selected total equals the corresponding tab count. — `database/queues.sql`, `unit/rights-queues.test.ts`
- R4 Unknown queue counts have no numeric badge; a known empty population shows zero. — `e2e/security-flows.spec.ts`

## Browser state, moderation and response headers
- C1 After a lost create receipt the draft remains; only an explicit resend may reuse its key and recover the single pending proposal. — `e2e/security-flows.spec.ts`
- C2 Lost vote receipts reconcile by reading public state without replay; server votes and counts take precedence over localStorage. — `e2e/security-flows.spec.ts`
- C3 Feedback moderation is inline: saving and clearing an official reply moves the item between tabs and updates counts; stale versions cannot overwrite another moderator. — `e2e/security-flows.spec.ts`, `database/regression.sql`
- C4 Profile does not query proposals for unverifiable ownership. — `e2e/security-flows.spec.ts`
- C5 Editing an uncertain proposal draft starts a new submission even when the previous request committed. — `e2e/security-flows.spec.ts`
- C6 An admin can approve a pending proposal inline and see it in the public list; approval cannot silently perform rejection. — `e2e/security-flows.spec.ts`
- H1 Live page and API responses disallow framing and MIME sniffing, constrain referrers and enforce CSP; verified session responses are not cacheable. — `e2e/security-headers.spec.ts`

## Known gaps
- G1 Historical feedback categories outside the current four can make list/queue return 503 — known bug, unguarded.
- G2 Next normalizes a 127.0.0.1 request URL to localhost and the Origin check rejects the request — known bug, unguarded.
- G3 The proxy may buffer 10 MiB before the 64 KiB action limit — known bug, unguarded.
- G4 A failed OAuth exchange with an existing session can show success — known bug, unguarded.
- G5 Uppercase UUIDs can produce a receipt mismatch and 503 — known bug, unguarded.
- G6 Pending queue can stay loading after revalidation — known bug, unguarded.
- G7 Approving then switching tabs can leave the approved row visible — known bug, unguarded.
- G8 A late page response can restore a deleted home section — known bug, unguarded.
- G9 HomeSearch can produce a hydration mismatch — known bug, unguarded.
- G10 Search history can survive logout — known bug, unguarded.
