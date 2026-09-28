'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'

export default function Navbar() {
  const supabase = createClient()
  const [user, setUser] = useState<any>(null)
  const [darkMode, setDarkMode] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)

  useEffect(() => {
    const checkUser = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) setUser(user)
    }
    checkUser()

    if (localStorage.theme === 'dark' || (!('theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
      setDarkMode(true)
      document.documentElement.classList.add('dark')
    } else {
      setDarkMode(false)
      document.documentElement.classList.remove('dark')
    }
  }, [])

  const toggleDarkMode = () => {
    if (darkMode) {
      document.documentElement.classList.remove('dark')
      localStorage.theme = 'light'
      setDarkMode(false)
    } else {
      document.documentElement.classList.add這三個問題非常明確，主要是因為：
1. **送出回覆失敗**：Supabase 資料庫中的 `feedback` 與 `proposals` 資料表當初建立時**缺少 `reply`（官方回覆）欄位**，導致資料庫報錯 `Could not find the 'reply' column`。
2. **側邊選單**：需要將頂部橫向導覽列改為像 Gemini / ChatGPT 那樣的**左側展開式側邊欄（帶有選單圖示、包含：首頁、回饋與建言、學生提案、個人資料）**。
3. **儲存狀態與刪除按鈕**：介面邏輯已重新梳理，恢復提案狀態下拉選單、儲存修改按鈕與刪除功能。

請按照以下步驟一次修復完成！

---

### 📍 步驟一：去 Supabase 新增資料庫欄位（解決回覆失敗問題）

1. 請開啟 [Supabase 後台](https://supabase.com)，進入你的專案。
2. 點擊左側選單的 **SQL Editor**。
3. 點擊 **New query**，將下方 SQL 貼入並按下 **Run** 執行：

```sql
-- 增加官方回覆欄位
ALTER TABLE feedback ADD COLUMN IF NOT EXISTS reply TEXT;
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS reply TEXT;

-- 確保 proposals 有狀態欄位
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS status TEXT DEFAULT '研議中';

@'
'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'

export default function Navbar() {
  const supabase = createClient()
  const [user, setUser] = useState<any>(null)
  const [isOpen, setIsOpen] = useState(false)
  const [darkMode, setDarkMode] = useState(false)

  useEffect(() => {
    const checkUser = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) setUser(user)
    }
    checkUser()

    if (localStorage.theme === 'dark' || (!('theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
      setDarkMode(true)
      document.documentElement.classList.add('dark')
    } else {
      setDarkMode(false)
      document.documentElement.classList.remove('dark')
    }
  }, [])

  const toggleDarkMode = () => {
    if (darkMode) {
      document.documentElement.classList.remove('dark')
      localStorage.theme = 'light'
      setDarkMode(false)
    } else {
      document.documentElement.classList.add('dark')
      setDarkMode(true)
    }
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    window.location.href = '/'
  }

  const userName = user?.user_metadata?.full_name || user?.user_metadata?.name || user?.email?.split('@')[0] || '使用者'

  return (
    <>
      {/* 頂部導覽列 */}
      <nav className="bg-white dark:bg-slate-900 border-b dark:border-slate-800 sticky top-0 z-40 transition-colors">
        <div className="max-w-7xl mx-auto px-4 h-16 flex justify-between items-center">
          
          {/* 左側： Gemini 樣式展開按鈕 (四條橫線/漢堡圖示) + Logo */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsOpen(true)}
              className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-slate-800 transition text-gray-700 dark:text-slate-200"
              title="開啟側邊選單"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 5.25h16.5m-16.5 4.5h16.5m-16.5 4.5h16.5m-16.5 4.5h16.5" />
              </svg>
            </button>

            <Link className="font-extrabold text-lg tracking-tight text-gray-900 dark:text-white flex items-center gap-2" href="/">
              🎓 竹科實心中學權組
            </Link>
          </div>

          {/* 右側：深淺色與用戶資訊 */}
          <div className="flex items-center gap-3">
            <button
              onClick={toggleDarkMode}
              className="px-3 py-1.5 bg-gray-100 dark:bg-slate-800 hover:bg-gray-200 dark:hover:bg-slate-700 text-gray-700 dark:text-slate-200 rounded-xl font-bold text-xs transition"
            >
              {darkMode ? '🌙 深色' : '☀️ 淺色'}
            </button>

            {user && (
              <button
                onClick={handleLogout}
                className="bg-red-600 hover:bg-red-700 text-white font-bold text-xs px-3.5 py-1.5 rounded-xl transition"
              >
                🚪 登出
              </button>
            )}
          </div>
        </div>
      </nav>

      {/* 半透明黑色遮罩 */}
      {isOpen && (
        <div
          onClick={() => setIsOpen(false)}
          className="fixed inset-0 bg-black/50 z-50 transition-opacity"
        />
      )}

      {/* 左側抽屜式側邊欄 (Gemini 風格) */}
      <aside
        className={`fixed top-0 left-0 bottom-0 w-72 bg-white dark:bg-slate-900 z-50 shadow-2xl transform transition-transform duration-300 ease-in-out border-r dark:border-slate-800 flex flex-col justify-between ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div>
          {/* 側邊欄頂部 */}
          <div className="p-5 border-b dark:border-slate-800 flex justify-between items-center">
            <span className="font-extrabold text-base text-gray-900 dark:text-white flex items-center gap-2">
              🎓 導覽選單
            </span>
            <button
              onClick={() => setIsOpen(false)}
              className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-slate-800 transition"
            >
              ✕
            </button>
          </div>

          {/* 四大核心功能選項 */}
          <div className="p-4 space-y-2">
            <Link href="/" onClick="{()"> setIsOpen(false)}
              className="flex items-center gap-3 px-4 py-3 text-sm font-bold text-gray-700 dark:text-slate-200 hover:bg-blue-50 dark:hover:bg-slate-800 rounded-xl transition group"
            >
              <span className="text-lg">🏠</span>
              <span className="group-hover:text-blue-600 dark:group-hover:text-blue-400">首頁</span>
            </Link>

            <Link href="/feedback" onClick="{()"> setIsOpen(false)}
              className="flex items-center gap-3 px-4 py-3 text-sm font-bold text-gray-700 dark:text-slate-200 hover:bg-blue-50 dark:hover:bg-slate-800 rounded-xl transition group"
            >
              <span className="text-lg">💬</span>
              <span className="group-hover:text-blue-600 dark:group-hover:text-blue-400">回饋與建言</span>
            </Link>

            <Link href="/proposals" onClick="{()"> setIsOpen(false)}
              className="flex items-center gap-3 px-4 py-3 text-sm font-bold text-gray-700 dark:text-slate-200 hover:bg-blue-50 dark:hover:bg-slate-800 rounded-xl transition group"
            >
              <span className="text-lg">💡</span>
              <span className="group-hover:text-blue-600 dark:group-hover:text-blue-400">學生提案</span>
            </Link>

            {user && (
              <Link href="/profile" onClick="{()"> setIsOpen(false)}
                className="flex items-center gap-3 px-4 py-3 text-sm font-bold text-gray-700 dark:text-slate-200 hover:bg-blue-50 dark:hover:bg-slate-800 rounded-xl transition group"
              >
                <span className="text-lg">👤</span>
                <span className="group-hover:text-blue-600 dark:group-hover:text-blue-400">個人資料</span>
              </Link>
            )}
          </div>
        </div>

        {/* 側邊欄底部使用者資訊 */}
        {user && (
          <div className="p-4 border-t dark:border-slate-800 bg-gray-50 dark:bg-slate-800/50">
            <p className="text-xs text-gray-500 dark:text-slate-400 font-bold">目前登入為：</p>
            <p className="text-sm font-extrabold text-gray-800 dark:text-slate-200 truncate mt-0.5">{userName}</p>
          </div>
        )}
      </aside>
    </>
  )
}
