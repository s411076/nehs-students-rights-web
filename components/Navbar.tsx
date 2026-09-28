'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'

export default function Navbar() {
  const supabase = createClient()
  const [user, setUser] = useState<any>(null)
  const [isOpen, setIsOpen] = useState(false)

  useEffect(() => {
    const checkUser = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) setUser(user)
    }
    checkUser()
  }, [])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    window.location.href = '/'
  }

  const userName = user?.user_metadata?.full_name || user?.user_metadata?.name || user?.email?.split('@')[0] || '使用者'

  return (
    <>
      <nav className="bg-white dark:bg-slate-900 border-b dark:border-slate-800 sticky top-0 z-40 transition-colors">
        <div className="max-w-7xl mx-auto px-4 h-16 flex justify-between items-center">
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

          <div className="flex items-center gap-3">
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

      {isOpen && (
        <div
          onClick={() => setIsOpen(false)}
          className="fixed inset-0 bg-black/50 z-50 transition-opacity"
        />
      )}

      <aside
        className={`fixed top-0 left-0 bottom-0 w-72 bg-white dark:bg-slate-900 z-50 shadow-2xl transform transition-transform duration-300 ease-in-out border-r dark:border-slate-800 flex flex-col justify-between ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div>
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

          <div className="p-4 space-y-2">
            <Link href="/" onClick={() => setIsOpen(false)}
              className="flex items-center gap-3 px-4 py-3 text-sm font-bold text-gray-700 dark:text-slate-200 hover:bg-blue-50 dark:hover:bg-slate-800 rounded-xl transition group"
            >
              <span className="text-lg">🏠</span>
              <span className="group-hover:text-blue-600 dark:group-hover:text-blue-400">首頁</span>
            </Link>

            <Link href="/feedback" onClick={() => setIsOpen(false)}
              className="flex items-center gap-3 px-4 py-3 text-sm font-bold text-gray-700 dark:text-slate-200 hover:bg-blue-50 dark:hover:bg-slate-800 rounded-xl transition group"
            >
              <span className="text-lg">💬</span>
              <span className="group-hover:text-blue-600 dark:group-hover:text-blue-400">回饋與建言</span>
            </Link>

            <Link href="/proposals" onClick={() => setIsOpen(false)}
              className="flex items-center gap-3 px-4 py-3 text-sm font-bold text-gray-700 dark:text-slate-200 hover:bg-blue-50 dark:hover:bg-slate-800 rounded-xl transition group"
            >
              <span className="text-lg">💡</span>
              <span className="group-hover:text-blue-600 dark:group-hover:text-blue-400">學生提案</span>
            </Link>

            {user && (
              <Link href="/profile" onClick={() => setIsOpen(false)}
                className="flex items-center gap-3 px-4 py-3 text-sm font-bold text-gray-700 dark:text-slate-200 hover:bg-blue-50 dark:hover:bg-slate-800 rounded-xl transition group"
              >
                <span className="text-lg">👤</span>
                <span className="group-hover:text-blue-600 dark:group-hover:text-blue-400">個人資料</span>
              </Link>
            )}
          </div>
        </div>

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
