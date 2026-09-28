'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'

export default function Navbar() {
  const supabase = createClient()
  const [user, setUser] = useState<any>(null)
  const [darkMode, setDarkMode] = useState(false)
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)

  useEffect(() => {
    const isDark = localStorage.getItem('theme') === 'dark' || 
      (!('theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches)
    
    setDarkMode(isDark)
    if (isDark) {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }

    const checkUser = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      setUser(user)
    }
    checkUser()

    const { data: authListener } = supabase.auth.onAuthStateChange((_, session) => {
      setUser(session?.user ?? null)
    })

    return () => {
      authListener.subscription.unsubscribe()
    }
  }, [])

  const toggleDarkMode = () => {
    const nextMode = !darkMode
    setDarkMode(nextMode)
    if (nextMode) {
      document.documentElement.classList.add('dark')
      localStorage.setItem('theme', 'dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    window.location.href = '/'
  }

  const handleProfileClick = (e: React.MouseEvent) => {
    if (!user) {
      e.preventDefault()
      alert('請先至首頁登入')
    } else {
      setIsSidebarOpen(false)
    }
  }

  const userName = user?.user_metadata?.full_name || user?.user_metadata?.name || user?.email?.split('@')[0]

  return (
    <>
      <nav className="border-b bg-white dark:bg-slate-900 border-gray-200 dark:border-slate-800 transition-colors sticky top-0 z-40 shadow-sm">
        <div className="max-w-6xl mx-auto px-4 py-3 flex justify-between items-center">
          
          {/* 左側：展開選單按鈕 + 網站標題 */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsSidebarOpen(true)}
              className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800 text-gray-700 dark:text-slate-200 transition text-xl font-bold flex flex-col justify-center items-center gap-1 w-9 h-9"
              title="展開選單"
            >
              <div className="w-5 h-0.5 bg-current rounded-full"></div>
              <div className="w-5 h-0.5 bg-current rounded-full"></div>
              <div className="w-5 h-0.5 bg-current rounded-full"></div>
              <div className="w-5 h-0.5 bg-current rounded-full"></div>
            </button>

            <Link href="/" className="font-extrabold text-lg text-gray-900 dark:text-white flex items-center gap-2">
              🎓 竹科實心中學權組
            </Link>
          </div>

          {/* 右側：深色模式切換 + 登出按鈕 */}
          <div className="flex items-center gap-3">
            <button
              onClick={toggleDarkMode}
              className="px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-amber-400 hover:bg-gray-200 dark:hover:bg-slate-700 transition text-xs font-bold"
            >
              {darkMode ? '☀️ 淺色' : '🌙 深色'}
            </button>

            {user && (
              <div className="flex items-center gap-3">
                <span className="text-xs font-bold text-gray-600 dark:text-slate-300 hidden sm:inline">
                  👤 {userName}
                </span>
                <button
                  onClick={handleLogout}
                  className="bg-red-600 hover:bg-red-700 text-white px-3.5 py-1.5 rounded-lg text-xs font-bold transition shadow-sm"
                >
                  🚪 登出
                </button>
              </div>
            )}
          </div>
        </div>
      </nav>

      {/* 側邊展開選單 (Drawer) */}
      {isSidebarOpen && (
        <div className="fixed inset-0 z-50 flex">
          <div
            className="fixed inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setIsSidebarOpen(false)}
          ></div>

          <div className="relative bg-white dark:bg-slate-900 w-64 max-w-[80vw] h-full shadow-2xl p-6 flex flex-col z-10 transition-transform">
            <div className="flex justify-between items-center mb-8 pb-4 border-b dark:border-slate-800">
              <h2 className="font-bold text-gray-800 dark:text-white">選單</h2>
              <button
                onClick={() => setIsSidebarOpen(false)}
                className="text-gray-500 hover:text-gray-800 dark:hover:text-white font-bold text-lg"
              >
                ✕
              </button>
            </div>

            <div className="flex flex-col gap-2">
              <Link
                href="/"
                onClick={() => setIsSidebarOpen(false)}
                className="p-3 rounded-xl hover:bg-gray-100 dark:hover:bg-slate-800 font-bold text-gray-700 dark:text-slate-200 flex items-center gap-3"
              >
                🏠 首頁
              </Link>
              <Link
                href="/feedback"
                onClick={() => setIsSidebarOpen(false)}
                className="p-3 rounded-xl hover:bg-gray-100 dark:hover:bg-slate-800 font-bold text-gray-700 dark:text-slate-200 flex items-center gap-3"
              >
                💬 回饋與建言
              </Link>
              <Link
                href="/proposals"
                onClick={() => setIsSidebarOpen(false)}
                className="p-3 rounded-xl hover:bg-gray-100 dark:hover:bg-slate-800 font-bold text-gray-700 dark:text-slate-200 flex items-center gap-3"
              >
                💡 學生提案區
              </Link>
              <Link
                href="/profile"
                onClick={handleProfileClick}
                className="p-3 rounded-xl hover:bg-gray-100 dark:hover:bg-slate-800 font-bold text-gray-700 dark:text-slate-200 flex items-center gap-3"
              >
                👤 個人資料
              </Link>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
