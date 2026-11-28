# 實驗高中學生權益網站

讓學生提出提案、參與連署、送出意見回饋和查看公告的校內網站，用 Next.js App Router 和 Supabase 開發。

[![Next.js 16](https://img.shields.io/badge/Next.js-16-black)](https://nextjs.org) [![React 19](https://img.shields.io/badge/React-19-blue)](https://react.dev) [![Node.js 最低版本為 22.22.2](https://img.shields.io/badge/Node.js-22.22.2%20minimum-green)](https://nodejs.org)

[English](./README.md)

## 環境設定

需要 Node.js 22.22.2、24.15.0 或 26.0.0 以上的版本（`nvm install` 會自動選用 `.nvmrc` 指定的版本），以及一個 Supabase 專案的網址和 publishable（anon）key。

先執行 `npm ci`，再在專案根目錄建立 `.env.local`（git 已經設定忽略這個檔案）：

```bash
NEXT_PUBLIC_SUPABASE_URL=https://<你的專案>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<你的 publishable key>
```

網站只會讀這兩個變數。不要使用 service-role key，也不要把任何真正的金鑰貼進 repo。

## 常用指令

| 指令 | 用途 |
| --- | --- |
| `npm run dev` | 啟動開發伺服器，網址是 http://localhost:3000 |
| `npm run check` | 依序跑型別檢查、lint、Vitest、離線正式 build、Playwright |
| `npm run check:db` | 在 Docker 開一個全新的本機 PostgreSQL，套用全部 migration 後跑 SQL 檢查（要先下載 image，指令見 `AGENTS.md`） |
| `npm run build` | 正式 build。在本機執行時要加上下方的離線變數 |
| `npm run start` | 啟動正式伺服器 |
| `npm run test` | Vitest 單元、元件與整合測試 |
| `npm run test:watch` | 用 watch 模式跑 Vitest |
| `npm run test:e2e` | Playwright 瀏覽器測試 |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |

## 專案結構

```text
app/                         頁面：首頁、/proposals、/feedback、/profile、/auth/callback
app/api/rights/
  actions/                   所有寫入都走這裡（學生 4 種、管理員 9 種操作）
  feedback/, proposals/      公開列表
  proposals/[id]/comments/   單一提案的留言
  items/                     用 ID 查單筆公開資料
  home-sections/             首頁公告
  queue/                     篩選後的列表，附每個分頁籤的總筆數
  proposals/pending/         待審核的提案（限管理員）
  authors/                   查匿名內容的作者（限管理員）
  session/                   目前登入的使用者，以及是否為管理員
components/                  UI 元件
lib/auth/                    伺服器端的登入驗證
lib/rights/                  介面定義、輸入驗證、讀取與寫入
supabase/migrations/         資料庫 migration，依檔名順序套用
tests/                       單元、元件、整合、e2e 與 SQL 測試
```

網站沒有 `/admin` 後台。管理員直接在 `/feedback` 和 `/proposals` 頁面上審核，首頁公告則在 `/` 管理。

## 資料庫變更

正式環境的 migration 操作步驟見 [AGENTS.md](./AGENTS.md#data)。

## 測試

整合測試和瀏覽器測試連的是跑在本機的假 Auth/PostgREST 服務（`tests/fixtures/`），不需要 Supabase 帳號，也不需要任何金鑰。開 pull request 前請執行：

```bash
npm ci
npx playwright install chromium
npm run check
npm run check:db
```

直接執行 `npm run build` 會失敗，這是刻意的：缺少 Supabase 變數時，`/auth/callback` 在預先產生頁面的階段就會報錯，避免設定錯誤的版本被部署出去。`npm run check` 用的是指向本機空連接埠的假設定，Google Fonts 也改用假資料。只想跑這個 build 的話：

```bash
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:9 NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_offline_fixture_only NEXT_FONT_GOOGLE_MOCKED_RESPONSES=tests/fixtures/google-fonts.cjs npm run build
```

只跑單一測試檔：

```bash
npm run test -- tests/integration/rights-actions.test.ts
npm run test:e2e -- tests/e2e/security-flows.spec.ts
```

每個測試涵蓋哪些行為，見 `tests/BEHAVIORS.md`。
