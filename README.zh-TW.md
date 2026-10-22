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

`lint` 目前回報 3 errors、5 warnings（exit 1），全是修復前已存在的問題（callback `Link`、`AuthProvider` effect 與既有 warning；已從 12 errors、5 warnings 的歷史修復基準下降），要認列它，不要誤標為通過。安全邊界與殘餘風險寫在 `docs/security-source-remediation.md`。

## How It Works

**管理功能直接留在公開頁面，不另設後台。**管理員在 `/feedback` 回覆、刪除建言及查詢作者；在 `/proposals` 核可／退回提案、編輯狀態與回覆、刪除留言及查詢作者。首頁區塊的新增／刪除留在 `/`。`/admin` 及其建言列表 API 已移除，造訪會回傳 404。

**伺服器優先驗證身分。**每次請求都用 `getUser()` 向 Auth 伺服器重新驗證，只接受已確認的 `nehs.hc.edu.tw` 完整 domain（`lib/auth/server.ts`）；管理員身分改走只回答呼叫者資格的 `rights_is_admin` RPC，不列舉管理員名單。資料庫檢查目前學校資格及受保護、具有唯一約束的管理員紀錄。`proxy.ts` 只做 refresh 傳遞，不做授權快取。

**所有寫入走 13 個動作的 POST allowlist。**`POST /api/rights/actions`（`lib/rights/server-actions.ts`）只接受 4 個學生動作（`createProposal`、`createFeedback`、`addComment`、`setVote`）與 9 個管理動作（提案審核、留言刪除、回覆儲存、公告管理等），請求體用 `parseActionRequest` 精確解析，來源 Origin、JSON 媒體型別與 65536 位元組上限都在守衛內。`setVote` 是 desired-state 且冪等：歷史票維持不可變 baseline，新票從每人空 ballots 開始，總數不改寫歷史，舊帳不重複計數。每次寫入都在資料庫衍生 UUID 並私下記錄顯示歸屬。

**公開讀取只給有界 RPC 分頁，匿名不給名字。**所有列表都經有界 `Page<T>` RPC 讀取（`lib/rights/server-reads.ts`，預設 `p_limit=20`、上限 50），不再直接掃表，公開提案另加 `PUBLIC_STATUSES` 過濾；公開意見回饋的匿名列在序列化前省略 `author_name`，管理員列表同樣維持遮蔽。要識別匿名作者須走伺服器管理 gate 之後的專用 `rights_admin_author` 查詢，只有可靠歸屬的新列才回 `known`，未知的歷史擁有權維持未知。個人頁完全不查提案（`app/profile/page.tsx`），個人提案列表維持刻意不提供。

**本分支必須協調發布資料庫與網站。**先前 hardening 的發布紀錄見 `docs/database-hardening.md §7`；本次任務不部署新的狀態收斂或篩選佇列 migration。全新測試資料庫執行 `scripts/database/migrations.mjs` 的有序鏈，既有環境則核對 migration history 後只套缺少的版本。先保存編輯草稿、維護停寫並等待進行中操作完成，再套用缺少的 migration 與配對網站，通過 smoke 後才重開寫入。回滾限制見 `docs/database-hardening.md §5a`，契約見 `docs/database-hardening-contract.md`。

**分頁數字代表全部符合條件的資料，不是已載入筆數。**`/api/rights/queue` 先篩選再分頁，回傳各分頁的真正總數；待回覆建言與待審核提案從最舊開始，其他清單從最新開始。每批載入 20 筆（API 上限 50），可持續載入更多，沒有總筆數上限。計數失敗顯示未知，不會誤報為 0。

**投票以伺服器狀態為準，不自動重試。**`app/proposals/ProposalVote.tsx` 的每提案 single-flight 配合資料庫序列化與唯一票紀錄。畫面依收據及公開狀態查詢顯示票數與本人投票狀態，不把 localStorage 當權威。不確定結果顯示「無法確認是否已儲存，請先更新清單確認，勿重複提交。」後只查詢核對，不自動重送寫入。OAuth 保留瀏覽器 SDK 的 PKCE 交換及後續 `getUser` 驗證；基礎 headers 維持在 `next.config.ts`。

## Project Structure

```text
app/
  page.tsx               首頁：提案搜尋、意見回饋一覽、公告
  proposals/page.tsx     提案列表、留言、連署投票
  feedback/page.tsx      匿名意見回饋
  profile/page.tsx       個人頁（只顯示已驗證身分，不查提案）
  auth/callback/page.tsx OAuth 回調完成頁
  api/rights/
    actions/route.ts     13 動作 POST allowlist
    feedback/route.ts    公開回饋讀取
    proposals/pending/   管理員待審核讀取
    session/route.ts     世代守衛的 session 驗證
components/
  AuthProvider.tsx       世代守衛的身分 provider
  Navbar.tsx             同步身分、fail-closed 登出
  admin/                 受管理員驗證保護的行內作者查詢
lib/
  auth/                  伺服器驗證、型別、OAuth 完成
  rights/                契約、校驗、投影、伺服器動作、RPC 讀取、客戶端
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
  database-hardening.md           本機資料庫強化現況與發布門檻（尚未上線）
  database-hardening-contract.md  強化工作的 RPC、讀取與寫入契約
```

## Documentation

資料庫修復的本機現況與正式發布門檻：[資料庫強化 runbook](./docs/database-hardening.md)。契約：[資料庫強化契約](./docs/database-hardening-contract.md)。`docs/security-source-remediation.md` 只描述早期的 source-only 工作，保持原範圍，不改寫它。

`docs/security-source-remediation.md` 記錄先前的 source-only 安全修復，歷史各節如下：

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

資料庫強化 runbook：`docs/database-hardening.md`（本機現況與正式發布門檻，歷史文件範圍不變）。

資料庫強化 runbook：`docs/database-hardening.md`（本機現況與正式發布門檻，歷史文件範圍不變）。

資料庫強化 runbook：`docs/database-hardening.md`（本機現況與正式發布門檻，歷史文件範圍不變）。

## 測試與離線驗證

預設的 `npm run test` 與 `npm run test:e2e` 跑在 loopback 假 Auth/PostgREST provider 加夾具使用者上。
這兩個預設套件不需要真實 Supabase 帳號、Google 登入或正式 secret。
選用的真實 PostgreSQL 與真實 PostgREST 授權 gate 另寫在 `docs/database-hardening.md`，不是預設套件的一部分。
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
proves the application guard blocked it, not the database. Real-database evidence
comes only from the separate gates in `docs/database-hardening.md`. `lint` currently reports
3 errors and 5 warnings (exit 1), all pre-existing (down from the 12-error, 5-warning
historical repair baseline); identify it, do not mislabel it as passing. Security boundaries and residual risks are described
in `docs/security-source-remediation.md`.
