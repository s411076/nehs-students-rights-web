'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'

export default function ProposalsPage() {
  const supabase = createClient()
  const [user, setUser] = useState<any>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [proposals, setProposals] = useState<any[]>([])
  const [statusDrafts, setStatusDrafts] = useState<{ [key: string]: string }>({})

  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const checkUserAndRole = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (user && user.email) {
      setUser(user)
      const userEmail = user.email.trim().toLowerCase()
      const { data: adminList } = await supabase.from('admins').select('email')
      if (adminList) {
        setIsAdmin(adminList.some((a) => a.email.trim().toLowerCase() === userEmail))
      }
    }
  }

  const loadProposals = async () => {
    const { data } = await supabase.from('proposals').select('*').order('created_at', { ascending: false })
    if (data) {
      setProposals(data)
      const initialDrafts: { [key: string]: string } = {}
      data.forEach(p => {
        initialDrafts[p.id] = p.status || '研議中'
      })
      setStatusDrafts(initialDrafts)
    }
  }

  useEffect(() => {
    checkUserAndRole()
    loadProposals()
  }, [])

  const handleCreateProposal = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user) {
      alert('請先登入後再發起提案！')
      return
    }
    setSubmitting(true)

    const authorName = user.user_metadata?.full_name || user.user_metadata?.name || user.email.split('@')[0]
    const { error } = await supabase.from('proposals').insert([
      { title, content, author_email: user.email, author_name: authorName, status: '研議中' }
    ])

    if (error) {
      alert('新增失敗：' + error.message)
    } else {
      alert('提案發布成功！')
      setTitle('')
      setContent('')
      loadProposals()
    }
    setSubmitting(false)
  }

  const handleSaveStatus = async (id: string) => {
    const newStatus = statusDrafts[id]
    const { error } = await supabase.from('proposals').update({ status: newStatus }).eq('id', id)
    if (error) {
      alert('狀態更新失敗：' + error.message)
    } else {
      alert('提案狀態已更新並儲存！')
      loadProposals()
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-950 text-gray-900 dark:text-slate-100 transition-colors">
      <main className="max-w-4xl mx-auto p-6">
        <h1 className="text-2xl font-extrabold mb-6">💡 學生提案區</h1>

        {user && (
          <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border dark:border-slate-800 shadow-sm mb-8">
            <h2 className="text-lg font-bold mb-4">✍️ 發起新提案</h2>
            <form onSubmit={handleCreateProposal} className="space-y-4">
              <input
                type="text"
                required
                placeholder="提案標題..."
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full border dark:border-slate-700 bg-gray-50 dark:bg-slate-800 rounded-lg p-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500"
              />
              <textarea
                required
                rows={4}
                placeholder="詳細敘述你的提案內容與建議..."
                value={content}
                onChange={(e) => setContent(e.target.value)}
                className="w-full border dark:border-slate-700 bg-gray-50 dark:bg-slate-800 rounded-lg p-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                type="submit"
                disabled={submitting}
                className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm px-6 py-2.5 rounded-lg transition"
              >
                {submitting ? '提交中...' : '提交提案'}
              </button>
            </form>
          </div>
        )}

        <div className="space-y-4">
          {proposals.map((p) => (
            <div key={p.id} className="bg-white dark:bg-slate-900 p-6 rounded-2xl border dark:border-slate-800 shadow-sm">
              <div className="flex justify-between items-start mb-2">
                <h3 className="text-xl font-bold">{p.title}</h3>
                
                {isAdmin ? (
                  <div className="flex items-center gap-2">
                    <select
                      value={statusDrafts[p.id] || '研議中'}
                      onChange={(e) => setStatusDrafts({ ...statusDrafts, [p.id]: e.target.value })}
                      className="border dark:border-slate-700 bg-gray-50 dark:bg-slate-800 text-xs rounded-lg p-1.5 font-bold"
                    >
                      <option value="研議中">研議中</option>
                      <option value="通過">通過</option>
                      <option value="不通過">不通過</option>
                      <option value="執行中">執行中</option>
                    </select>
                    <button
                      onClick={() => handleSaveStatus(p.id)}
                      className="bg-green-600 hover:bg-green-700 text-white text-xs font-bold px-3 py-1.5 rounded-lg transition"
                    >
                      💾 儲存
                    </button>
                  </div>
                ) : (
                  <span className="bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300 text-xs px-3 py-1 rounded-full font-bold">
                    {p.status || '研議中'}
                  </span>
                )}
              </div>

              <p className="text-xs text-gray-500 dark:text-slate-400 mb-4">
                提案人：{p.author_name || '學生'}
              </p>
              <p className="text-gray-700 dark:text-slate-300 text-sm whitespace-pre-line">{p.content}</p>
            </div>
          ))}
        </div>
      </main>
    </div>
  )
}
