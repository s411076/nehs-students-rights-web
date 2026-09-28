'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import Navbar from '@/components/Navbar'

export default function ProfilePage() {
  const supabase = createClient()
  const [user, setUser] = useState<any>(null)
  const [proposals, setProposals] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchData = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        setUser(user)
        const { data } = await supabase
          .from('proposals')
          .select('*')
          .eq('author_email', user.email)
          .order('created_at', { ascending: false })
        
        if (data) setProposals(data)
      }
      setLoading(false)
    }
    fetchData()
  }, [])

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-slate-950 text-gray-900 dark:text-slate-100">
        <Navbar />
        <div className="max-w-4xl mx-auto p-6 text-center py-20">載入中...</div>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-slate-950 text-gray-900 dark:text-slate-100">
        <Navbar />
        <div className="max-w-4xl mx-auto p-6 text-center py-20 font-bold">請先登入系統。</div>
      </div>
    )
  }

  const userName = user?.user_metadata?.full_name || user?.user_metadata?.name || user?.email?.split('@')[0]

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-950 text-gray-900 dark:text-slate-100 transition-colors">
      <Navbar />

      <main className="max-w-4xl mx-auto p-6">
        <div className="bg-white dark:bg-slate-900 border dark:border-slate-800 p-6 rounded-2xl shadow-sm mb-8">
          <h1 className="text-2xl font-extrabold mb-4 flex items-center gap-2">👤 個人帳號資訊</h1>
          <div className="space-y-2 text-sm text-gray-600 dark:text-slate-300">
            <p><span className="font-bold text-gray-800 dark:text-white">名稱：</span>{userName}</p>
            <p><span className="font-bold text-gray-800 dark:text-white">電子郵件：</span>{user.email}</p>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border dark:border-slate-800 p-6 rounded-2xl shadow-sm">
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2">📝 我發表的提案 ({proposals.length})</h2>
          {proposals.length === 0 ? (
            <p className="text-gray-500 dark:text-slate-400 text-sm py-4">目前尚無發表任何提案。</p>
          ) : (
            <div className="space-y-4">
              {proposals.map((p) => (
                <div key={p.id} className="p-4 border dark:border-slate-800 bg-gray-50 dark:bg-slate-800/50 rounded-xl flex justify-between items-center">
                  <div>
                    <h3 className="font-bold text-base mb-1">{p.title}</h3>
                    <p className="text-xs text-gray-500 dark:text-slate-400">發布時間：{new Date(p.created_at).toLocaleDateString()}</p>
                  </div>
                  <span className="bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300 text-xs px-3 py-1 rounded-full font-bold">
                    {p.status || '研議中'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
