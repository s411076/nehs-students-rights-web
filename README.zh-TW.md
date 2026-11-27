# 實驗高中學生權益網站

學生提案、連署、意見回饋與公告的校內網站，以 Next.js App Router 加 Supabase 打造。

[![Next.js 16](https://img.shields.io/badge/Next.js-16-black)](https://nextjs.org) [![React 19](https://img.shields.io/badge/React-19-blue)](https://react.dev) [![Node.js 最低版本為 22.22.2](https://img.shields.io/badge/Node.js-22.22.2%20minimum-green)](https://nodejs.org)

English version: [English](./README.md)

## 安裝

前置需求：Node.js 22.22.2 以上（22.x）、24.15.0 以上（24.x），或 26.0.0 以上（見 `.nvmrc`），以及一個提供專案 URL 與 publishable（anon）key 的 Supabase 專案。

1. 執行 `npm ci`，再於專案根目錄建立 `.env.local`（已在 `.gitignore` 內，不會進版控），內容如下：
```bash
NEXT_PUBLIC_SUPABASE_URL=https://<你的專案>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<你的專案-publishable-key>
```
應用程式只讀取這兩個變數（`lib/supabase.ts`、`lib/supabase/server.ts`）。倉庫內沒有 `.env.example`。絕不使用 service-role key，也不要在任何地方貼上真實 secret。

## 快速開始

| 指令 | 用途 |
| --- | --- |
| `npm run dev` | 啟動開發伺服器（http://localhost:3000） |
| `npm run check` | 型別檢查、Lint、Vitest、離線正式建置、Playwright |
| `npm run check:db` | 在全新的本機 Docker PostgreSQL 上執行 migration 與 SQL 檢查（需要 Docker 與快取的 Supabase image；pull 指令見 `AGENTS.md`） |
| `npm run build` | 正式建置——不可裸跑（見下方） |
| `npm run start` | 啟動正式伺服器 |
| `npm run lint` | ESLint 檢查 |
| `npm run test` | 全部 Vitest 單元與整合測試 |
| `npm run test:watch` | Vitest 監看模式 |
| `npm run test:e2e` | Playwright 端對端測試 |
| `npm run typecheck` | `tsc --noEmit` 型別檢查 |
## 專案結構

```text
app/
  page.tsx               首頁：提案搜尋、意見回饋一覽、公告
  proposals/page.tsx     提案列表、留言、連署投票
  feedback/page.tsx      匿名意見回饋
  profile/page.tsx       個人頁（只顯示已驗證身分，不查提案）
  auth/callback/page.tsx OAuth 回調完成頁
  api/rights/
    actions/route.ts     全部寫入：13 個動作的 POST allowlist
    authors/route.ts     僅管理員的作者歸屬查詢
    feedback/route.ts    公開回饋讀取
    home-sections/route.ts 首頁公告讀取
    items/route.ts       單筆公開項目查詢
    proposals/route.ts   公開提案讀取
    proposals/pending/route.ts 管理員待審核讀取
    proposals/[id]/comments/route.ts 單一提案的留言
    queue/route.ts       先篩選再分頁的佇列與正確分頁總數
    session/route.ts     已驗證身分加管理員旗標
```

## 文件

所有 migration 皆已套用至正式環境。部署新的 migration 前，請先比對 migration history，只套用缺少的版本；步驟見 `docs/database-hardening.md`，契約見 `docs/database-hardening-contract.md`。

## 測試與離線驗證

`npm run test` 與 `npm run test:e2e` 跑在 loopback 假 Auth/PostgREST provider 上（已接好在 `playwright.config.ts` 與 `tests/fixtures/`），不需要真實 Supabase 帳號或 secret。發布前依序執行：
```bash
npm ci
npx playwright install chromium
npm run check
npm run check:db
```

`build` 不可裸跑：`/auth/callback` 靜態預渲染使用 fail-closed factory，缺少公開設定即拋錯，因此裸 `npm run build` 在此失敗是預期行為。`npm run check` 改跑以下離線建置（loopback URL 加 `tests/fixtures/google-fonts.cjs` 字型 mock，全是夾具 key）：
```bash
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:9 NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_offline_fixture_only NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_offline_fixture_only NEXT_FONT_GOOGLE_MOCKED_RESPONSES=tests/fixtures/google-fonts.cjs npm run build
```

指定測試（總索引：`tests/BEHAVIORS.md`；SQL 授權、RLS 與投影語意由 `npm run check:db` 覆蓋）：
```bash
npm run test -- tests/unit/rights-contracts.test.ts
npm run test -- tests/integration/rights-actions.test.ts
npm run test:e2e -- tests/e2e/security-flows.spec.ts
```
