'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'

export default function Navbar() {
  const supabase = createClient()
  const [user, setUser] = useState<any>(null)
  const [darkMode, setDarkMode] = useState(false)

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

  const userName = user?.user_metadata?.full_name || user?.user_metadata?.name || user?.email?.split('@')[0]

  return (
    <nav className="border-b bg-white dark:bg-slate-900 border-gray-200 dark:border-slate-800 transition-colors">
      <div className="max-w-5xl mx-auto px-6 py-4 flex justify-between items-center">
        <Link href="/" className="font-extrabold text-lg text-gray-900 dark:text-white flex items-center gap-2">
          🎓 國立竹科實中 學生權益網
        </Link>

        <div className="flex items-center gap-4 text-sm">
          <Link href="/proposals" className="text-gray-600 dark:text-slate-300 hover:text-blue-600 font-medium">
            💡 學生提案
          </Link>

          <button
            onClick={toggleDarkMode}
            className="p-2 rounded-lg bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-amber-400 hover:bg-gray-200 dark:hover:bg-slate-700 transition"
            title="切換深淺模式"
          >
            {darkMode ? '☀️ 淺色' : '🌙 深色'}
          </button>

          {user ? (
            <div className="flex items-center gap-3">
              <Link href="/profile" className="font-bold text-blue-600 dark:text-blue-400 hover:underline">
                👤 {userName}
              </Link>
              <button
                onClick={handleLogout}
                className="bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-red-100 transition"
              >
                登出
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </nav>
  )
}
