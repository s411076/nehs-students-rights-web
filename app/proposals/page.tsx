'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'

export default function ProposalsPage() {
  const supabase = createClient()
  const [user, setUser] = useState<any>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [proposals, setProposals] = useState<any[]>([])
  const [statusDrafts, setStatusDrafts] = useState<{ [key: string]: string }>({})
  const [replyInputs, setReplyInputs] = useState<{ [key: string]: string }>({})
  const [savingId, setSavingId] = useState<string | null>(null)

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
        const adminFound = adminList.some((a) => a.email.trim().toLowerCase() === userEmail)
        setIsAdmin(adminFound)
      }
    }
  }

  const loadProposals = async () => {
    const { data, error } = await supabase.from('proposals').select('*').order('created_at', { ascending: false })
    if (data) {
      setProposals(data)
      const initialDrafts: { [key: string]: string } = {}
      const initialReplies: { [key: string]: string } = {}
      data.forEach(p => {
        initialDrafts[p.id] = p.status || '研議中'
        initialReplies[p.id] = p.reply || ''
      })
      setStatusDrafts(initialDrafts)
      setReplyInputs(initialReplies)
    }
  }

  useEffect(() => {
    checkUserAndRole()
    loadProposals()
  }, [])

  const handleCreateProposal = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user) return alert('請先登入！')
    setSubmitting(true)

    const authorName = user.user_metadata?.full_name || user.user_metadata?.name || user.email.split('@')[0]
    const { error } = await supabase.from('proposals').insert([
      { title, content, author_email: user.email, author_name: authorName, status: '研議中' }
    ])

    if (error) alert('發布失敗：' + error.message)
    else {
      alert('提案發布成功！')
      setTitle('')
      setContent('')
      loadProposals()
    }
    setSubmitting(false)
  }

  const handleDelete = async (id: string) => {
    if (!window.confirm('確定要刪除這則提案嗎？')) return
    const { error } = await supabase.from('proposals').delete().eq('id', id)
    if (error) alert('刪除失敗：' + error.message)
    else {
      alert('提案已成功刪除！')
      loadProposals()
    }
  }

  // 獨立儲存提案狀態
  const handleSaveStatus = async (id: string) => {
    setSavingId(id)
    const newStatus = statusDrafts[id] || '研議中'
    const { error } = await supabase.from('proposals').update({ status: newStatus }).eq('id', id)

    if (error) {
      alert('修改狀態失敗：' + error.message)
    } else {
      alert(`提案狀態已成功更新為【${newStatus}】！`)
      loadProposals()
    }
    setSavingId(null)
  }

  // 獨立儲存官方回覆
  const handleSaveReply = async (id: string) => {
    setSavingId(id)
    const replyText = replyInputs[id] || ''
    const { error } = await supabase.from('proposals').update({ reply: replyText }).eq('id', id)

    if (error) {
      alert('發布回覆失敗：' + error.message)
    } else {
      alert('官方回覆已成功更新！')
      loadProposals()
    }
    setSavingId(null)
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-950 text-gray-900 dark:text-slate-100 transition-colors">
      <main className="max-w-4xl mx-auto p-6">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-extrabold">💡 學生提案區</h1>
          {isAdmin && (
            <span className="bg-purple-100 dark:bg-purple-900/60 text-purple-700 dark:text-purple-300 text-xs px-3 py-1.5 rounded-full font-bold">
              🔑 您目前為學權組管理員
            </span>
          )}
        </div>

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
                placeholder="提案詳細內容..."
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

        <div className="space-y-6">
          {proposals.map((p) => (
            <div id={`item-${p.id}`} key={p.id} className="bg-white dark:bg-slate-900 p-6 rounded-2xl border dark:border-slate-800 shadow-sm relative">
              
              {/* 卡片標頭與狀態列 */}
              <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3 mb-3">
                <h3 className="text-xl font-bold">{p.title}</h3>

                {/* 狀態展示與管理員變更區 */}
                <div className="flex items-center gap-2">
                  {isAdmin ? (
                    <div className="flex items-center gap-1.5 bg-purple-50 dark:bg-purple-950/50 p-1.5 rounded-xl border border-purple-200 dark:border-purple-800">
                      <select
                        value={statusDrafts[p.id] || '研議中'}
                        onChange={(e) => setStatusDrafts({ ...statusDrafts, [p.id]: e.target.value })}
                        className="border dark:border-slate-700 bg-white dark:bg-slate-800 text-xs rounded-lg p-1.5 font-bold outline-none"
                      >
                        <option value="研議中">研議中</option>
                        <option value="通過">通過</option>
                        <option value="不通過">不通過</option>
                        <option value="執行中">執行中</option>
                      </select>

                      <button
                        onClick={() => handleSaveStatus(p.id)}
                        disabled={savingId === p.id}
                        className="bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold px-3 py-1.5 rounded-lg transition cursor-pointer"
                      >
                        💾 儲存狀態
                      </button>
                    </div>
                  ) : (
                    <span className="bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300 text-xs px-3 py-1 rounded-full font-bold">
                      {p.status || '研議中'}
                    </span>
                  )}

                  {isAdmin && (
                    <button
                      onClick={() => handleDelete(p.id)}
                      className="bg-red-50 dark:bg-red-950/50 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800 text-xs px-2.5 py-1.5 rounded-lg font-bold hover:bg-red-100 transition"
                      title="刪除提案"
                    >
                      🗑️ 刪除
                    </button>
                  )}
                </div>
              </div>

              <p className="text-xs text-gray-500 dark:text-slate-400 mb-4">
                提案人：{p.author_name || '學生'} • 發布時間：{new Date(p.created_at).toLocaleString()}
              </p>

              <p className="text-gray-700 dark:text-slate-300 text-sm whitespace-pre-line mb-4">{p.content}</p>

              {/* 已發布的官方回覆 */}
              {p.reply && (
                <div className="bg-purple-50 dark:bg-purple-950/40 border-l-4 border-purple-600 p-4 rounded-r-xl my-4">
                  <p className="text-xs font-bold text-purple-800 dark:text-purple-300 mb-1">📢 學權組官方回覆：</p>
                  <p className="text-sm text-purple-950 dark:text-purple-200 whitespace-pre-line">{p.reply}</p>
                </div>
              )}

              {/* 管理員官方回覆編輯區 */}
              {isAdmin && (
                <div className="mt-4 pt-4 border-t dark:border-slate-800">
                  <label className="block text-xs font-bold text-purple-700 dark:text-purple-400 mb-2">🔑 發布 / 修改官方回覆：</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="輸入官方回覆內容..."
                      value={replyInputs[p.id] || ''}
                      onChange={(e) => setReplyInputs({ ...replyInputs, [p.id]: e.target.value })}
                      className="flex-1 border dark:border-slate-700 bg-gray-50 dark:bg-slate-800 text-xs rounded-lg p-2 outline-none focus:ring-1 focus:ring-purple-500"
                    />
                    <button
                      onClick={() => handleSaveReply(p.id)}
                      disabled={savingId === p.id}
                      className="bg-purple-700 hover:bg-purple-800 text-white text-xs font-bold px-4 py-2 rounded-lg transition"
                    >
                      💬 送出回覆
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </main>
    </div>
  )
}
