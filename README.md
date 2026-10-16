# Hsinchu Senior High School Student Rights Website

A campus website for student proposals, petitions, feedback, and announcements, built with Next.js App Router and Supabase.

[![Next.js 16](https://img.shields.io/badge/Next.js-16-black)](https://nextjs.org)
[![React 19](https://img.shields.io/badge/React-19-blue)](https://react.dev)
[![Node >= 20](https://img.shields.io/badge/Node-%3E%3D20-green)](https://nodejs.org)

Traditional Chinese version: [中文版](./README.zh-TW.md)

## Contents

- [Installation](#installation)
- [Quick Start](#quick-start)
- [How It Works](#how-it-works)
- [Project Structure](#project-structure)
- [Documentation](#documentation)
- [Testing and Offline Verification](#testing-and-offline-verification)

## Installation

Prerequisites:

- Node.js 20.9 or later (required by Next.js 16); the bundled npm is fine.
- A Supabase project providing the project URL and publishable (anon) key. Local development and testing use only the public key, never the service-role key.

Environment setup:

1. Install dependencies: `npm ci`.
2. Create `.env.local` in the project root (already covered by the `.env*` rule in `.gitignore`, so it never enters version control) with the following two public variables:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://你的專案.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=你的假publishable key
```

Only these two public variables, no other required variables. The repo has no `.env.example`, and none needs to be created. Never paste a real secret anywhere; the fake keys for testing already live in `playwright.config.ts` and `tests/fixtures/`.

## Quick Start

Common commands (see `package.json`):

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the dev server (http://localhost:3000) |
| `npm run build` | Production build (see below, offline prefix required, never run bare) |
| `npm run start` | Start the production server |
| `npm run lint` | ESLint check |
| `npm run test` | All Vitest unit and integration tests |
| `npm run test:watch` | Vitest watch mode |
| `npm run test:e2e` | Playwright end-to-end tests |
| `npm run typecheck` | `tsc --noEmit` type check |

Verification order before release:

```bash
npm ci
npm run test
npm run typecheck
npm run lint
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:9 NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_offline_fixture_only NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_offline_fixture_only NEXT_FONT_GOOGLE_MOCKED_RESPONSES=tests/fixtures/google-fonts.cjs npm run build
npm run test:e2e
```

`build` must never run bare: static prerendering of `/auth/callback` triggers the fail-closed browser factory (it throws when public config is missing), so a bare `npm run build` failing there is expected behavior, not a regression. The prefix above pins config to the useless loopback (port 9) and mocks Google Fonts with `tests/fixtures/google-fonts.cjs`, keeping the whole build offline. All keys are fixture fakes, with no real secrets.

`lint` currently reports 3 errors and 5 warnings (exit 1), all pre-existing (callback `Link`, `AuthProvider` effect, and existing warnings; down from the 12-error, 5-warning historical repair baseline); acknowledge it, do not mislabel it as passing. Security boundaries and residual risks are described in `docs/security-source-remediation.md`.

## How It Works

**Server-first identity verification.** Every request re-verifies with `getUser()` against the Auth server, accepting only confirmed full-domain `nehs.hc.edu.tw` addresses (`lib/auth/server.ts`); admin identity calls the caller-only `rights_is_admin` RPC, without enumerating the membership table. The database checks current school eligibility and protected, uniquely constrained administrator membership. `proxy.ts` only forwards refreshes, with no authorization caching.

**All writes go through a 13-action POST allowlist.** `POST /api/rights/actions` (`lib/rights/server-actions.ts`) accepts only 4 student actions (`createProposal`, `createFeedback`, `addComment`, `setVote`) and 9 admin actions (proposal review, comment deletion, reply saving, announcement management, and more); the request body is parsed strictly with `parseActionRequest`, with the request Origin, JSON media type, and the 65536-byte limit all enforced inside the guards. `setVote` is desired-state and idempotent: historical votes stay an immutable baseline and new ballots start per user, so totals never rewrite history and old ledgers are never double-counted. Each mutation derives a UUID and records display attribution privately in the database.

**Public reads get bounded RPC pages only; anonymous reads get no names.** Every list reads through a bounded `Page<T>` RPC (`lib/rights/server-reads.ts`, default `p_limit=20`, max 50) instead of raw table selects, with `PUBLIC_STATUSES` filtering for public proposals; public feedback omits `author_name` for anonymous rows before serialization, and admin lists stay redacted too. Identifying an anonymous author requires the separate guarded `rights_admin_author` lookup behind the server admin gate, returning `known` only for reliably attributed new rows while unknown historical ownership stays unknown. The profile page never queries proposals (`app/profile/page.tsx`), and the profile proposal list remains intentionally unavailable.

**Local hardening is not deployed.** The database hardening above is implemented locally and uncommitted, not yet in production. Local verification and production release are separate gates; see `docs/database-hardening.md` for evidence and release prerequisites, and `docs/database-hardening-contract.md` for the contract. `docs/security-source-remediation.md` describes only the earlier source-only work.

**Votes use server state, with no automatic retries.** Per-proposal single-flight in `app/proposals/ProposalVote.tsx` complements database serialization and unique ballots. Receipts and public-state reads determine the displayed count and caller's vote; localStorage is not authoritative. Uncertain outcomes show「無法確認是否已儲存，請先更新清單確認，勿重複提交。」and trigger read reconciliation, never mutation replay. OAuth retains the browser SDK's PKCE exchange followed by `getUser` verification; baseline headers remain in `next.config.ts`.

## Project Structure

```text
app/
  page.tsx               Home: proposal search, feedback list, announcements
  proposals/page.tsx     Proposal list, comments, petition votes
  feedback/page.tsx      Anonymous feedback
  profile/page.tsx       Profile page (verified identity only, no proposal queries)
  admin/page.tsx         Admin panel behind the server gate
  auth/callback/page.tsx OAuth callback completion page
  api/rights/
    actions/route.ts     13-action POST allowlist
    feedback/route.ts    Public feedback reads
    proposals/pending/   Admin pending-review reads
    session/route.ts     Generation-guarded session verification
components/
  AuthProvider.tsx       Generation-guarded identity provider
  Navbar.tsx             Synced identity, fail-closed logout
  admin/                 Admin panel client components
lib/
  auth/                  Server verification, types, OAuth completion
  rights/                Contracts, validation, projections, server actions, RPC reads, client
  supabase/              request-scoped server client
  supabase.ts            Browser singleton factory
proxy.ts                 Refresh forwarding and static exclusions
tests/
  unit/                  Contracts, server verification, docs consistency
  components/            Per-page security behavior
  integration/           Routes, headers, session boundaries
  e2e/                   Real-browser security flows
  fixtures/              Offline fake provider, font mock
docs/
  security-source-remediation.md  Security remediation scope and verification docs
  database-hardening.md           Local DB hardening status and release gates (not deployed)
  database-hardening-contract.md  RPC, read, and mutation contract for the hardening work
```

## Documentation

`docs/security-source-remediation.md` records the earlier source-only security remediation. Its historical sections are:

| Section | Contents |
| --- | --- |
| §1 Scope | Source changes only, no database or deployment changes |
| §2 Routes and direct calls | Difference between app routes and direct PostgREST |
| §3 Mapping | Fixes, mitigations, deferrals, and unverified items across 23 findings |
| §4 Residual risks | Risk ledger requiring database cooperation |
| §5 Compatibility risks | Known risks around casing, Origin, vote totals, and more |
| §6 Offline verification | Executable offline verification methods |
| §7 Deployment untested | Difference between untested deployment and unprotected source |
| §8 Completion ledger | Completion record of merged fix packs |

Database hardening runbook: `docs/database-hardening.md` (local-only status plus coordinated release gates; the historical scope in `docs/security-source-remediation.md` is unchanged). Contract: `docs/database-hardening-contract.md`.

## Testing and Offline Verification

The default `npm run test` and `npm run test:e2e` suites run against a loopback fake Auth/PostgREST provider with fixture users.
No real Supabase account, Google login, or production secret is needed for them.
Optional real-PostgreSQL and real-PostgREST authorization gates are documented
separately in `docs/database-hardening.md` and are not part of the default suite.
The Playwright config starts the fake provider and a real Next.js server automatically
and pins them to ephemeral loopback ports. Browser and server traffic must stay
offline from production Supabase. Use only the fake publishable key already wired
in `playwright.config.ts` and `tests/fixtures/`; never paste a real secret anywhere.

```bash
npm ci
npm run test
npm run typecheck
npm run lint
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:9 NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_offline_fixture_only NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_offline_fixture_only NEXT_FONT_GOOGLE_MOCKED_RESPONSES=tests/fixtures/google-fonts.cjs npm run build
npm run test:e2e
```

`build` must never run bare: static prerendering of `/auth/callback`
triggers the fail-closed browser factory (it throws when public config is
missing), so a bare `npm run build` failing there is expected behavior, not a
regression. The prefix above pins config to the useless loopback (port 9) and
mocks Google Fonts with `tests/fixtures/google-fonts.cjs`, keeping the whole
build offline. All keys are fixture fakes, with no real secrets.

Targeted invocations (no duplicate `--run`):

```bash
npm run test -- tests/unit/rights-contracts.test.ts
npm run test -- tests/integration/rights-actions.test.ts tests/integration/rights-reads.test.ts
npm run test:e2e -- --grep 'security headers'
npm run test:e2e -- tests/e2e/security-flows.spec.ts
```

Notes: the fake provider is intentionally permissive, so a denied request in tests
proves the application guard blocked it, not the database. Real-database evidence
comes only from the separate gates in `docs/database-hardening.md`. `lint` currently reports
3 errors and 5 warnings (exit 1), all pre-existing (down from the 12-error, 5-warning
historical repair baseline); identify it, do not mislabel it as passing. Security boundaries and residual risks are described
in `docs/security-source-remediation.md`.
