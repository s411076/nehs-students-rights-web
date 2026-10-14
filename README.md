This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Testing (offline fixture, no secrets)

All tests run against a loopback fake Auth/PostgREST provider with fixture users.
No real Supabase account, Google login, or production secret is needed.
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

`build` 不可裸跑：`/auth/callback` 靜態預渲染會觸發 fail-closed 的瀏覽器
factory（缺公開設定即拋錯），裸 `npm run build` 在此失敗是預期行為，不是回歸。
上面的前綴把設定釘到無用的 loopback（port 9）並用
`tests/fixtures/google-fonts.cjs` mock Google Fonts，讓 build 全程離線。
全是夾具假 key，不含真實 secret。

Targeted invocations (no duplicate `--run`):

```bash
npm run test -- tests/unit/rights-contracts.test.ts
npm run test -- tests/integration/rights-actions.test.ts tests/integration/rights-reads.test.ts
npm run test:e2e -- --grep 'security headers'
npm run test:e2e -- tests/e2e/security-flows.spec.ts
```

Notes: the fake provider is intentionally permissive, so a denied request in tests
proves the application guard blocked it, not the database. `lint` currently reports
a pre-existing baseline (12 errors, 5 warnings in application files, exit 1);
identify it, do not mislabel it as passing. Security boundaries and residual risks are described
in `docs/security-source-remediation.md`.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
