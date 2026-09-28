'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'

export default function ProposalsPage() {
  const supabase = createClient()

  const [user, setUser] = useState<any>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [loading, setLoading] = useState(true)

  const [proposals, setProposals] = useState<any[]>([])
  const [comments, setComments] = useState<{ [key: string]: any[] }>({})
  const [newComment, setNewComment] = useState<{ [key: string]: string }>({})
  const [userEndorsementIds, setUserEndorsementIds] = useState<string[]>([])

  // 管理者回覆與狀態暫存 State
  const [adminResponses, setAdminResponses] = useState<{ [key: string]: string }>({})
  const [adminStatuses, setAdminStatuses] = useState<{ [key: string]: string }>({})

  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const checkUser = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    
    if (user && user.email) {
      setUser(user)
      loadUserEndorsements(user.id)

      // 轉小寫與去除空字元進行精準比對
      const userEmail = user.email.trim().toLowerCase()

      // 查詢 admins 資料表比對管理員清單
      const { data: adminList, error } = await supabase
        .from('admins')
        .select('email')

      if (adminList && !error) {
        const isAdminUser = adminList.some(
          (a) => a.email.trim().toLowerCase() === userEmail
        )
        setIsAdmin(isAdminUser)
      }
    } else {
      setUser(null)
      setIsAdmin(false)
    }
    setLoading(false)
  }

  const loadUserEndorsements = async (userId: string) => {
    const { data } = await supabase
      .from('endorsements')
      .select('target_id')
      .eq('user_id', userId)

    if (data) {
      setUserEndorsementIds(data.map((item) => item.target_id))
    }
  }

  const loadProposals = async () => {
    const { data: propData } = await supabase
      .from('proposals')
      .select('*')
      .order('created_at', { ascending: false })

    if (propData) {
      setProposals(propData)
      const resMap: { [key: string]: string } = {}
      const statusMap: { [key: string]: string } = {}
      propData.forEach((p) => {
        resMap[p.id] = p.admin_response || ''
        statusMap[p.id] = p.status || '研議中'
      })
      setAdminResponses(resMap)
      setAdminStatuses(statusMap)
    }

    const { data: commData } = await supabase
      .from('proposal_comments')
      .select('*')
      .order('created_at', { ascending: true })

    if (commData) {
      const grouped: { [key: string]: any[] } = {}
      commData.forEach((c) => {
        if (!grouped[c.proposal_id]) grouped[c.proposal_id] = []
        grouped[c.proposal_id].push(c)
      })
      setComments(grouped)
    }
  }

  useEffect(() => {
    checkUser()
    loadProposals()
  }, [])

  const handleStudentLogin = async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.href,
        queryParams: { hd: 'nehs.hc.edu.tw' }
      }
    })
  }

  // 管理者：更新回覆與狀態
  const handleSaveAdminResponse = async (proposalId: string) => {
    if (!isAdmin) return alert('非管理員權限無法執行！')
    const responseText = adminResponses[proposalId] || ''
    const currentStatus = adminStatuses[proposalId] || '研議中'

    const { error } = await supabase
      .from('proposals')
      .update({
        admin_response: responseText,
        status: currentStatus
      })
      .eq('id', proposalId)

    if (error) alert('儲存失敗：' + error.message)
    else {
      alert('已成功儲存狀態與研議回覆！')
      loadProposals()
    }
  }

  // 管理者：刪除提案
  const handleDeleteProposal = async (proposalId: string) => {
    if (!isAdmin) return alert('權限不足！')
    if (!window.confirm('【管理員操作】確定要刪除此提案及其所有留言嗎？此動作無法復原！')) return

    const { error } = await supabase.from('proposals').delete().eq('id', proposalId)
    if (error) alert('刪除失敗：' + error.message)
    else {
      alert('提案已成功刪除！')
      loadProposals()
    }
  }

  // 管理者：刪除留言
  const handleDeleteComment = async (commentId: string) => {
    if (!isAdmin) return alert('權限不足！')
    if (!window.confirm('確定要刪除此留言嗎？')) return

    const { error } = await supabase.from('proposal_comments').delete().eq('id', commentId)
    if (error) alert('刪除失敗：' + error.message)
    else {
      alert('留言已刪除！')
      loadProposals()
    }
  }

  const handleCreateProposal = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user) return alert('請先使用學校帳號登入！')

    setSubmitting(true)
    const { data: newProp, error } = await supabase
      .from('proposals')
      .insert([{ title, content, author_email: user.email, user_id: user.id, status: '研議中', endorsement_count: 1 }])
      .select().single()

    if (error) {
      alert('發起提案失敗：' + error.message)
    } else {
      if (newProp) {
        await supabase.from('endorsements').insert([{ target_id: newProp.id, user_id: user.id, target_type: 'proposal' }])
      }
      alert('提案已成功發起！')
      setTitle('')
      setContent('')
      loadProposals()
      if (user) loadUserEndorsements(user.id)
    }
    setSubmitting(false)
  }

  const handleToggleEndorse = async (proposalId: string, currentCount: number, isEndorsed: boolean) => {
    if (!user) return alert('請先登入學校帳號！')

    if (isEndorsed) {
      if (!window.confirm('確定要取消對此提案的覆議連署嗎？')) return
      const { error: deleteError } = await supabase.from('endorsements').delete().eq('target_id', proposalId).eq('user_id', user.id)
      if (deleteError) return alert('取消連署失敗：' + deleteError.message)

      const newCount = Math.max(0, (currentCount || 0) - 1)
      await supabase.from('proposals').update({ endorsement_count: newCount }).eq('id', proposalId)
      alert('已取消覆議連署。')
      setUserEndorsementIds((prev) => prev.filter((id) => id !== proposalId))
      loadProposals()
    } else {
      const { error: insertError } = await supabase.from('endorsements').insert([{ target_id: proposalId, user_id: user.id, target_type: 'proposal' }])
      if (insertError) {
        alert('連署失敗或您已連署過！')
        setUserEndorsementIds((prev) => [...prev, proposalId])
        return
      }
      const newCount = (currentCount || 0) + 1
      await supabase.from('proposals').update({ endorsement_count: newCount }).eq('id', proposalId)
      alert('感謝參與覆議！連署數 +1')
      setUserEndorsementIds((prev) => [...prev, proposalId])
      loadProposals()
    }
  }

  const handleAddComment = async (proposalId: string) => {
    if (!user) return alert('請先登入學校帳號以參與討論留言！')
    const text = newComment[proposalId]
    if (!text?.trim()) return

    const { error } = await supabase.from('proposal_comments').insert([{ proposal_id: proposalId, content: text, user_email: user.email, user_id: user.id }])
    if (error) alert('留言失敗：' + error.message)
    else {
      setNewComment({ ...newComment, [proposalId]: '' })
      loadProposals()
    }
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="mb-8 border-b pb-4 flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">💡 學生提案區</h1>
          <p className="text-sm text-gray-600 mt-1">發起校園制度改善提案，集結同學覆議連署。</p>
        </div>
        {isAdmin ? (
          <span className="bg-purple-100 text-purple-700 font-bold text-xs px-3 py-1 rounded-full border border-purple-300">
            🔑 幹部/管理員權限已啟用
          </span>
        ) : user ? (
          <span className="bg-gray-100 text-gray-600 text-xs px-3 py-1 rounded border">
            一般學生身份：{user.email}
          </span>
        ) : null}
      </div>

      {/* 發起提案區 */}
      <div className="bg-white p-6 rounded-xl border shadow-sm mb-10">
        <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
          ➕ 發起新提案
          {user && <span className="text-xs font-normal text-green-600 bg-green-50 px-2 py-0.5 rounded border border-green-200">已驗證：{user.email}</span>}
        </h2>

        {loading ? (
          <div className="text-sm text-gray-400 py-4">檢查登入狀態中...</div>
        ) : !user ? (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 text-center">
            <h3 className="font-bold text-blue-900 mb-1">提案與參與討論需登入</h3>
            <button onClick={handleStudentLogin} className="bg-blue-600 text-white font-bold text-sm px-5 py-2.5 rounded-lg hover:bg-blue-700 mt-2">
              使用學校 Google 帳號登入
            </button>
          </div>
        ) : (
          <form onSubmit={handleCreateProposal} className="space-y-4">
            <input type="text" required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="提案名稱" className="w-full border rounded-lg p-2.5 text-sm outline-none" />
            <textarea required rows={4} value={content} onChange={(e) => setContent(e.target.value)} placeholder="提案完整內容與理由..." className="w-full border rounded-lg p-2.5 text-sm outline-none" />
            <button type="submit" disabled={submitting} className="bg-blue-600 text-white font-bold text-sm px-6 py-2.5 rounded-lg disabled:bg-gray-400">
              {submitting ? '提交中...' : '發起提案'}
            </button>
          </form>
        )}
      </div>

      {/* 提案列表 */}
      <h2 className="text-xl font-bold mb-4">📢 進行中的學生提案</h2>
      <div className="space-y-6">
        {proposals.map((item) => {
          const isEndorsed = userEndorsementIds.includes(item.id)
          return (
            <div key={item.id} className="bg-white p-6 rounded-xl border shadow-sm relative">
              <div className="flex justify-between items-center mb-2">
                <span className="text-xs text-gray-500">覆議人數：{item.endorsement_count || 0} 人</span>
                
                {/* 管理員更動狀態選單 */}
                {isAdmin ? (
                  <select
                    value={adminStatuses[item.id] || '研議中'}
                    onChange={(e) => setAdminStatuses({ ...adminStatuses, [item.id]: e.target.value })}
                    className="text-xs font-bold px-2 py-1 rounded border border-purple-300 bg-purple-50 text-purple-800 outline-none"
                  >
                    <option value="研議中">研議中</option>
                    <option value="辦理中">辦理中</option>
                    <option value="已採納">已採納</option>
                    <option value="不採納">不採納</option>
                  </select>
                ) : (
                  <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-blue-100 text-blue-700">
                    {item.status || '研議中'}
                  </span>
                )}
              </div>

              <h3 className="font-bold text-xl text-gray-800 mb-2">{item.title}</h3>
              <p className="text-gray-700 text-sm mb-4 leading-relaxed">{item.content}</p>

              <button
                onClick={() => handleToggleEndorse(item.id, item.endorsement_count, isEndorsed)}
                className={`font-bold text-xs px-4 py-2 rounded-lg transition flex items-center gap-1.5 mb-4 border ${
                  isEndorsed ? 'bg-green-50 border-green-300 text-green-700 hover:bg-red-50 hover:border-red-300 hover:text-red-600' : 'bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100'
                }`}
              >
                {isEndorsed ? '✅ 已覆議 (點擊可取消)' : '✍️ 參與覆議連署 (+1)'}
              </button>

              {/* 🎓 學權組回覆區塊 */}
              {isAdmin ? (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm mb-4">
                  <div className="font-bold text-blue-900 mb-2 flex justify-between items-center">
                    <span>🎓 學權組回覆提案：</span>
                    <button
                      onClick={() => handleDeleteProposal(item.id)}
                      className="text-xs bg-red-100 text-red-600 border border-red-300 px-2 py-1 rounded hover:bg-red-200 font-bold"
                    >
                      🗑️ 刪除此提案
                    </button>
                  </div>
                  <textarea
                    rows={3}
                    value={adminResponses[item.id] || ''}
                    onChange={(e) => setAdminResponses({ ...adminResponses, [item.id]: e.target.value })}
                    placeholder="輸入回覆說明..."
                    className="w-full border rounded-lg p-2.5 text-xs outline-none bg-white mb-2"
                  />
                  <button
                    onClick={() => handleSaveAdminResponse(item.id)}
                    className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs px-4 py-2 rounded-lg transition"
                  >
                    儲存回覆與狀態
                  </button>
                </div>
              ) : item.admin_response ? (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm mb-4">
                  <div className="font-bold text-blue-900 mb-1">🎓 學權組研議回覆：</div>
                  <p className="text-blue-800 leading-relaxed">{item.admin_response}</p>
                </div>
              ) : null}

              {/* 討論區 */}
              <div className="border-t pt-4 mt-4">
                <h4 className="text-xs font-bold text-gray-500 mb-3">💬 同學討論區：</h4>
                <div className="space-y-2 mb-3">
                  {(comments[item.id] || []).map((c) => (
                    <div key={c.id} className="bg-gray-50 p-2.5 rounded-lg text-xs text-gray-700 border flex justify-between items-center">
                      <span>{c.content}</span>
                      {isAdmin && (
                        <button onClick={() => handleDeleteComment(c.id)} className="text-red-500 hover:text-red-700 font-bold ml-2">
                          [刪除]
                        </button>
                      )}
                    </div>
                  ))}
                </div>

                {user && (
                  <div className="flex gap-2">
                    <input type="text" value={newComment[item.id] || ''} onChange={(e) => setNewComment({ ...newComment, [item.id]: e.target.value })} placeholder="表達你的看法..." className="flex-1 border rounded-lg p-2 text-xs outline-none" />
                    <button onClick={() => handleAddComment(item.id)} className="bg-gray-800 text-white font-bold text-xs px-4 py-2 rounded-lg">留言</button>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}