'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'

export default function ProposalsPage() {
  const supabase = createClient()
  const [user, setUser] = useState<any>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [proposals, setProposals] = useState<any[]>([])
  const [commentsMap, setCommentsMap] = useState<{ [proposalId: string]: any[] }>({})
  
  const [statusDrafts, setStatusDrafts] = useState<{ [key: string]: string }>({})
  const [replyInputs, setReplyInputs] = useState<{ [key: string]: string }>({})
  const [savingId, setSavingId] = useState<string | null>(null)

  // 留言相關 State
  const [commentInputs, setCommentInputs] = useState<{ [key: string]: string }>({})
  const [anonDrafts, setAnonDrafts] = useState<{ [key: string]: boolean }>({})
  const [submittingCommentId, setSubmittingCommentId] = useState<string | null>(null)

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

  const loadProposalsAndComments = async () => {
    // 載入提案
    const { data: proposalData } = await supabase.from('proposals').select('*').order('created_at', { ascending: false })
    if (proposalData) {
      setProposals(proposalData)
      const initialDrafts: { [key: string]: string } = {}
      const initialReplies: { [key: string]: string } = {}
      proposalData.forEach(p => {
        initialDrafts[p.id] = p.status || '研議中'
        initialReplies[p.id] = p.reply || ''
      })
      setStatusDrafts(initialDrafts)
      setReplyInputs(initialReplies)
    }

    // 載入所有留言
    const { data: commentsData } = await supabase.from('proposal_comments').select('*').order('created_at', { ascending: true })
    if (commentsData) {
      const map: { [key: string]: any[] } = {}
      commentsData.forEach((c) => {
        if (!map[c.proposal_id]) map[c.proposal_id] = []
        map[c.proposal_id].push(c)
      })
      setCommentsMap(map)
    }
  }

  useEffect(() => {
    checkUserAndRole()
    loadProposalsAndComments()
  }, [])

  const handleCreateProposal = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user) return alert('請先登入！')
    setSubmitting(true)

    const authorName = user.user_metadata?.full_name || user.user_metadata?.name || user.email.split('@')[0]
    const { error } = await supabase.from('proposals').insert([
      { title, content, author_email: user.email, author_name: authorName, status: '研議中', endorsements_count: 0, endorsed_by: [] }
    ])

    if (error) alert('發布失敗：' + error.message)
    else {
      alert('提案發布成功！')
      setTitle('')
      setContent('')
      loadProposalsAndComments()
    }
    setSubmitting(false)
  }

  const handleDeleteProposal = async (id: string) => {
    if (!window.confirm('確定要刪除這則提案嗎？')) return
    const { error } = await supabase.from('proposals').delete().eq('id', id)
    if (error) alert('刪除失敗：' + error.message)
    else {
      alert('提案已成功刪除！')
      loadProposalsAndComments()
    }
  }

  const handleEndorse = async (proposal: any) => {
    if (!user) return alert('請先登入才能進行覆議！')

    const userEmail = user.email.trim().toLowerCase()
    const endorsedBy: string[] = proposal.endorsed_by || []
    const hasEndorsed = endorsedBy.includes(userEmail)

    let newEndorsedBy: string[]
    let newCount: number

    if (hasEndorsed) {
      newEndorsedBy = endorsedBy.filter((e) => e !== userEmail)
      newCount = Math.max(0, (proposal.endorsements_count || 1) - 1)
    } else {
      newEndorsedBy = [...endorsedBy, userEmail]
      newCount = (proposal.endorsements_count || 0) + 1
    }

    const { error } = await supabase
      .from('proposals')
      .update({
        endorsements_count: newCount,
        endorsed_by: newEndorsedBy,
      })
      .eq('id', proposal.id)

    if (error) alert('操作失敗：' + error.message)
    else loadProposalsAndComments()
  }

  const handleAddComment = async (proposalId: string) => {
    if (!user) return alert('請先登入才能留言！')
    const commentText = commentInputs[proposalId]?.trim()
    if (!commentText) return alert('請輸入留言內容！')

    setSubmittingCommentId(proposalId)
    const isAnon = anonDrafts[proposalId] || false
    const authorName = isAnon
      ? '匿名學生'
      : (user.user_metadata?.full_name || user.user_metadata?.name || user.email.split('@')[0] || '學生')

    const { error } = await supabase.from('proposal_comments').insert([
      {
        proposal_id: proposalId,
        content: commentText,
        is_anonymous: isAnon,
        author_name: authorName,
        author_email: user.email,
      }
    ])

    if (error) {
      alert('留言失敗：' + error.message)
    } else {
      setCommentInputs({ ...commentInputs, [proposalId]: '' })
      loadProposalsAndComments()
    }
    setSubmittingCommentId(null)
  }

  const handleDeleteComment = async (commentId: string) => {
    if (!window.confirm('確定要刪除這則留言嗎？')) return
    const { error } = await supabase.from('proposal_comments').delete().eq('id', commentId)
    if (error) alert('刪除失敗：' + error.message)
    else loadProposalsAndComments()
  }

  const handleSaveAll = async (id: string) => {
    setSavingId(id)
    const newStatus = statusDrafts[id] || '研議中'
    const replyText = replyInputs[id] || ''

    const { error } = await supabase.from('proposals').update({
      status: newStatus,
      reply: replyText
    }).eq('id', id)

    if (error) {
      alert('儲存失敗：' + error.message)
    } else {
      alert(`儲存成功！提案狀態已更新為【${newStatus}】！`)
      loadProposalsAndComments()
    }
    setSavingId(null)
  }

  const currentUserEmail = user?.email?.trim().toLowerCase()

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
          {proposals.map((p) => {
            const hasEndorsed = currentUserEmail && p.endorsed_by?.includes(currentUserEmail)
            const comments = commentsMap[p.id] || []

            return (
              <div id={`item-${p.id}`} key={p.id} className="bg-white dark:bg-slate-900 p-6 rounded-2xl border dark:border-slate-800 shadow-sm relative">
                
                <div className="flex justify-between items-start mb-3 pr-12">
                  <h3 className="text-xl font-bold">{p.title}</h3>

                  <div className="flex items-center gap-2">
                    <span className="bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300 text-xs px-3 py-1 rounded-full font-bold">
                      {p.status || '研議中'}
                    </span>
                  </div>

                  {isAdmin && (
                    <button
                      onClick={() => handleDeleteProposal(p.id)}
                      className="absolute top-6 right-6 bg-red-50 dark:bg-red-950/50 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800 text-xs px-2.5 py-1 rounded-lg font-bold hover:bg-red-100 transition"
                      title="刪除提案"
                    >
                      🗑️ 刪除
                    </button>
                  )}
                </div>

                <p className="text-xs text-gray-500 dark:text-slate-400 mb-4">
                  提案人：{p.author_name || '學生'} • 發布時間：{new Date(p.created_at).toLocaleString()}
                </p>

                <p className="text-gray-700 dark:text-slate-300 text-sm whitespace-pre-line mb-4">{p.content}</p>

                {/* 覆議按鈕 */}
                <div className="flex items-center gap-3 mb-4 pt-2">
                  <button
                    onClick={() => handleEndorse(p)}
                    className={`flex items-center gap-1.5 font-bold text-xs px-3.5 py-1.5 rounded-xl transition cursor-pointer border ${
                      hasEndorsed
                        ? 'bg-blue-600 text-white border-blue-600 hover:bg-blue-700'
                        : 'bg-blue-50 dark:bg-blue-950/60 hover:bg-blue-100 dark:hover:bg-blue-900/80 text-blue-600 dark:text-blue-300 border-blue-200 dark:border-blue-800'
                    }`}
                  >
                    <span>{hasEndorsed ? '👍 已覆議' : '👍 覆議'}</span>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-extrabold ${
                      hasEndorsed ? 'bg-white/20 text-white' : 'bg-blue-200 dark:bg-blue-800 text-blue-800 dark:text-blue-100'
                    }`}>
                      {p.endorsements_count || 0}
                    </span>
                  </button>
                </div>

                {/* 官方回覆 */}
                {p.reply && (
                  <div className="bg-purple-50 dark:bg-purple-950/40 border-l-4 border-purple-600 p-4 rounded-r-xl my-4">
                    <p className="text-xs font-bold text-purple-800 dark:text-purple-300 mb-1">📢 學權組官方回覆：</p>
                    <p className="text-sm text-purple-950 dark:text-purple-200 whitespace-pre-line">{p.reply}</p>
                  </div>
                )}

                {/* 管理員控制台 */}
                {isAdmin && (
                  <div className="mt-4 pt-4 border-t dark:border-slate-800 bg-purple-50/50 dark:bg-purple-950/20 p-4 rounded-xl border border-purple-100 dark:border-purple-900/50 space-y-3 mb-6">
                    <p className="text-xs font-bold text-purple-800 dark:text-purple-300">🔑 管理員控制台（修改狀態與官方回覆）：</p>
                    
                    <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-gray-600 dark:text-slate-400 whitespace-nowrap">提案狀態：</span>
                        <select
                          value={statusDrafts[p.id] || '研議中'}
                          onChange={(e) => setStatusDrafts({ ...statusDrafts, [p.id]: e.target.value })}
                          className="border border-purple-300 dark:border-purple-700 bg-white dark:bg-slate-800 text-xs rounded-lg p-2 font-bold outline-none focus:ring-2 focus:ring-purple-500"
                        >
                          <option value="研議中">研議中</option>
                          <option value="通過">通過</option>
                          <option value="不通過">不通過</option>
                          <option value="執行中">執行中</option>
                        </select>
                      </div>

                      <input
                        type="text"
                        placeholder="輸入官方回覆內容..."
                        value={replyInputs[p.id] || ''}
                        onChange={(e) => setReplyInputs({ ...replyInputs, [p.id]: e.target.value })}
                        className="flex-1 border border-purple-200 dark:border-purple-800 bg-white dark:bg-slate-800 text-xs rounded-lg p-2 outline-none focus:ring-2 focus:ring-purple-500"
                      />

                      <button
                        onClick={() => handleSaveAll(p.id)}
                        disabled={savingId === p.id}
                        className="bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold px-4 py-2 rounded-lg transition shrink-0 cursor-pointer shadow-sm"
                      >
                        💾 儲存修改
                      </button>
                    </div>
                  </div>
                )}

                {/* 💬 留言區塊 */}
                <div className="mt-6 pt-4 border-t dark:border-slate-800">
                  <h4 className="text-sm font-bold mb-3 text-gray-700 dark:text-slate-300 flex items-center gap-1.5">
                    💬 討論與留言 ({comments.length})
                  </h4>

                  {/* 留言列表 */}
                  <div className="space-y-3 mb-4 max-h-60 overflow-y-auto pr-1">
                    {comments.length === 0 ? (
                      <p className="text-xs text-gray-400 dark:text-slate-500 italic">尚無留言，成為第一個留言的人吧！</p>
                    ) : (
                      comments.map((c) => (
                        <div key={c.id} className="bg-gray-50 dark:bg-slate-800/60 p-3 rounded-xl border dark:border-slate-800/80 text-xs flex justify-between items-start">
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <span className={`font-bold ${c.is_anonymous ? 'text-gray-500 dark:text-slate-400' : 'text-blue-600 dark:text-blue-400'}`}>
                                {c.is_anonymous ? '🕵️ 匿名學生' : `👤 ${c.author_name || '學生'}`}
                              </span>
                              <span className="text-[10px] text-gray-400 dark:text-slate-500">
                                {new Date(c.created_at).toLocaleString()}
                              </span>
                            </div>
                            <p className="text-gray-800 dark:text-slate-200 whitespace-pre-line text-xs">{c.content}</p>
                          </div>

                          {(isAdmin || (currentUserEmail && c.author_email === currentUserEmail)) && (
                            <button
                              onClick={() => handleDeleteComment(c.id)}
                              className="text-red-500 hover:text-red-700 text-[11px] font-bold shrink-0 ml-2"
                              title="刪除留言"
                            >
                              ✕
                            </button>
                          )}
                        </div>
                      ))
                    )}
                  </div>

                  {/* 新增留言框 */}
                  {user ? (
                    <div className="space-y-2">
                      <textarea
                        rows={2}
                        placeholder="寫下您的看法與建議..."
                        value={commentInputs[p.id] || ''}
                        onChange={(e) => setCommentInputs({ ...commentInputs, [p.id]: e.target.value })}
                        className="w-full border dark:border-slate-700 bg-gray-50 dark:bg-slate-800 rounded-xl p-2.5 text-xs outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                      />

                      <div className="flex justify-between items-center">
                        <label className="flex items-center gap-2 text-xs font-bold text-gray-600 dark:text-slate-400 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={anonDrafts[p.id] || false}
                            onChange={(e) => setAnonDrafts({ ...anonDrafts, [p.id]: e.target.checked })}
                            className="rounded text-blue-600 focus:ring-blue-500"
                          />
                          🕵️ 匿名留言（隱藏姓名）
                        </label>

                        <button
                          onClick={() => handleAddComment(p.id)}
                          disabled={submittingCommentId === p.id}
                          className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs px-4 py-1.5 rounded-lg transition"
                        >
                          {submittingCommentId === p.id ? '送出中...' : '送出留言'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-gray-400 dark:text-slate-500 bg-gray-100 dark:bg-slate-800/40 p-2.5 rounded-xl text-center font-bold">
                      🔒 請登入後即可參與留言討論
                    </p>
                  )}
                </div>

              </div>
            )
          })}
        </div>
      </main>
    </div>
  )
}
