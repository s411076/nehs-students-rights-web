# 資料庫強化 runbook（本機現況與正式發布門檻）

本文件是技術 runbook，只描述本機現況與未來正式發布的條件。本次不執行正式 migration、部署、commit 或正式寫入。`docs/security-source-remediation.md` 是歷史 source-only 文件，保持原範圍，本文件不改寫它，也不宣稱過去項目已修復。

契約以 `docs/database-hardening-contract.md` 為準。實作細節看 `tests/database/README.md` 與 `scripts/local-stack/README.md`。`.omo/` 下的本機紀錄不進版控。

## 1. 使用者決策（已定）

- 保留歷史文章與顯示票數。歷史票是不可變 baseline，新票從空 ballots 開始，不重算舊帳。
- 舊列保留，不刪除 legacy 表或欄。未知歷史作者維持未知，不從名稱推測擁有權。
- 匿名作者只有管理員可查，且走專用查詢。公開投影維持遮蔽，管理員看公開列表也不露出。
- 允許短寫入維護窗口做最終切換。

## 2. 本機已驗證到哪（非最終）

以下數字是 parent 親自確認的本機結果，不是上線證明，也不是最終驗證：

- 完整 Vitest 501/501、typecheck 與最終 fixture 前綴 build 通過。
- 瀏覽器 32/32（fake provider，兩種寬度）。
- 真 PostgREST HTTP hardened 21 checks 通過（直接讀取拒絕、各身分公開 RPC、未合資格 mutation 拒絕）。
- 真 RPC workflow 另有 37 checks；parent 已透過瀏覽器操作真 PostgREST 驗證舊票保留、投票重載／取消、匿名建言、管理員作者揭露、409 草稿保留、審核及 20+1 分頁。
- 已擷取五個頁面在 390／1440、light／dark 的截圖，量測無水平 overflow；尚未宣稱獨立視覺 gate 通過。
- 真資料庫回歸有 synthetic 與 restored 兩條，寫入前先建拋棄式 DB，recovery 只當模板，從不直接 migrate。
- 非 superuser postgres 的全新 cluster gate 已由 parent 重跑通過，Auth catalog 與既有資料筆數保持一致。
- 第一輪獨立審查發現的離頁連結／分頁移動草稿問題已修正，parent 在真網站重驗了草稿文字與原版本保留、失敗目標查詢的頁內重試；第二輪獨立複審為 **APPROVE（僅本機候選）**。

證據是本機產物，可重演，不代表遠端 CI 會自動通過：

```sh
node scripts/database/regression.mjs
node scripts/database/regression.mjs --restored
node scripts/database/managed-principal.mjs
node scripts/local-stack/stack.mjs up
node tests/real/boundary.http.mjs "$STATE"
```

成功會寫出僅含 DB 識別、時間、指令與 gate 名稱的 `verification-synthetic.json` 與 `verification-restored.json`，不含資料或憑證。注意兩條邊界：

- Vitest 與 Playwright 的 fake 證據不能代替真 DB 的 RLS 證據。
- 真 HTTP 的 Auth 是測試 token registry facade，不是 Google 登入證明。沒有宣稱測過真實 Google 登入。

## 3. 本機前置與範圍限制

- 本機容器腳本依賴具名 recovery container 做 parity 基準，尚未做成可攜，目前不宣稱可在遠端 CI 自動執行。
- 正式前需要新備份，備份放外部備份目錄，不進版控，不在本文件貼路徑或雜湊以外的秘密值。
- Recovery 範圍不含 Storage bytes、OAuth 設定與簽章或加密 keys。這些不在本次備份與還原驗證內。
- Auth 密碼外洩防護是條件式：只有啟用密碼登入且方案支援才評估，不改 Auth 設定。
- [官方密碼安全文件](https://supabase.com/docs/guides/auth/password-security)明定 leaked password protection 需 Pro 以上；若維持 Free，不為此自動升級或啟用付費功能。
- Legacy 破壞性清理延後：重複索引、模糊約束、舊函式保留檢查用，不刪除 schema。

## 4. Managed migration principal：本機權限模型已驗證

剛發現的阻斷：本地復原角色 postgres 不是 superuser。它有 BYPASSRLS 與 auth.users 的 SELECT WITH GRANT OPTION，但不是 auth.users owner，也不能 SET ROLE supabase_auth_admin。在拋棄式 synthetic DB 用 transaction 加 SET LOCAL ROLE postgres 已重現 `CREATE POLICY` on auth.users 失敗（must be owner），該交易隨連線結束 rollback，recovery 原 DB 沒有改動。

不能拿本地 superuser 成功，就宣稱 migration 可直接套到 managed project。修正採用單一不公開、由 postgres 擁有的窄欄位身分讀取 helper，其餘 RPC 仍維持受限 executor；不變更 Auth 表 policy，也不賦予 executor BYPASSRLS。全新隔離環境的非 superuser postgres principal gate 已通過，包含 Auth catalog 不變、暫時建置權限撤回與完整 SQL 回歸。這證明保存下來的權限模型可執行；正式套用前仍要確認即時 schema、角色及平台限制未漂移。

## 5. 正式發布流程（只描述，不執行）

順序是 baseline PR 先行，再做協調切換：

- PR A：原有介面與無障礙等 baseline 改善，先審查合併。
- PR B：資料庫權限與網站契約協調切換。migration 與網站是同一部署單位，不可各自獨立上線。

切換當天只描述步驟，不在本文件執行：

1. 取新備份，補 full recovery 驗證。
2. 開啟已同意的短寫入維護，drain 寫入。
3. 套用 matching release：migration、API schema reload、相容網站同版 promotion，協調執行。
4. 跑 smoke，確認後才重開寫入。

還原限制要先記住：raw-table 撤權後不能只回滾 app，因為舊網站的 raw-table 路徑已被撤權。任何情況都不做 DISABLE RLS，也不做 broad grant。

## 6. 剩餘缺口（準確列出）

- Auth 邊界與 owner 修正已通過本機 principal gate；正式套用前仍需比對即時環境。
- 修正後已重新建立合成 stack，14 baseline、21 hardened、37 workflow checks 通過；parent 也重驗最終網站的投票、匿名身分與第二頁草稿衝突／重新載入／確認捨棄後儲存。獨立複審已通過本機候選，並未批准正式部署。
- 最終 lint 仍有 3 errors / 5 warnings，都是修復前已存在的 callback Link、AuthProvider effect 及既有 warning；不能宣稱 lint 通過。新出現的測試 unused-variable warning 已修。
- 新舊功能完整 gate review 未做。正式角色部署資格、最新備份與維護切換都還沒確認。
- 原有 lint 問題未全清，最後要重記精確數量，不把 preexisting 說成通過。
- 容器腳本可攜性未做，在做成可重建前不宣稱遠端 CI 可跑。

都補齊之前，本文件不是上線完成證明。

## 7. 正式切換紀錄（2026-10-16， Migration 已套用）

上游 PR #2（baseline UX）與 #3（hardening）皆已合併；線上為新版網站，正式 DB 已於同日套用
`supabase/migrations/20261015183529_rights_hardening.sql`，history 登記為版本
`20261015183529`／名稱 `rights_hardening`。

切換前完成事項：

- 重新唯讀匯出正式 DB（48 表、983 筆，database.dump SHA256
  `16e00b4384dd579b1b6105837c0eaa37960c09f46b2e4a4d5faf4096e0af42ff`），備份放外部備份目錄，不進版控。
- 漂移比對：migration history 仍為原 4 筆；三個 endorsements 觸發器存在；無殘留 hardening 物件；
  無 NULL created_at、無負票數；筆數 proposals 5、feedback 7、feedbacks 2、comments 2、admins 4、
  endorsements 3、home_sections 2。
- 套用採單一交易 psql（`ON_ERROR_STOP=1`，6.6 秒）。中途兩次 MCP 送件因轉錄落字失敗，
  均完整 rollback（事後驗證無殘留物件、筆數不變、history 未登記），第三次以檔案位元組原樣套用成功。
  臨時連線檔已安全刪除。

切換後驗證（正式 DB 直接查詢）：

- `rights_executor`、`rights_private`、22 個公開 RPC、9 個私有函式存在。
- 9 張表 RLS 全開；`anon`／`authenticated` 直接讀寫全撤回。
- 資料筆數與切換前一致；ballots 從空開始；無 NULL baseline／version。
- 公開提案 RPC 回 3 筆，票數 baseline 5／7／16 保留；limit=2 回 2 筆且有 `nextCursor`；
  feedback 7 筆、home 2 筆；公開輸出零身分欄位洩漏。
- 未登入呼叫 pending 遭 PT401；`rights_is_admin()` 未登入回 false。
- 安全建議：RLS critical 項已消失；剩餘為預期內的 definer-RPC 可執行提醒（守衛在函式內）、
  無 policy 的凍結表 INFO，以及需 Pro 的外洩密碼保護 WARN（保留評估）。

後續保留：真 Google 登入端到端、正式站瀏覽器 smoke、LICENSE PR #4 合併、已合併本地分支清理、
結構整理盤點（見 `.omo/db-required.local.md`，不進版控）。
