'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import confetti from 'canvas-confetti'
import { useRouter } from 'next/navigation'

export default function HomePage() {
  const supabase = createClient()
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [sections, setSections] = useState<any[]>([])
  const [proposals, setProposals] = useState<any[]>([])
  const [feedbacks, setFeedbacks] = useState<any[]>([])
  const [searchQuery, setSearchQuery] = useState('')

  const [newTitle, setNewTitle] = useState('')
  const [newContent, setNewContent] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const [posStudent, setPosStudent] = useState({ x: 0, y: 0 })
  const [posAdmin, setPosAdmin] = useState({ x: 0, y: 0 })

  useEffect(() => {
    const interval = setInterval(() => {
      setPosStudent({
        x: Math.sin(Date.now() / 800) * 18,
        y: Math.cos(Date.now() / 600) * 10
      })
      setPosAdmin({
        x: Math.cos(Date.now() / 700) * -15,
        y: Math.sin(Date.now() / 900) * -8
      })
    }, 50)
    return () => clearInterval(interval)
  }, [])

  const triggerConfetti = () => {
    confetti({ particleCount: 120, spread: 80, origin: { y: 0.6 } })
  }

  const checkUserAndRole = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (user && user.email) {
      setUser(user)
      const userEmail = user.email.trim().toLowerCase()
      const { data: adminList } = await supabase.from('admins').select('email')
      if (adminList) {
        setIsAdmin(adminList.some((a) => a.email.trim().toLowerCase() === userEmail))
      }

      if (sessionStorage.getItem('just_logged_in') === 'true') {
        triggerConfetti()
        sessionStorage.removeItem('just_logged_in')
      }
    }
  }

  const loadData = async () => {
    const { data: secData } = await supabase.from('home_sections').select('*').order('created_at', { ascending: false })
    if (secData) setSections(secData)

    const { data: propData } = await supabase.from('proposals').select('*').order('created_at', { ascending: false })
    if (propData) setProposals(propData)

    const { data: fbData } = await supabase.from('feedback').select('*').order('created_at', { ascending: false })
    if (fbData) setFeedbacks(fbData)
  }

  useEffect(() => {
    checkUserAndRole()
    loadData()
  }, [])

  const handleLogin = async (role: 'student' | 'admin') => {
    sessionStorage.setItem('just_logged_in', 'true')
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin,
        queryParams: { hd: 'nehs.hc.edu.tw' }
      }
    })
  }

  const handleAddSection = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newTitle.trim() || !newContent.trim()) return

    setSubmitting(true)
    const { error } = await supabase.from('home_sections').insert([{ title: newTitle, content: newContent }])

    if (error) alert('新增失敗：' + error.message)
    else {
      alert('首頁欄位發布成功！')
      setNewTitle('')
      setNewContent('')
      loadData()
    }
    setSubmitting(false)
  }

  const handleDeleteSection = async (id: string) => {
    if (!window.confirm('確定要刪除此首頁欄位嗎？')) return
    const { error } = await supabase.from('home_sections').delete().eq('id', id)
    if (error) alert('刪除失敗：' + error.message)
    else loadData()
  }

  // 全站搜尋比對（包含提案標題/內容、建言標題/內容/留言）
  const q = searchQuery.trim().toLowerCase()
  const searchResults = q ? [
    ...proposals
      .filter(p => p.title?.toLowerCase().includes(q) || p.content?.toLowerCase().includes(q))
      .map(p => ({
        id: p.id,
        type: 'proposal',
        title: p.title || '無標題提案',
        preview: p.content,
        url: `/proposals#item-${p.id}`,
        badge: '💡 學生提案',
        status: p.status || '研議中'
      })),
    ...feedbacks
      .filter(f => f.title?.toLowerCase().includes(q) || f.content?.toLowerCase().includes(q))
      .map(f => ({
        id: f.id,
        type: 'feedback',
        title: f.title || f.content?.slice(0, 20) || '無標題建言',
        preview: f.content,
        url: `/feedback#item-${f.id}`,
        badge: '💬 建言/留言',
        status: null
      }))
  ] : []

  const userName = user?.user_metadata?.full_name || user?.user_metadata?.name || user?.email?.split('@')[0]

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-950 text-gray-900 dark:text-slate-100 transition-colors">
      <main className="max-w-4xl mx-auto p-6">
        <div className="text-center my-8">
          <h1 className="text-3xl font-extrabold mb-2">🎓 國立竹科實中 學生權益網</h1>
          <p className="text-gray-600 dark:text-slate-400 text-sm">維護學生權益・促進校園溝通・即時反映意見</p>
        </div>

        {!user ? (
          <div className="bg-white dark:bg-slate-900 border dark:border-slate-800 p-8 rounded-2xl shadow-lg mb-10 text-center relative overflow-hidden">
            <h2 className="text-xl font-bold mb-6 text-gray-800 dark:text-slate-200">請選擇身分登入系統（限 @nehs.hc.edu.tw）</h2>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-6 py-6 relative min-h-[160px]">
              <button
                onClick={() => handleLogin('student')}
                style={{ transform: `translate(${posStudent.x}px, ${posStudent.y}px)` }}
                className="w-full sm:w-auto flex-1 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-extrabold text-2xl py-6 px-10 rounded-2xl shadow-xl hover:shadow-2xl transition-all duration-150 flex items-center justify-center gap-3 cursor-pointer border-2 border-blue-400"
              >
                <span>🎓 學生登入</span>
                <span className="text-xs bg-white/20 px-2.5 py-1 rounded-full font-normal">主要權限</span>
              </button>

              <button
                onClick={() => handleLogin('admin')}
                style={{ transform: `translate(${posAdmin.x}px, ${posAdmin.y}px)` }}
                className="bg-purple-100 dark:bg-purple-950/60 text-purple-800 dark:text-purple-300 border border-purple-300 dark:border-purple-700 font-bold text-xs py-2.5 px-4 rounded-xl hover:bg-purple-200 transition-all duration-150 cursor-pointer shadow-sm"
              >
                🔑 學權組登入
              </button>
            </div>
          </div>
        ) : (
          <div className="bg-blue-50 dark:bg-slate-900/80 border border-blue-200 dark:border-slate-800 p-4 rounded-xl mb-8 flex justify-between items-center">
            <span className="font-bold text-blue-900 dark:text-blue-300">
              🎉 歡迎回來，{userName}！
            </span>
            {isAdmin && (
              <span className="bg-purple-100 dark:bg-purple-900/60 text-purple-700 dark:text-purple-300 text-xs px-3 py-1 rounded-full font-bold">
                學權組管理員權限
              </span>
            )}
          </div>
        )}

        {/* 全站精準搜尋列 */}
        <div className="bg-white dark:bg-slate-900 border dark:border-slate-800 p-5 rounded-2xl shadow-sm mb-8">
          <label className="block text-xs font-bold text-gray-500 dark:text-slate-400 mb-2">🔍 搜尋全站提案、建言與留言</label>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="輸入關鍵字搜尋（如：鞦韆、午餐、體育...）"
            className="w-full border dark:border-slate-700 bg-gray-50 dark:bg-slate-800 rounded-xl p-3 text-sm outline-none focus:ring-2 focus:ring-blue-500 dark:text-white"
          />

          {searchQuery.trim() && (
            <div className="mt-4 space-y-2">
              <p className="text-xs font-bold text-gray-500 dark:text-slate-400">
                搜尋結果 ({searchResults.length} 筆)：
              </p>
              {searchResults.length === 0 ? (
                <p className="text-xs text-gray-400 py-2">找不到符合「{searchQuery}」的提案或建言。</p>
              ) : (
                searchResults.map((res) => (
                  <div
                    key={`${res.type}-${res.id}`}
                    onClick={() => router.push(res.url)}
                    className="p-3.5 bg-gray-50 dark:bg-slate-800/80 hover:bg-blue-50 dark:hover:bg-slate-700/80 rounded-xl border dark:border-slate-700/60 cursor-pointer transition flex justify-between items-center group"
                  >
                    <div className="flex-1 pr-4">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-gray-200 dark:bg-slate-700 text-gray-700 dark:text-slate-200">
                          {res.badge}
                        </span>
                        <span className="font-bold text-sm text-gray-800 dark:text-slate-100 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition">
                          {res.title}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 dark:text-slate-400 line-clamp-1">
                        {res.preview}
                      </p>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      {res.status && (
                        <span className="text-[11px] font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/40 px-2.5 py-1 rounded-md">
                          {res.status}
                        </span>
                      )}
                      <span className="text-xs font-bold text-blue-600 dark:text-blue-400">👉 前往</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {isAdmin && (
          <div className="bg-purple-50 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-800 p-6 rounded-xl mb-8 shadow-sm">
            <h2 className="text-lg font-bold text-purple-900 dark:text-purple-300 mb-3">🔑 管理員控制台：新增首頁動態欄位</h2>
            <form onSubmit={handleAddSection} className="space-y-3">
              <input
                type="text"
                required
                placeholder="欄位標題..."
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                className="w-full border dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg p-2.5 text-sm outline-none"
              />
              <textarea
                required
                rows={3}
                placeholder="欄位內容與公告細節..."
                value={newContent}
                onChange={(e) => setNewContent(e.target.value)}
                className="w-full border dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg p-2.5 text-sm outline-none"
              />
              <button
                type="submit"
                disabled={submitting}
                className="bg-purple-700 hover:bg-purple-800 text-white font-bold text-sm px-5 py-2 rounded-lg transition"
              >
                {submitting ? '發布中...' : '發布到首頁'}
              </button>
            </form>
          </div>
        )}

        <div className="space-y-6">
          {sections.map((section) => (
            <div key={section.id} className="bg-white dark:bg-slate-900 p-6 rounded-xl border dark:border-slate-800 shadow-sm relative">
              {isAdmin && (
                <button
                  onClick={() => handleDeleteSection(section.id)}
                  className="absolute top-4 right-4 bg-red-50 dark:bg-red-950/50 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800 text-xs px-2.5 py-1 rounded font-bold"
                >
                  🗑️ 刪除
                </button>
              )}
              <h2 className="text-xl font-bold mb-2">{section.title}</h2>
              <p className="text-gray-700 dark:text-slate-300 text-sm whitespace-pre-line leading-relaxed">{section.content}</p>
            </div>
          ))}
        </div>
      </main>
    </div>
  )
}

