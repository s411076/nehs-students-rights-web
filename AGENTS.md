<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# NEHS Student Rights Web

Next.js 16 App Router + Supabase. UI is Traditional Chinese; docs are English.

## Commands

- `npm run check`: typecheck, lint, Vitest, offline production build and Playwright (loopback ports 4173/4174).
- `npm run check:db`: portable migration and SQL gate (`node scripts/database/collapse-gate.mjs`); starts a fresh Docker PostgreSQL cluster from the cached Supabase image and needs no recovery container.
- `node scripts/database/regression.mjs [--restored]` and `node scripts/database/managed-principal.mjs`: require the retained local Docker container `database-recovery-parity-20261016`; do not prune it or its volume. Use the synthetic run for application integration.
- `node scripts/database/regression.mjs --export-baseline <db>`: re-export the schema-only fixture from an untouched disposable recovery clone.
- Real HTTP fixture: with Docker and the retained recovery container running, run `node scripts/local-stack/stack.mjs up`, copy the printed path into `STATE`, run `node tests/real/boundary.http.mjs "$STATE"`, then `node scripts/local-stack/stack.mjs apply "$STATE" SHA256_1 SHA256_2 SHA256_3 SHA256_4 SHA256_5 SHA256_6` (one SHA-256 per migration in `scripts/database/migrations.mjs` order), rerun `node tests/real/boundary.http.mjs "$STATE"`, and run `node tests/real/workflow.http.mjs "$STATE"`.
- Browser QA: run `node scripts/local-stack/app.mjs "$STATE"` against a fresh synthetic fixture after applying the migration chain, then open the printed `APP_URL`.
- Fixture cleanup: stop the foreground app or gateway with Ctrl-C, then run `node scripts/local-stack/stack.mjs down "$STATE"`; if SQL application fails, discard the fixture and start fresh instead of retrying on it.
- CI `check`: `npm ci`, `npx playwright install --with-deps chromium`, then `npm run check`.
- CI `check-db`: `docker pull supabase/postgres@sha256:f371b5f3f2ac0a05703f33d6e6134515fb2498cab708fb948a0aeb7481467c00`, then `npm run check:db`.
- Update CI action pins: `gh actions-lock`, then `gh actions-lock --verify`.
- Push (origin is the `woodengrass` fork; keychain helper has no token): `git -c credential.helper= -c 'credential.helper=!gh auth git-credential' push -u origin <branch>`; open PRs with `gh pr create --repo s411076/nehs-students-rights-web --head woodengrass:<branch>`.
- Wait for pull request CI: `gh pr checks <number> --repo s411076/nehs-students-rights-web --watch --fail-fast`.

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
- Only the user may resend an uncertain create, using the same idempotency key. Other uncertain outcomes reconcile via public reads.
- Queue/tab counts describe the full query-matching population, not loaded rows. Unknown counts stay unknown, never zero.

## Data

- Before touching anything in the database (tables, migrations, RLS, functions), read the Supabase agent skills first.
- Check production migration history and apply only missing versions; all six SQL migrations in `supabase/migrations/` were applied in production as of 2026-11-28.
- Ship a migration that changes RPC signatures together with the matching site release; after raw-table privileges are revoked, rolling back only the app does not work.
- Never `DISABLE RLS` or add broad grants to fix anything.

## Design

- `DESIGN.md` is the design contract (locked palette, `components/rights/ui.ts` recipes). Chrome changes are presentational only; do not change action availability, auth, or RPC behavior through styling.
