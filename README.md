# NEHS Student Rights Website

A campus website where students post proposals, sign petitions, send feedback and read announcements. Built with the Next.js App Router and Supabase.

[![Next.js 16](https://img.shields.io/badge/Next.js-16-black)](https://nextjs.org) [![React 19](https://img.shields.io/badge/React-19-blue)](https://react.dev) [![Node.js 22.22.2 minimum](https://img.shields.io/badge/Node.js-22.22.2%20minimum-green)](https://nodejs.org)

[中文版](./README.zh-TW.md)

## Setup

You need Node.js 22.22.2+, 24.15.0+ or 26.0.0+ (`nvm install` picks the version in `.nvmrc`), and a Supabase project's URL and publishable (anon) key.

Run `npm ci`, then create `.env.local` in the project root. It is already ignored by git.

```bash
NEXT_PUBLIC_SUPABASE_URL=https://<your-project>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-publishable-key>
```

The app reads only these two variables. Never use the service-role key, and never paste a real secret into the repository.

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the dev server at http://localhost:3000 |
| `npm run check` | Typecheck, lint, Vitest, offline production build, then Playwright |
| `npm run check:db` | Apply all migrations and run the SQL checks on a fresh local PostgreSQL in Docker (pull the image first; see `AGENTS.md`) |
| `npm run build` | Production build. Needs the offline variables below when run locally |
| `npm run start` | Start the production server |
| `npm run test` | Vitest unit, component and integration tests |
| `npm run test:watch` | Vitest in watch mode |
| `npm run test:e2e` | Playwright browser tests |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |

## Project structure

```text
app/                         Pages: home, /proposals, /feedback, /profile, /auth/callback
app/api/rights/
  actions/                   Every write goes here (4 student and 9 admin actions)
  feedback/, proposals/      Public lists
  proposals/[id]/comments/   Comments on one proposal
  items/                     One public item by ID
  home-sections/             Home page announcements
  queue/                     Filtered lists with a total for each tab
  proposals/pending/         Proposals waiting for review (admin only)
  authors/                   Who wrote an anonymous item (admin only)
  session/                   Current user and whether they are an admin
components/                  UI components
lib/auth/                    Server-side sign-in checks
lib/rights/                  Contracts, validation, reads and writes
supabase/migrations/         Database migrations, applied in filename order
tests/                       Unit, component, integration, e2e and SQL tests
```

There is no `/admin` page. Admins moderate directly on `/feedback` and `/proposals`, and manage announcements on `/`.

## Database changes

See [AGENTS.md](./AGENTS.md#data) for the production migration procedure.

## Testing

Integration and browser tests talk to a fake Auth/PostgREST server on localhost (`tests/fixtures/`), so you do not need a Supabase account or any secret. Before opening a pull request, run:

```bash
npm ci
npx playwright install chromium
npm run check
npm run check:db
```

Running `npm run build` on its own fails on purpose: prerendering `/auth/callback` throws when the Supabase variables are missing, so a misconfigured build never ships. `npm run check` builds with fake values pointed at an unused local port and mocked Google Fonts. To run only that build:

```bash
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:9 NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_offline_fixture_only NEXT_FONT_GOOGLE_MOCKED_RESPONSES=tests/fixtures/google-fonts.cjs npm run build
```

To run a single test file:

```bash
npm run test -- tests/integration/rights-actions.test.ts
npm run test:e2e -- tests/e2e/security-flows.spec.ts
```
