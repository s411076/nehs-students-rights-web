<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# NEHS Student Rights Web

Next.js 16 App Router + Supabase. UI is Traditional Chinese; docs are English.

## Commands

- `npm run test`, `npm run typecheck`, `npm run lint`.
- Never run `npm run build` bare: static prerender of `/auth/callback` is fail-closed without public config. Use the offline prefix in README (loopback URL, fixture keys, `tests/fixtures/google-fonts.cjs`).
- Tests run against a loopback fake Auth/PostgREST provider. No real Supabase account or secret is needed; fixture fakes live only in `playwright.config.ts` and `tests/fixtures/`. Never paste a real secret anywhere.

## Security architecture (do not weaken)

- Server-first identity: every request re-verifies with `getUser()`; only confirmed full-domain `nehs.hc.edu.tw` addresses are accepted (`lib/auth/server.ts`). Admin identity only via the caller-only `rights_is_admin` RPC. Fail closed; `proxy.ts` only forwards refreshes.
- All writes go through the `POST /api/rights/actions` allowlist (4 student + 9 admin actions) with strict body parsing (Origin, JSON media type, 64KB limit). `setVote` is desired-state and idempotent; historical votes are immutable.
- Public reads use bounded `Page<T>` RPCs (default limit 20, max 50) with `PUBLIC_STATUSES` filtering. Anonymous rows omit `author_name`; attribution requires the guarded `rights_admin_author` lookup.
- There is no `/admin` page. Moderation is inline on `/feedback` and `/proposals`; home-section management is on `/`.

## Client state rules

- localStorage is never authoritative; server receipts and reads decide displayed counts and voter state.
- Uncertain outcomes reconcile via public reads, never mutation replay.
- Queue/tab counts describe the full query-matching population, not loaded rows. Unknown counts stay unknown, never zero.

## Data

- Before touching anything in the database (tables, migrations, RLS, functions), read the Supabase agent skills first.

## Design

- `DESIGN.md` is the design contract (locked palette, `components/rights/ui.ts` recipes). Chrome changes are presentational only; do not change action availability, auth, or RPC behavior through styling.
