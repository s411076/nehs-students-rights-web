# Synthetic database + real PostgREST harness

Explicit opt-in only; no package changes, normal Vitest/Playwright registration,
production operations, deployment, or provider cache reads. Requires Docker and
Node 22+ plus the repository's already-installed `@supabase/supabase-js`.

## Start and prove the restored baseline

From the repository root:

```sh
node scripts/local-stack/stack.mjs up
# Copy the STATE path printed by startup; each run has a unique name and path.
STATE=/absolute/path/printed/by/startup/state.json
node tests/real/boundary.http.mjs "$STATE"
```

The only source is schema-only `pg_dump` of `auth` and `public` from
`database-recovery-parity-20261016`, database `recovery`, Unix socket `/tmp`,
role `supabase_admin`. It is never modified. Roles are reconstructed from
`pg_roles` names/bypass flags, not `pg_authid`, password hashes, memberships,
role settings, database rows, backups, credentials, or Auth caches.
Owners, grants, RLS, functions and triggers in the selected schemas are retained.
Application roles remain non-superuser/non-bypass; only authenticator can log in
over TCP, and it can switch only to anon/authenticated. It does not inherit grants.

Scope is intentionally application authorization parity, NOT full hosted-stack
parity: storage/realtime/vault schemas and extension management event triggers
are excluded. Only `pgcrypto`, `uuid-ossp`, and built-in `plpgsql` are installed.
The cached Supabase Postgres image is manually initialized, bypassing its default
service initialization. Empty shared preload, zero worker counts, no scheduler,
no replication workers, no autovacuum and an internal-only Docker network prevent
scheduled/extension network activity. No production auth or application rows are
copied. Five synthetic auth rows, one admin email and one historical proposal
(seven baseline votes) are inserted. A test-only **invoker** RPC
`synthetic_request_identity` proves actual role switching and `auth.uid()`.
This RPC is not a replacement for any application RPC.

Every run has its own `rights-real-<random>-db`, `-rest`, and `-net`. DB storage is
tmpfs, no backup mount, no database host port. Only these two containers join the
new internal network. DB TCP HBA permits only `authenticator` for `fixture` using
the generated password; local socket administration is task-container-local.
State/schema artifacts are outside the repository with mode 0600. JWT signing
material is random per startup and used only here; no service-role token exists.
State contains **fake local** signed tokens for anon, studentA/B, admin, outsider,
and unconfirmed. JWTs expire after 24 hours; restart the fixture after expiry.

## Application / parent browser QA endpoint

```sh
node scripts/local-stack/gateway.mjs "$STATE"
# Keep this foreground process open; it prints the ephemeral loopback URL/key.
```

Use the printed `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`
(also set `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` to that same fake anon token if
needed) **for the Next process only**. Do not edit repository env files or reuse
production configuration. Retain the project's offline font response setting.

**Important transport boundary:** Docker Engine 29.4.0 suppresses port publication
on the required internal bridge. Rather than attach an egress-capable network,
the loopback gateway forwards REST to `http://rest:3000` using `docker exec` +
`curl` in our DB container. These are actual PostgREST HTTP requests with the
original JWT, HTTP method, body, profile, range and preference headers. Status,
headers and body come from real PostgREST; **no REST data or authorization is
simulated**. The SDK itself makes real HTTP requests to the ephemeral loopback
gateway. There is no direct host-published DB or PostgREST port.

Auth alone is a minimal in-memory token-registry facade following the existing
fixture's registry pattern. Existing fixture tokens have invalid signatures and
non-UUID subjects, so the permissive fixture is not started or reused for REST.
`auth.getUser()` works for registered signed tokens; logout revokes the facade
entry, not already-issued PostgREST JWTs. This is **not Google, PKCE, GoTrue,
refresh-token or real email verification evidence**. The fixture deliberately
does not implement token exchange/refresh. For browser cookies, use an SDK
`auth.setSession({access_token: state.tokens.studentA,
refresh_token: 'synthetic-unused'})` against this gateway (valid tokens do not
need refresh); or construct the SSR cookie from that synthetic session, matching
the existing fixture's cookie format. Never read an actual browser Auth cache.
Parent owns Next startup, cookie injection and final browser verification.

### Combined application launcher (preferred for parent browser QA)

```sh
node scripts/local-stack/app.mjs "$STATE"
```

The launcher accepts the migrated synthetic state and prints **only** `APP_URL`,
`APP_STATE`, and `STACK_STATE`. It does not print tokens. `APP_STATE` is a private
0600 JSON file containing the app/gateway loopback URLs, original stack state path,
snapshot directory, private Next log path and launcher/Next PIDs. Read synthetic
tokens from the original stack state only when constructing local sessions.

It snapshots an explicit source/config allowlist into a unique temporary directory,
excluding `.env*`, `.next`, credentials, browser profiles and provider caches.
Installed `node_modules` is linked, not reinstalled. No repository configuration,
package or build-output file is changed. Source edits made after launch require
restarting this snapshot launcher. The Next child receives a whitelist environment
with only local fake Supabase settings, disabled telemetry and a scoped offline
font mock. The gateway binds to port 0; Next uses a separately reserved free
loopback port, failing closed rather than falling back to a different hostname.

Next runs `dev --webpack --hostname 127.0.0.1 --port <reserved-port>`. The original
font mock's comment-only CSS is accepted by the existing Turbopack harness but
fails Webpack's `next/font` loader. `scripts/local-stack/fonts.cjs` returns a real
`@font-face` using `local("Arial")`; no Google/font asset is downloaded.
Private Next output goes to the temporary log, never to launch stdout.

Ctrl-C / SIGTERM shuts down the Next process group and gateway. SIGKILL escalation
is bounded if Next ignores SIGTERM. Unexpected Next exit also closes the gateway.
The Docker fixture remains running for the next parent QA session. Temporary
snapshot/state/log artifacts remain available for diagnosis.

Current local CLI guide consulted:
`node_modules/next/dist/docs/01-app/03-api-reference/06-cli/next.md`, plus
`node node_modules/next/dist/bin/next dev --help` and Context7 `/vercel/next.js`.
Next automatically reads project `.env*` files, so an allowlisted child environment
alone would not be sufficient: the source snapshot excludes them entirely.

## Apply the completed migration chain, then test

Do not watch, poll, or apply a migration while its SQL owner is writing it.
Wait for the owner's explicit completion notice, review the file, then obtain
each file's SHA-256. The command refuses application until baseline HTTP checks passed
and every explicit checksum matches the bytes it reads, in the order listed in
`scripts/database/migrations.mjs`. It only targets its own
labeled synthetic container, never the recovery container or SQL agent DB.

```sh
shasum -a 256 supabase/migrations/*.sql
# Supply one reviewed hash per manifest entry, in manifest order.
node scripts/local-stack/stack.mjs apply "$STATE" SHA256_1 SHA256_2
node tests/real/boundary.http.mjs "$STATE"
```

The complete chain is applied once per fresh fixture; update the hash arguments
when the manifest gains a migration. This fixture command is not a production
migration runner: production must apply only versions missing from its history.
The schema cache receives a reload notification.
If SQL fails, discard this fixture and start a new baseline: do not retry a
partially applied migration. The hardened suite verifies raw sensitive table
denial, public Page RPC projection, and independent rejection of anon, outsider
and unconfirmed mutations. It fails rather than skipping absent application RPCs.
It is a minimum HTTP integration gate, not complete concurrency/versioning,
anonymous feedback/comment, pagination, browser, or deployment verification.

### Extended real workflow and launcher lifecycle checks

```sh
node tests/real/workflow.http.mjs "$STATE"
node tests/real/launcher.http.mjs "$STATE"
```

These are explicit scripts, not normal npm/Vitest tests. The workflow uses the
actual completed migration's RPC parameter/DTO definitions, existing signed local
JWTs and real PostgREST HTTP. Every run uses unique records; it does not assert or
change the existing fixture's vote counts or content. A uniquely owned synthetic
historical row is inserted through task-container-local SQL with baseline 13 to
exercise nonzero baseline preservation; ordinary creations use RPCs. Successful
RPC-created and historical records are removed through versioned admin RPCs in
`finally` (comments/ballots cascade with their proposal). Private mutation history
intentionally remains, as required by the contract.

Recorded follow-up: **37 workflow checks passed**, including anonymous feedback
and comments; public redaction even for administrators; protected trusted author
lookup; exact create/edit/vote receipts; per-user desired-state votes, duplicate
and cancellation behavior; three concurrent duplicate votes counting once; caller
viewer state; nonzero historical baseline preservation; version conflicts;
title/content filtering before keyset pagination; ascending comment cursors using
unmodified timestamp strings; and deliberate HTTP/SQLSTATE error mapping.

**Four launcher lifecycle checks passed:** token-free loopback launch output with
no copied env files; actual Next page compilation/HTTP 200 with offline fonts;
real `/api/rights/proposals?limit=1` returning the application Page envelope through
SDK/PostgREST; and SIGTERM releasing both Next and gateway sockets. The lifecycle
check leaves the launcher stopped and does not stop any Docker container.
These checks do not claim Google/GoTrue verification or final browser/visual QA.

## Shutdown

Stop the foreground gateway with Ctrl-C, then:

```sh
node scripts/local-stack/stack.mjs down "$STATE"
```

Only the names in that synthetic state (validated prefix and labels) are removed.
Temporary artifacts can be removed manually when parent QA no longer needs them.
If startup fails before both containers exist, remove only the exact printed
owned container/network names; do not use global Docker cleanup commands.

## Version / official documentation receipts (2026-10-16)

- Cached DB image: `supabase/postgres:17.6.1.136`, local image ID
  `f371b5f3f2ac` (same image as isolated recovery source; not a production upgrade).
- Official stable PostgREST release discovered, not guessed:
  <https://api.github.com/repos/PostgREST/postgrest/releases/latest> returned
  **v16.4**, published 2026-09-24; release
  <https://github.com/PostgREST/postgrest/releases/tag/v16.4>.
- Pulled `postgrest/postgrest:v16.4`, pinned manifest digest
  `sha256:d155c6718ed9a9f990d159a2ab7c0a3f16944dbb6d0a0344557421042acfe0df`.
- <https://docs.postgrest.org/en/v16/explanations/install.html>: official Docker
  repository, environment configuration, PostgreSQL >=14 support.
- <https://docs.postgrest.org/en/v16/references/configuration.html>: DB anon role,
  explicit public schema, disabled in-DB config, JWT secret >=32 characters,
  JWT audience; pool=5 and max rows=100. `db-max-rows` is an HTTP row cap, **not**
  proof of contract JSON Page limits; those must be enforced in each rights RPC.
  JWT cache is disabled. No claim path override (v16 default `$.role`).
- <https://docs.docker.com/engine/network/drivers/bridge/>: isolated user-defined
  bridge DNS and container communication; Docker 29 internal-publication behavior
  was observed directly, so the host gateway is explicit rather than silently
  weakening the network boundary.
- <https://supabase.com/changelog.md> reviewed: recent TLS hosted-endpoint changes
  do not apply to this isolated HTTP stack; hosted Data API grant changes do not
  replace restored ACLs. Full Supabase gateway/Auth upgrade changes are out of
  scope because this harness does not run those services.
- <https://supabase.com/docs/guides/auth/third-party/firebase-auth> and Context7
  `/supabase/supabase-js` current constructor/getUser docs: custom Authorization
  header preserves Auth namespace; `accessToken` callback would disable it.
- <https://supabase.com/docs/guides/monitoring-and-debugging.md> reviewed before
  diagnosing local connection failure. Only task container logs were inspected;
  no production logs/advisors queried.

## Baseline handoff receipt

14 SDK HTTP checks passed on the schema-only restored baseline: five synthetic
Auth registry identities, invalid JWT signature rejected by PostgREST, all six
roles/subjects proven through the real invoker RPC, public proposal read, and
anon announcement insert denied by PostgreSQL RLS (`42501`, HTTP 401).
Legacy raw public proposal reads deliberately succeed before hardening.
This does **not** claim the migration or hardened contract has passed.
