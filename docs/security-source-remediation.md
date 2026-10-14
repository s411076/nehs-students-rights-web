# 應用層安全修復邊界、相容性風險與驗證方式

本文件說明本次 source-only 修復做了什麼、沒有修什麼，以及維護者如何離線驗證。
它關閉 GAP-5（可執行的測試與回歸），並把 GAP-D1（資料庫相依保證）列為已記錄但未解決。
GAP-D1 沒有被修復，本文件也不宣稱它被修復。

狀態基準（撰寫時親自驗證）：單元測試 273/273 通過，`typecheck` 乾淨，
瀏覽器安全流程 30/30（兩種視窗寬度），完整 `test:e2e` 32/32（含 smoke 與 headers），
`build` 通過（僅限第 6 節的離線夾具環境），`lint` 為 12 個錯誤加 5 個警告的既有基準（exit 1，未通過）。
該 12/5 基準取自 Task-16 時點（fix packs 合併前），不是零新增診斷的證明；合併後的位置對照由品質覆核維護。
273/273、30/30、32/32 皆為 Task-16 當時的歷史執行數，非 fix-pack 合併後的重新驗證。
第 8 節為 Packs A、B、C、D-seam 的已合併完成 ledger（附程式與證據引用）。

## 1. 範圍：只改 source，不碰資料庫與部署

本次修復只修改應用程式 source、測試、相容的應用程式設定與文件。
沒有也不包含：資料庫 migration、RPC、表格、RLS policy 或 grant 變更、正式 Supabase 或 Vercel 的讀寫、
service-role key、secret 變更、正式部署或版本發布。
凡是需要資料庫才能保證的事情，一律列在第 4 節的殘餘風險 ledger，作為後續追蹤，不在本文件給出 SQL 或上線步驟。

## 2. 應用程式路由與直接 PostgREST 的差別

這是理解整份文件的關鍵。所有既有寫入現在都經過 `POST /api/rights/actions`，
伺服器用 request-scoped client 搭配該使用者的 JWT 重新驗證身分與角色後才下資料庫指令。
這條路徑上的檢查只對「走網站操作」的人有效。

同一個 Supabase 專案的 PostgREST endpoint 可以被任何持有 anon key 的人直接呼叫，
完全不經過網站程式碼。如果資料庫的 RLS 是寬鬆的，直接呼叫會成功，
而網站上的拒絕訊息擋不住它。這不是推測，測試夾具就是這樣設計的：
`tests/fixtures/supabase-server.ts` 是一個刻意 permissive 的假後端，
學生身分直接送特權寫入會成功，藉此證明是應用程式守衛擋下請求，而不是 mock 的 RLS。
因此，一個 permissive mock 下的拒絕測試，只能證明應用程式行為，不能證明正式資料庫安全。
正式 RLS 從未在本工作中被連線檢查，這屬於未驗證，不是已修復。

## 3. 稽核發現對照：修復、緩解、延後、未驗證

原始稽核發現按群組對照如下。不捏造已確認的漏洞利用次數，
只記錄每個群組在 source 層的處理狀態。括號內為主要對應的任務證據。

已在 source 修復（應用程式路徑）：

- 以 JWT payload、localStorage、cookie 字串、`getSession().user` 作為授權依據。
  改為每次請求用 `getUser()` 向 Auth 伺服器驗證（`lib/auth/server.ts`），
  瀏覽器只呈現伺服器驗證過的最小身分（Tasks 3、4）。
- `/admin` 與各頁缺乏一致伺服器驗證。`/admin` 改為伺服器 gate，
  所有寫入改經 allowlist action，每個管理操作各自再驗證（Tasks 5、6）。
- `SELECT *`、首頁全狀態查詢、匿名作者外洩、模糊本人比對。
  改為顯式欄位、公開狀態 allowlist、伺服器端匿名投影、個人頁停止所有權查詢（Tasks 2、5、7、9、10）。
- 更新不確認筆數、連署失敗不回復、查詢靜默失敗。
  改為 returning-id 單筆確認、失敗回復快照、不確定結果顯示為不確定（Tasks 5、12）。
- 無測試 runner 與回歸。改為 Vitest 加 Playwright 離線套件（Tasks 1、14、15）。

已緩解但未根除（應用程式改善，資料庫層風險仍在）：

- 連署重複送出與狀態錯亂。單頁內已做到每提案 single-flight、失敗回復、
  不確定結果不自動重試並提示「無法確認是否已儲存，請先更新清單確認，勿重複提交。」。
  但一人一票、計數竄改、競爭條件沒有解決，見第 4 節（Task 12）。
- 作者歸屬顯示。寫入時作者名稱由伺服器從已驗證使用者衍生，不再接受瀏覽器自稱。
  但名稱來自可變的 metadata，沒有 durable UUID，仍可能誤認，見第 4 節（Tasks 2、5）。
- 登出競態。AuthProvider 世代守衛加登出通知 context，舊請求不能恢復管理狀態。
  這修的是應用程式記憶體狀態，不是伺服器 session 撤銷（Tasks 4、11）。

延後（已記錄為後續工作，不在本工作解決）：

- RLS 與 grant 的實際狀態與收緊（GAP-D1 核心）。
- `admins` 表本身的寫入保護（該表是條件信任來源，見第 4 節）。
- 可靠連署（每人一票、原子計數）、作者 UUID 與舊資料遷移、回覆歷史與版本紀錄。
- 資料庫預設值與 CHECK 約束、provider 端學校註冊限制、分散式速率限制。

未驗證（沒有證據，不做宣稱）：

- 正式部署的 headers、版本、實際 RLS 行為。Source 的 headers 只在部署後生效，
  而部署從未被量測（Task 15 只驗證本地伺服器回應）。
- 相依套件 CVE、open redirect、帳號接管。本工作沒有這些問題的確認證據，
  因此不宣稱存在也不宣稱不存在。
- 早前推測性說法的修正：造訪 `/admin` 看到頁面不等於證明有資料庫寫入權；
  `window.location.origin` 本身不是已成立的 open redirect；
  瀏覽器自動 PKCE 交換可能本來就存在，本工作保留它而不重做第二次交換；
  repo 沒有 headers 不等於部署沒有 headers；可讀的 SSR cookie 不等於帳號已被接管。
   這些在計劃中已被降級為未證實，不列為已修復項目。

## 3A. 原始 23 項逐項對照（不新增、不重編）

原始 23 項即使用者 2026-10-13 提出的編號風險清單（首則訊息第 1 至 23 項），
本表沿用該編號，記為 O-1 至 O-23。每項只屬一類：
source-fixed（應用程式路徑已修）、mitigated（應用程式改善，根因仍在）、
deferred（延後，需資料庫或部署配合）、unverified（無證據，不做宣稱）。
程式引用皆已逐段讀過，非僅搜尋；`E` 為 `.omo/evidence/source-security-remediation/`。

| 編號 | 原始發現摘要 | 分類 | 程式與證據 |
| --- | --- | --- | --- |
| O-1 | localStorage Email 偽造管理員 | source-fixed | 瀏覽器掃描判定已刪，改由 `useAuth` 呈現伺服器驗證身分；`lib/auth/server.ts:15-31` 每次以 `getUser` 驗證。`E/task-4-qa.txt`、`E/task-9-qa.txt` |
| O-2 | 自解碼 JWT，不驗簽章期限 | source-fixed | `parseJwt` 已刪；同 O-1 的 `getUser` 路徑。`E/task-4-qa.txt`、`E/task-10-qa.txt` |
| O-3 | Cookie 含特定字串即認定登入 | source-fixed | Cookie 掃描判定已刪；同 O-1 路徑。`E/task-4-qa.txt`、`E/task-8-qa.txt` |
| O-4 | `/admin` 無身分檢查 | source-fixed | `app/admin/page.tsx:13-20` 先 `requireAdmin` 才查 feedback；匿名轉向 `/`，非管理回 404。`E/task-6-green.txt` |
| O-5 | 管理員判定各頁不一致 | source-fixed | 統一 `requireAdmin`/`getVerifiedIdentity`；`ADMIN_EMAILS` 硬編碼已刪。`E/task-7-qa.txt`、`E/task-8-qa.txt` |
| O-6 | 管理員 Email 寫死前端 | source-fixed | `lib/auth/server.ts:36` 只查自身 email 加 `limit(2)`，零筆、重複、格式不符一律拒絕。`E/task-3-qa.txt` |
| O-7 | Session 與 Client 混用不同步 | source-fixed | `lib/supabase.ts` 單一 singleton factory；`src/lib/supabase.ts` 已刪；單一 AuthProvider 加世代守衛。登出發起瞬間的共享失效已合併：`components/AuthProvider.tsx:91-114` 的 `beginLogout` 在 SDK 呼叫前先推進世代並清除共享身分，`components/Navbar.tsx:24-35` 先呼叫 `beginLogout()` 才 `signOut`。詳見第 8 節已合併 ledger。`E/task-4-qa.txt` |
| O-8 | `hd` 只是提示，無強制校內驗證 | source-fixed | `lib/auth/server.ts:22` 比對正規化完整 domain 加 `email_confirmed_at`；`hd` 僅提示。`E/task-3-qa.txt` |
| O-9 | RLS 可能過寬 | deferred | 見 R-1。倉庫無 policy 可審，應用程式 allowlist 不改變直接呼叫結果 |
| O-10 | 投票與管理共用 UPDATE 權限 | mitigated | `setVoteCount` 只寫 `upvotes_count` 且限公開列（`lib/rights/server-actions.ts:80-85`）；管理動作為獨立 allowlist 條目。直接呼叫的欄位權限仍取決於資料庫，見 R-1、R-3。`E/task-5-qa.txt` |
| O-11 | 連署可重複計算 | deferred | 見 R-3。單頁 single-flight 只擋誤觸連點。`E/task-12-qa.txt` |
| O-12 | 連署競爭條件丟票 | deferred | 見 R-3。無原子操作或交易 |
| O-13 | 投票失敗不還原 | source-fixed | 失敗回復快照；`app/proposals/page.tsx:188-255`；`lib/rights/client.ts:44-52` 區分已儲存但清單更新失敗與不確定結果。`E/task-12-qa.txt` |
| O-14 | 總票數由前端決定 | mitigated | 伺服器限定只寫 `upvotes_count`（`lib/rights/server-actions.ts:80-85`），但數值仍來自客戶端；完整性未解決，見 R-3。`E/task-5-qa.txt` |
| O-15 | 初始狀態與票數前端指定 | mitigated | `createProposal` 由伺服器構造標題、作者、待審核與 0 票（`lib/rights/server-actions.ts:58-63`）；繞過應用的寫入仍可帶任意值，見 R-6。`E/task-5-qa.txt` |
| O-16 | 待審核提案可能外洩 | mitigated | 公開查詢共用 `PUBLIC_STATUSES` allowlist（`lib/rights/queries.ts:92`）；直接呼叫仍取決於資料庫，見 R-1。`E/task-7-qa.txt`、`E/task-8-qa.txt` |
| O-17 | `SELECT *` 與匿名作者暴露 | mitigated | 顯式欄位字串（`lib/rights/queries.ts:14-39`）；公開 feedback 在序列化前省略 `author_name`（`lib/rights/queries.ts:192`）。直接呼叫的欄位暴露仍屬資料庫層，見 R-1。`E/task-2-qa.txt`、`E/task-9-green.txt` |
| O-18 | 姓名片段模糊認領本人提案 | source-fixed | `app/profile/page.tsx:88-98` 零提案查詢，加 `profile-ownership-unavailable` 提示。`E/task-10-qa.txt` |
| O-19 | 作者名稱由前端提交可冒用 | mitigated | 寫入作者由伺服器從已驗證身分衍生（`lib/rights/server-actions.ts:58-79`）；名稱來自可變 metadata，無 durable UUID，見 R-4。`E/task-5-qa.txt` |
| O-20 | 官方回覆覆寫無歷史 | deferred | 見 R-5 |
| O-21 | 查詢靜默失敗，修改無確認 | mitigated | 通用錯誤訊息、returning-id 單筆確認（`lib/rights/server-actions.ts:28-39`）、失敗保留草稿。提案清單載入/就緒/錯誤狀態分離與如實收據文案已合併：`app/proposals/page.tsx:24-25` 以獨立 `publicListStatus`/`pendingListStatus` 區分，`199-205` 成功文案只承諾審核與發布、不承諾個人頁狀態。詳見第 8 節已合併 ledger。`E/task-5-qa.txt`、`E/task-12-qa.txt` |
| O-22 | RLS 無法從倉庫審查 | deferred | 見 R-1、R-9。後續需資料庫存取，不在本工作解決 |
| O-23 | 當時部署失敗 | unverified | 見 R-9。倉庫內無法驗證，正式行為從未量測 |

## 3B. 追加發現與推測性說法的逐項對照

X-1 至 X-7 為同次稽核找出的 7 個追加問題；S-1 至 S-5 為計劃已降級的 5 個推測性說法（第 3 節未驗證段已有，這裡給編號以便引用）。

| 編號 | 內容摘要 | 分類 | 程式與證據 |
| --- | --- | --- | --- |
| X-1 | OAuth `redirectTo` 用 `window.location.origin` | mitigated | 保留本站 origin 的共享流程（`hd` 僅提示），依 Fixed contracts 不寫死部署主機名；見第 5 節登入段。`E/task-13-qa.txt` |
| X-2 | callback 未手動交換 code | source-fixed | 瀏覽器 SDK 擁有自動交換；共享 helper 只做一次 `getSession` 初始化加一次 `getUser` 驗證（`lib/auth/oauth-completion.ts:144-166`），消費後才清理 URL。根頁返回結果呈現已合併：`app/page.tsx:109-134` 依原始參數呈現 failure/ineligible 並保留非 OAuth 查詢，`203-212` 的 `handleLogin` 捕捉 `startGoogleOAuth` 拒絕與錯誤結果。詳見第 8 節已合併 ledger。`E/task-13-qa.txt` |
| X-3 | `admins` 表可被枚舉 | source-fixed | 只查自身 email（`lib/auth/server.ts:36` 加 `limit(2)`），不拉名單。`E/task-3-qa.txt` |
| X-4 | 零安全標頭 | source-fixed | `next.config.ts:5-25` 四標頭基線；嚴格 script 指令與 HSTS 刻意不做，見 R-10。`E/task-15-qa.txt` |
| X-5 | 零輸入驗證 | source-fixed | `lib/rights/contracts.ts`、`lib/rights/validation.ts` 共享長度、枚舉、ID 與 65536 位元組上限，伺服器重驗；入口另有 Origin 與媒體型別檢查（`app/api/rights/actions/route.ts:12-40`）。`E/task-2-qa.txt`、`E/task-5-qa.txt` |
| X-6 | Token 可被頁面 JS 讀取 | mitigated | 不再信任儲存內容做授權；傳輸與儲存方式維持與瀏覽器 SDK 相容，未做架構變更。`E/task-4-qa.txt` |
| X-7 | 重複 Supabase 初始化與空字串 fallback | source-fixed | `src/lib/supabase.ts` 已刪；缺公開設定即拋錯（`lib/supabase.ts:6`、`lib/supabase/server.ts:11`）。`E/task-4-qa.txt` |
| S-1 | 造訪 `/admin` 見頁不等於 DB 寫入權 | unverified | 見第 3 節未驗證段 |
| S-2 | `window.location.origin` 本身不是已成立的 open redirect | unverified | 同上 |
| S-3 | 瀏覽器自動 PKCE 交換可能本來存在 | unverified | 保留既有交換，不重做第二次 |
| S-4 | repo 無 headers 不等於部署無 headers | unverified | 見 R-9 |
| S-5 | 可讀 SSR cookie 不等於帳號接管 | unverified | 無確認證據，不做宣稱 |

## 4. 殘餘風險 ledger（應用程式檢查修不了這些）

每一項都是 source 修復完成後仍然成立的風險。後續處理屬於資料庫或部署工作，本文件只列出，不給步驟。

| # | 風險 | 說明 |
| --- | --- | --- |
| R-1 | 繞過網站直接呼叫 PostgREST | 若 RLS 寬鬆，攻擊者可跳過所有應用程式守衛直接讀寫。網站的 403 擋不住這條路。 |
| R-2 | `admins` 表可被寫入 | 角色來源是該表的內容。若資料庫允許非預期寫入，角色判定就被污染。應用程式只讀自己的 email（`select('email').eq('email', verifiedEmail).limit(2)`），但保護不了表格本身。 |
| R-3 | 重複投票與客戶端計數 | `setVoteCount` 寫入的是客戶端選定的總數。單頁 single-flight 只擋誤觸連點，擋不住換帳號、換裝置、併發 lost update。 |
| R-4 | 作者名稱可變且無 UUID | 顯示名稱來自可改的 Auth metadata，沒有 durable 作者識別。個人頁因此暫時不列出本人提案，只顯示 `profile-ownership-unavailable` 提示，這是刻意的暫時限制。 |
| R-5 | 無回覆歷史與版本紀錄 | 回覆覆寫不留痕跡，也沒有併發版本號。後寫者靜默覆蓋先寫者，無法追溯。 |
| R-6 | 無資料庫預設值與 CHECK | 初始狀態與計數由伺服器程式碼構造，若有人繞過應用程式寫入，欄位可以是任意值。 |
| R-7 | 無 provider 端學校註冊限制 | 應用程式擋的是「用非學校信箱操作網站功能」。校外使用者仍可能取得 provider 簽發的 session，再走直接 API。 |
| R-8 | 無分散式速率限制 | 應用程式有 65536 位元組 body 上限與單頁 single-flight，但沒有跨實例的節流。 |
| R-9 | 部署狀態從未驗證 | 正式環境的版本、headers、RLS 行為都沒有量測。Source headers 只在部署後生效。 |
| R-10 | Baseline CSP 不是嚴格 XSS 防護 | `base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'` 只擋 framing 與 object 嵌入。沒有 `default-src` 或 `script-src`，是為了不弄壞 Next.js inline script，這是刻意取捨，不是疏漏。 |

另外，本工作不宣稱相依套件 CVE、open redirect 或帳號接管的任何結論，因為沒有證據。

## 5. 相容性風險（升級或接手前先讀）

- Returning 與 select policy。更新與刪除要求恰好回傳一筆 `id`（投票外加 `upvotes_count`），
  由 `returnedRow` 檢查（`lib/rights/server-actions.ts`）。若既有 SELECT policy 禁止 returning，
  操作會回報失敗或無法確認，絕不改 policy，也絕不假裝成功。Insert 用最小成功回應，不去 select 私密的待審核列。
- 學校信箱與確認狀態。必須是已確認（`email_confirmed_at`）且完整 domain 等於 `nehs.hc.edu.tw`。
  比的是正規化後的完整 domain，`nehs.hc.edu.tw.evil.test` 會被拒。Google `hd` 只是提示，不是驗證。
  未確認或校外使用者仍可讀公開頁，只是不能登入操作。
- 混合大小寫的舊 admin 紀錄。查詢用正規化後的信箱精確比對，零筆、重複、格式不符一律拒絕管理權限。
  舊的混合大小寫紀錄可能 fail closed，這是已知相容性風險，不放寬查詢也不改資料庫。
- 投票客戶端總數風險。`setVoteCount` 只更新 `upvotes_count`，且只限公開狀態的目標，
  但總數仍是客戶端選的。確認成功後若清單刷新失敗，訊息是「已儲存，但清單更新失敗」，
  不得回報為提交失敗。不確定結果（斷線、逾時）一律顯示不確定，絕不自動重試寫入。
- 登出通知的 remount 修復。Task 11 發現 SIGNED_OUT 會 remount 世代 keyed 的子樹，
  吃掉 Navbar 的登出失敗通知。修法是把通知放在 AuthProvider 的獨立 context（`useLogoutNotice`），
  只在新世代伺服器驗證成功後清除。動這塊時不要把通知欄位塞回 `AuthContextValue`，會破壞既有測試假物件。
- Origin 與本地測試。動作路由要求 `Origin` 精確等於請求 URL 的 origin。
  Task 8 記錄過在 `127.0.0.1` 上測到 FORBIDDEN，而 `localhost` 正常且無需改程式。
  部署的主機或代理改變時，要在整合環境重測 Origin 行為，不要放寬守衛。
兩個登入按鈕共用同一 OAuth 流程（`redirectTo` 為本站 origin，`hd` 僅提示），
成功只在 `getUser` 驗證出已確認學校身分後才顯示，URL 的 code 參數在消費後才清除。
Session cookie 保持與瀏覽器 SDK 相容，沒有改動傳輸或儲存方式。
- Task 6 的儲存與清除確認，現已由 Task 14 的真實瀏覽器回歸覆蓋
  （管理員回覆儲存與確認清除，兩種寬度皆通過），不需要另補手動驗證。

## 6. 可執行驗證方式（離線夾具，無需 secret）

測試只用夾具發的假 publishable key 與夾具使用者，不需要真實 Supabase 帳號或 Google 登入。
Playwright 設定會自動啟動 loopback 的假 Auth/PostgREST provider 與真實 Next.js 伺服器，
瀏覽器與伺服器網路都不得連向正式 Supabase。不要在任何指令或檔案裡放真實 secret。

```bash
npm ci
npm run test
npm run typecheck
npm run lint
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:9 NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_offline_fixture_only NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_offline_fixture_only NEXT_FONT_GOOGLE_MOCKED_RESPONSES=tests/fixtures/google-fonts.cjs npm run build
npm run test:e2e
```

`build` 必須帶上面的環境前綴，不可只跑裸 `npm run build`。
原因：`/auth/callback` 是靜態預渲染頁，它間接用到的瀏覽器 factory
（`lib/supabase.ts:6`）在缺公開設定時直接拋錯，這是刻意的 fail-closed。
裸跑會在 callback 預渲染失敗；前綴把設定釘到無用的 loopback（port 9，從不連正式服務），
只為讓預渲染通過，從不提供真實後端。
`NEXT_FONT_GOOGLE_MOCKED_RESPONSES` 把 Google Fonts 載入指向
`tests/fixtures/google-fonts.cjs`，讓 build 全程離線，不抓外部字型。
前綴全是夾具假 key，不含真實 secret，port 9 保證打不通任何正式服務。

針對性呼叫（不加多餘的 `--run`）：

```bash
npm run test -- tests/unit/rights-contracts.test.ts
npm run test -- tests/integration/rights-actions.test.ts tests/integration/rights-reads.test.ts
npm run test:e2e -- --grep 'security headers'
npm run test:e2e -- tests/e2e/security-flows.spec.ts
```

`lint` 的 12 個錯誤加 5 個警告是既有應用程式基準（exit 1，未通過），撰寫時親自確認過，
不是本次文件或修復引入，也不應被誤標為通過。位置分佈於先前任務的應用程式檔
（`app/*`、`components/AuthProvider`、`components/Navbar`、`lib/rights/server-actions` 及一個測試檔），
本文件與 `README.md` 零條目，完整記錄見 `E/task-16-lint.txt`。`build` 與 `test:e2e` 需在上面的離線夾具環境執行，
證據見 `E/task-16-green.txt`。逐項風險的人工審查表見 `E/task-16-qa.txt`，
它證明本文件沒有宣稱 permissive mock 或直接 API 寫入已被擋下，
且每個延後項目、個人頁限制、不確定結果不重試警告都在語意上存在。

## 7. 部署未測試與 source 無保護的區別

這兩句話意思不同，不要混用。Source 無保護是指程式碼裡沒有檢查（本次已補上）。
部署未測試是指正式環境的實際行為沒被量測（本次做不到，也不假裝做到）。
例如 headers：source 已有四個基礎 headers 且本地回應可驗證，但正式部署是否送出同樣 headers 屬於未測試。
又如 RLS：應用程式已做到走網站的請求都會被驗證，但正式資料庫是否擋直接呼叫屬於未測試。
前者是已交付，後者是後續工作。

## 8. 已合併 fix packs 的完成 ledger（分類與風險語意不變）

以下五項原由 Packs A、B、C、D-seam 分頭處理，現皆已合併並有程式與回歸證據。
第 3A 節的分類以現有程式碼為準，本節只做完成記錄，不改變任何 deferred/unverified
分類與第 4 節殘餘風險 ledger 的語意：

- 登出發起瞬間的共享失效（F1 fix 1，已合併）：`components/AuthProvider.tsx:91-114`
  的 `beginLogout` 在 SDK 呼叫前先推進世代、清除共享身分並阻擋舊世代恢復；
  `components/Navbar.tsx:24-35` 先呼叫 `beginLogout()` 才 `signOut`，失敗時由
  provider 擁有的通知呈現且保持非特權直到重新驗證。回歸見
  `tests/components/navbar-auth.test.tsx:225-257`。本文件不宣稱伺服器 session
  撤銷，只宣稱應用程式記憶體狀態的世代守衛。
- 根頁 OAuth 返回呈現（F1 fix 2，已合併）：`components/AuthProvider.tsx:14-35`
  在共享子樹外保存原始參數，並在 SDK 初始化與清理後檢查原始 error 欄位；
  `app/page.tsx:109-134` 依結果呈現 failure/ineligible 並保留非 OAuth 查詢與 hash，
  `203-212` 的 `handleLogin` 捕捉 `startGoogleOAuth` 拒絕與錯誤結果。
  回歸見 `tests/components/home-security.test.tsx:368-422`。
- session 端點與 proxy 的受控失敗邊界（F1 fix 3，已合併）：
  `app/api/rights/session/route.ts:7-30` 把初始化、身分/管理驗證與最終 cookie
  寫回都包在外層 try，`proxy.ts:6-21` 同理；非預期錯誤一律回 generic
  `{error:'unavailable'}` 503 加 `private, no-store`，不轉發身分、不做寫入。
  回歸見 `tests/integration/session-boundaries.test.ts:23-54`（兩表面乘四故障，
  共八個邊界斷言）。
- 提案清單狀態分離與如實成功文案（F1 fix 4，已合併；與 F4 task 17 同一問題）：
  `app/proposals/page.tsx:24-25` 以獨立 `publicListStatus`/`pendingListStatus`
  區分載入、就緒、錯誤，`327-335` 呈現錯誤摘要，`365-370`（待審核）與
  `475-482`（公開）分別處理載入／錯誤重試（`368`、`478`）／空清單，空清單只在成功零筆時顯示；
  `199-205` 成功文案只承諾學權組審核與公開發布，不再承諾個人頁狀態，
  與 R-4 的個人頁限制一致。回歸見 `tests/components/proposals-security.test.tsx:228-368`。
- Guard seam 負向控制與 Pack C（F1 fix 6 / D-seam，已合併）：
  `tests/integration/guard-sensitivity.test.ts:18-62` 為僅移除 Origin 比對的
  測試傳輸 seam，RED 證明真實學生跨源可寫入、GREEN 證明守衛恢復後拒絕；
  這是應用程式檢查的敏感度控制，不是正式資料庫行為的證明。Pack C 對比
  tokens 已合併，視覺判定屬 F3 範圍，本文件不做視覺結論。
