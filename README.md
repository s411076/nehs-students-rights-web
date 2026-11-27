# NEHS Student Rights Website

A campus website for student proposals, petitions, feedback, and announcements, built with Next.js App Router and Supabase.

[![Next.js 16](https://img.shields.io/badge/Next.js-16-black)](https://nextjs.org) [![React 19](https://img.shields.io/badge/React-19-blue)](https://react.dev) [![Node.js 22.22.2 minimum](https://img.shields.io/badge/Node.js-22.22.2%20minimum-green)](https://nodejs.org)

Traditional Chinese version: [中文版](./README.zh-TW.md)

## Installation

Prerequisites: Node.js 22.22.2+ (22.x), 24.15.0+ (24.x), or 26.0.0+ (see `.nvmrc`), plus a Supabase project with its project URL and publishable (anon) key.

1. Run `npm ci`, then create `.env.local` (covered by `.gitignore`, never committed) with:
```bash
NEXT_PUBLIC_SUPABASE_URL=https://<your-project>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-publishable-key>
```
These are the only two variables the app reads (`lib/supabase.ts`, `lib/supabase/server.ts`). There is no `.env.example`. Never use the service-role key, and never paste a real secret anywhere.

## Quick Start

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the dev server (http://localhost:3000) |
| `npm run check` | Typecheck, lint, Vitest, offline production build, Playwright |
| `npm run check:db` | Migrations + SQL gates on a fresh local Docker PostgreSQL (needs Docker and the cached Supabase image; pull command in `AGENTS.md`) |
| `npm run build` | Production build — never run bare (see below) |
| `npm run start` | Start the production server |
| `npm run lint` | ESLint check |
| `npm run test` | All Vitest unit and integration tests |
| `npm run test:watch` | Vitest watch mode |
| `npm run test:e2e` | Playwright end-to-end tests |
| `npm run typecheck` | `tsc --noEmit` type check |
## Project Structure

```text
app/
  page.tsx               Home: proposal search, feedback list, announcements
  proposals/page.tsx     Proposal list, comments, petition votes
  feedback/page.tsx      Anonymous feedback
  profile/page.tsx       Profile (verified identity only, no proposal queries)
  auth/callback/page.tsx OAuth callback completion page
  api/rights/
    actions/route.ts     All writes: 13-action POST allowlist
    authors/route.ts     Admin-only author attribution lookup
    feedback/route.ts    Public feedback reads
    home-sections/route.ts Home announcement reads
    items/route.ts       Single public item lookup
    proposals/route.ts   Public proposal reads
    proposals/pending/route.ts Admin pending-review reads
    proposals/[id]/comments/route.ts Comments for one proposal
    queue/route.ts       Filtered queues with exact tab counts
    session/route.ts     Verified identity plus admin flag
```

## Documentation

All migrations are applied in production. Before deploying a new migration, compare migration history and apply only missing versions; procedure in `docs/database-hardening.md`, contract in `docs/database-hardening-contract.md`.

## Testing and Offline Verification

`npm run test` and `npm run test:e2e` run against a loopback fake Auth/PostgREST provider (wired in `playwright.config.ts` and `tests/fixtures/`), so no real Supabase account or secret is needed. Verify before release with:
```bash
npm ci
npx playwright install chromium
npm run check
npm run check:db
```

`build` must never run bare: static prerendering of `/auth/callback` uses a fail-closed factory that throws without public config, so a bare `npm run build` failing there is expected. `npm run check` instead runs this offline build (loopback URL plus the `tests/fixtures/google-fonts.cjs` font mock, fixture keys only):
```bash
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:9 NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_offline_fixture_only NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_offline_fixture_only NEXT_FONT_GOOGLE_MOCKED_RESPONSES=tests/fixtures/google-fonts.cjs npm run build
```

Targeted invocations (suite index: `tests/BEHAVIORS.md`; SQL grants, RLS, and projection semantics are covered by `npm run check:db`):
```bash
npm run test -- tests/unit/rights-contracts.test.ts
npm run test -- tests/integration/rights-actions.test.ts
npm run test:e2e -- tests/e2e/security-flows.spec.ts
```
