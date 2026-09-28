'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'

export default function Navbar() {
  const supabase = createClient()
  const [user, setUser] = useState<any>(null)
  const [darkMode, setDarkMode] = useState(false)

  useEffect(() => {
    // 初始化檢查使用者
    const checkUser = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) setUser(user)
    }
    checkUser()

    // 初始化深色模式
    if (localStorage.theme === 'dark' || (!('theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
      setDarkMode(true)
      document.documentElement.classList.add('dark')
    } else {
      setDarkMode(false)
      document.documentElement.classList.remove('dark')
    }
  }, [])

  // 切換深淺色模式
  const toggleDarkMode = () => {
    if (darkMode) {
      document.documentElement.classList.remove('dark')
      localStorage.theme = 'light'
      setDarkMode(false)
    } else {
      document.documentElement.classList.add('dark')
    }
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    window.location.href = '/'
  }

  const userName = user?.user_metadata?.full_name || user?.user_metadata?.name || user?.email?.split('@')[0] || '使用者'

  return (
    <nav className="bg-white dark:bg-slate-900 border-b dark:border-slate-800 transition-colors sticky top-0 z-50">
      <div className="max-w-6xl mx-auto px-4 h-16 flex justify-between items-center">
        {/* 左側 Logo 與導覽選單 */}
        <div className="flex items-center gap-6">
          <Link href="/" className="font-extrabold text-lg flex items-center gap-2 text-gray-900 dark:text-white">
            🎓 竹科實心中學權組
          </Link>
          
          <div className="hidden md:flex gap-4 text-sm font-bold text-gray-600 dark:text-slate-300">
            <Link href="/" className="hover:text-blue-600 dark:hover:text-blue-400 transition">首頁</Link>
            <Link href="/feedback" className="hover:text-blue-600 dark:hover:text-blue-400 transition">回饋與建言</Link>
            <Link href="/proposals" className="hover:text-blue-600 dark:hover:text-blue-400 transition">學生提案</Link>
            {user && (
              <Link href="/profile" className="hover:text-blue-600 dark:hover:text-blue-400 transition">個人資料</Link>
            )}
          </div>
        </div>

        {/* 右側 功能按鈕區 */}
        <div className="flex items-center gap-3 text-sm">
          {/* 深淺色切換按鈕 */}
          <button
            onClick={toggleDarkMode}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 dark:bg-slate-800 hover:bg-gray-200 dark:hover:bg-slate-700 text-gray-700 dark:text-slate-200 rounded-xl font-bold transition"
          >
            {darkMode ? '🌙 深色' : '☀️ 淺色'}
          </button>

          {/* 使用者資訊與登出按鈕 */}
          {user && (
            <>
              <span className="hidden sm:inline font-bold text-gray-700 dark:text-slate-200">
                👤 {userName}
              </span>
              <button
                onClick={handleLogout}
                className="bg-red-600 hover:bg-red-700 text-white font-bold px-3.5 py-1.5 rounded-xl transition"
              >
                🚪 登出
              </button>
            </>
          )}
        </div>
      </div>
    </nav>
  )
}
