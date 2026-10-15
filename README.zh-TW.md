# 新竹高中學生權益網站

學生提案、連署、意見回饋與公告的校內網站，以 Next.js App Router 加 Supabase 打造。

[![Next.js 16](https://img.shields.io/badge/Next.js-16-black)](https://nextjs.org)
[![React 19](https://img.shields.io/badge/React-19-blue)](https://react.dev)
[![Node >= 20](https://img.shields.io/badge/Node-%3E%3D20-green)](https://nodejs.org)

English version: [English](./README.md)

## Contents

- [Installation](#installation)
- [Quick Start](#quick-start)
- [How It Works](#how-it-works)
- [Project Structure](#project-structure)
- [Documentation](#documentation)
- [測試與離線驗證](#測試與離線驗證)

## Installation

前置需求：

- Node.js 20.9 以上（Next.js 16 需要），npm 隨附即可。
- 一個 Supabase 專案，提供專案 URL 與 publishable（anon）key。本機開發與測試只用公開 key，從不使用 service-role key。

環境設定：

1. 複製相依套件並安裝：`npm ci`。
2. 在專案根目錄建立 `.env.local`（已在 `.gitignore` 的 `.env*` 規則內，不會進版控），填入以下兩個公開變數：

```bash
NEXT_PUBLIC_SUPABASE_URL=https://你的專案.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=你的假publishable key
```

只有這兩個公開變數，沒有其他必填變數。倉庫內沒有 `.env.example`，也不需要建立。任何地方都不要貼上真實 secret，測試用的假 key 已經寫在 `playwright.config.ts` 與 `tests/fixtures/` 裡。

## Quick Start

常用指令（以 `package.json` 為準）：

| 指令 | 用途 |
| --- | --- |
| `npm run dev` | 啟動開發伺服器（http://localhost:3000） |
| `npm run build` | 正式建置（見下方，一定需要離線前綴，不可裸跑） |
| `npm run start` | 啟動正式伺服器 |
| `npm run lint` | ESLint 檢查 |
| `npm run test` | Vitest 全部單元與整合測試 |
| `npm run test:watch` | Vitest 監看模式 |
| `npm run test:e2e` | Playwright 端對端測試 |
| `npm run typecheck` | `tsc --noEmit` 型別檢查 |

發布前的驗證順序：

```bash
npm ci
npm run test
npm run typecheck
npm run lint
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:9 NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_offline_fixture_only NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_offline_fixture_only NEXT_FONT_GOOGLE_MOCKED_RESPONSES=tests/fixtures/google-fonts.cjs npm run build
npm run test:e2e
```

`build` 不可裸跑：`/auth/callback` 靜態預渲染會觸發 fail-closed 的瀏覽器 factory（缺公開設定即拋錯），裸 `npm run build` 在此失敗是預期行為，不是回歸。上面的前綴把設定釘到無用的 loopback（port 9）並用 `tests/fixtures/google-fonts.cjs` mock Google Fonts，讓 build 全程離線。全是夾具假 key，不含真實 secret。

`lint` 目前回報既有基準（12 errors, 5 warnings in application files, exit 1），要認列它，不要誤標為通過。安全邊界與殘餘風險寫在 `docs/security-source-remediation.md`。

## How It Works

**伺服器優先驗證身分。**每次請求都用 `getUser()` 向 Auth 伺服器重新驗證，只接受已確認的 `nehs.hc.edu.tw` 完整 domain（`lib/auth/server.ts`）；管理員身分只查自己 email 的精確比對加 `limit(2)`（`lib/auth/server.ts:36`），零筆、重複、格式不符一律拒絕。`proxy.ts` 只做 refresh 傳遞，不做授權快取。

**所有寫入走 13 個動作的 POST allowlist。**`POST /api/rights/actions`（`lib/rights/server-actions.ts`）只接受 4 個學生動作（`createProposal`、`createFeedback`、`addComment`、`setVoteCount`）與 9 個管理動作（提案審核、留言刪除、回覆儲存、公告管理等），請求體用 `parseActionRequest` 精確解析，來源 Origin、JSON 媒體型別與 65536 位元組上限都在守衛內。

**公開讀取只給投影，匿名不給名字。**公開提案與留言用顯式欄位加 `PUBLIC_STATUSES`（研議中、通過、已採納、不採納）過濾（`lib/rights/queries.ts`），公開意見回饋在序列化前整個省略 `author_name`，個人頁完全不查提案（`app/profile/page.tsx`）。各頁面（首頁、提案、意見回饋、`/admin`）都經由這些投影讀取，不再直接掃表。

**投票只鎖當頁當人，不自動重試。**每提案 single-flight（`app/proposals/page.tsx`），失敗回復快照；不確定結果（斷線、逾時）顯示「無法確認是否已儲存，請先更新清單確認，勿重複提交。」且絕不自動重送。OAuth 由瀏覽器 SDK 完成 PKCE 交換後再以 `getUser` 驗證（`lib/auth/oauth-completion.ts`），基礎 headers（`X-Frame-Options: DENY`、`X-Content-Type-Options: nosniff`、嚴格 `Referrer-Policy`、最小 CSP）由 `next.config.ts` 發出。

## Project Structure

```text
app/
  page.tsx               首頁：提案搜尋、意見回饋一覽、公告
  proposals/page.tsx     提案列表、留言、連署投票
  feedback/page.tsx      匿名意見回饋
  profile/page.tsx       個人頁（只顯示已驗證身分，不查提案）
  admin/page.tsx         伺服器 gate 後的管理面板
  auth/callback/page.tsx OAuth 回調完成頁
  api/rights/
    actions/route.ts     13 動作 POST allowlist
    feedback/route.ts    公開回饋讀取
    proposals/pending/   管理員待審核讀取
    session/route.ts     世代守衛的 session 驗證
components/
  AuthProvider.tsx       世代守衛的身分 provider
  Navbar.tsx             同步身分、fail-closed 登出
  admin/                 管理面板客戶端元件
lib/
  auth/                  伺服器驗證、型別、OAuth 完成
  rights/                契約、校驗、投影、伺服器動作、客戶端
  supabase/              request-scoped 伺服器 client
  supabase.ts            瀏覽器 singleton factory
proxy.ts                 refresh 傳遞與靜態排除
tests/
  unit/                  契約、伺服器驗證、文件一致性
  components/            各頁安全行為
  integration/           路由、headers、session 邊界
  e2e/                   真機瀏覽器安全流程
  fixtures/              離線假 provider、字型 mock
docs/
  security-source-remediation.md  安全修復邊界與驗證文件
```

## Documentation

`docs/security-source-remediation.md` 是安全修復的權威文件，各節如下：

| 節 | 內容 |
| --- | --- |
| §1 範圍 | 只改 source，不碰資料庫與部署 |
| §2 路由與直接呼叫 | 應用程式路由和直接 PostgREST 的差別 |
| §3 對照表 | 23 項發現的修復、緩解、延後、未驗證 |
| §4 殘餘風險 | 需資料庫配合的風險 ledger |
| §5 相容性風險 | 大小寫、Origin、投票總數等已知風險 |
| §6 離線驗證 | 可執行的離線驗證方式 |
| §7 部署未測試 | 部署未測試和 source 無保護的區別 |
| §8 完成 ledger | 已合併 fix packs 的完成紀錄 |

## 測試與離線驗證

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
