'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'

export default function ProposalsPage() {
  const supabase = createClient()

  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  const [proposals, setProposals] = useState<any[]>([])
  const [comments, setComments] = useState<{ [key: string]: any[] }>({})
  const [newComment, setNewComment] = useState<{ [key: string]: string }>({})
  const [userEndorsementIds, setUserEndorsementIds] = useState<string[]>([]) // 記錄當前使用者已連署的提案 ID

  // 新提案 State
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // 檢查登入狀態
  const checkUser = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (user && user.email?.endsWith('@nehs.hc.edu.tw')) {
      setUser(user)
      loadUserEndorsements(user.id)
    } else {
      setUser(null)
    }
    setLoading(false)
  }

  // 載入當前使用者已覆議過的提案清單
  const loadUserEndorsements = async (userId: string) => {
    const { data } = await supabase
      .from('endorsements')
      .select('target_id')
      .eq('user_id', userId)

    if (data) {
      setUserEndorsementIds(data.map((item) => item.target_id))
    }
  }

  // 載入提案與留言
  const loadProposals = async () => {
    const { data: propData } = await supabase.from('proposals').select('*').order('created_at', { ascending: false })
    if (propData) setProposals(propData)

    const { data: commData } = await supabase.from('proposal_comments').select('*').order('created_at', { ascending: true })
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

  // Google 登入
  const handleStudentLogin = async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.href,
        queryParams: { hd: 'nehs.hc.edu.tw' }
      }
    })
  }

  // 1. 發起新提案（發起人自動算第 1 筆連署）
  const handleCreateProposal = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user) return alert('請先使用學校帳號登入！')

    setSubmitting(true)
    const { data: newProp, error } = await supabase
      .from('proposals')
      .insert([
        {
          title,
          content,
          author_email: user.email,
          user_id: user.id,
          status: '研議中',
          endorsement_count: 1, // 發起者算 1 票
        },
      ])
      .select()
      .single()

    if (error) {
      alert('發起提案失敗：' + error.message)
    } else {
      // 寫入發起人的 endorsements 紀錄
      if (newProp) {
        await supabase.from('endorsements').insert([
          { target_id: newProp.id, user_id: user.id, target_type: 'proposal' }
        ])
      }
      alert('提案已成功發起！')
      setTitle('')
      setContent('')
      loadProposals()
      if (user) loadUserEndorsements(user.id)
    }
    setSubmitting(false)
  }

  // 2. 參與連署（覆議）- 包含防重複機制
  const handleEndorse = async (proposalId: string, currentCount: number) => {
    if (!user) return alert('請先登入學校帳號以參與覆議連署！')

    // 先嘗試寫入連署表 endorsements
    const { error: insertError } = await supabase
      .from('endorsements')
      .insert([
        { target_id: proposalId, user_id: user.id, target_type: 'proposal' }
      ])

    // 如果已被 Unique Constraint 擋下，提示使用者並中斷
    if (insertError) {
      alert('您已經參與過此提案的覆議，無法重複連署！')
      setUserEndorsementIds((prev) => [...prev, proposalId])
      return
    }

    // 寫入成功後，更新 proposals 裡面的計數
    const newCount = (currentCount || 0) + 1
    const { error: updateError } = await supabase
      .from('proposals')
      .update({ endorsement_count: newCount })
      .eq('id', proposalId)

    if (updateError) {
      alert('更新連署數失敗：' + updateError.message)
    } else {
      alert('感謝參與覆議！連署數 +1')
      setUserEndorsementIds((prev) => [...prev, proposalId])
      loadProposals()
    }
  }

  // 3. 新增討論區留言
  const handleAddComment = async (proposalId: string) => {
    if (!user) return alert('請先登入學校帳號以參與討論留言！')
    const text = newComment[proposalId]
    if (!text?.trim()) return

    const { error } = await supabase.from('proposal_comments').insert([
      {
        proposal_id: proposalId,
        content: text,
        user_email: user.email,
        user_id: user.id,
      },
    ])

    if (error) alert('留言失敗：' + error.message)
    else {
      setNewComment({ ...newComment, [proposalId]: '' })
      loadProposals()
    }
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="mb-8 border-b pb-4">
        <h1 className="text-2xl font-bold text-gray-800">💡 學生提案區</h1>
        <p className="text-sm text-gray-600 mt-1">
          發起校園制度或法規改善提案，集結同學覆議連署，達到門檻後由學權組代表同學向學校開會研議。
        </p>
      </div>

      {/* 發起提案區 */}
      <div className="bg-white p-6 rounded-xl border shadow-sm mb-10">
        <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
          ➕ 發起新提案
          {user && <span className="text-xs font-normal text-green-600 bg-green-50 px-2 py-0.5 rounded border border-green-200">已驗證學校帳號：{user.email}</span>}
        </h2>

        {loading ? (
          <div className="text-sm text-gray-400 py-4">檢查登入狀態中...</div>
        ) : !user ? (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 text-center">
            <div className="text-3xl mb-2">🎓</div>
            <h3 className="font-bold text-blue-900 mb-1">提案與參與討論需登入</h3>
            <p className="text-xs text-blue-700 mb-4">
              為確認提案與連署有效性，請使用學校 Google 帳號 (@nehs.hc.edu.tw) 進行登入。
            </p>
            <button
              onClick={handleStudentLogin}
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm px-5 py-2.5 rounded-lg transition inline-flex items-center gap-2 shadow"
            >
              使用學校 Google 帳號登入
            </button>
          </div>
        ) : (
          <form onSubmit={handleCreateProposal} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">提案名稱</label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="例如：提議放寬校慶園遊會外校人士入場規定"
                className="w-full border rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">提案完整內容與理由</label>
              <textarea
                required
                rows={4}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="請詳細敘述現行制度的問題、您的具體提案方案與預期效益..."
                className="w-full border rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm px-6 py-2.5 rounded-lg transition disabled:bg-gray-400"
            >
              {submitting ? '提交中...' : '發起提案'}
            </button>
          </form>
        )}
      </div>

      {/* 提案列表（開放所有人瀏覽） */}
      <h2 className="text-xl font-bold mb-4">📢 進行中的學生提案</h2>
      <div className="space-y-6">
        {proposals.map((item) => {
          const isEndorsed = userEndorsementIds.includes(item.id)

          return (
            <div key={item.id} className="bg-white p-6 rounded-xl border shadow-sm">
              <div className="flex justify-between items-center mb-2">
                <span className="text-xs text-gray-500">覆議連署：{item.endorsement_count || 0} 人</span>
                <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-blue-100 text-blue-700">
                  {item.status || '研議中'}
                </span>
              </div>

              <h3 className="font-bold text-xl text-gray-800 mb-2">{item.title}</h3>
              <p className="text-gray-700 text-sm mb-4 leading-relaxed">{item.content}</p>

              {/* 覆議按鈕（防重複 + Disabled 樣式） */}
              <button
                onClick={() => handleEndorse(item.id, item.endorsement_count)}
                disabled={isEndorsed}
                className={`font-bold text-xs px-4 py-2 rounded-lg transition flex items-center gap-1.5 mb-4 border ${
                  isEndorsed
                    ? 'bg-gray-100 border-gray-300 text-gray-400 cursor-not-allowed'
                    : 'bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100'
                }`}
              >
                {isEndorsed ? '✅ 已參與覆議' : '✍️ 參與覆議連署 (+1)'}
              </button>

              {/* 🎓 學權組回覆 */}
              {item.admin_response && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm mb-4">
                  <div className="font-bold text-blue-900 mb-1">🎓 學權組研議回覆：</div>
                  <p className="text-blue-800 leading-relaxed">{item.admin_response}</p>
                </div>
              )}

              {/* 留言討論區 */}
              <div className="border-t pt-4 mt-4">
                <h4 className="text-xs font-bold text-gray-500 mb-3">💬 同學討論區：</h4>
                <div className="space-y-2 mb-3">
                  {(comments[item.id] || []).map((c) => (
                    <div key={c.id} className="bg-gray-50 p-2.5 rounded-lg text-xs text-gray-700 border">
                      {c.content}
                    </div>
                  ))}
                  {(!comments[item.id] || comments[item.id].length === 0) && (
                    <p className="text-xs text-gray-400">目前尚無討論留言。</p>
                  )}
                </div>

                {/* 留言輸入框 */}
                {user ? (
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newComment[item.id] || ''}
                      onChange={(e) => setNewComment({ ...newComment, [item.id]: e.target.value })}
                      placeholder="表達你對此提案的看法..."
                      className="flex-1 border rounded-lg p-2 text-xs outline-none focus:ring-1 focus:ring-blue-500"
                    />
                    <button
                      onClick={() => handleAddComment(item.id)}
                      className="bg-gray-800 text-white font-bold text-xs px-4 py-2 rounded-lg hover:bg-gray-700 transition"
                    >
                      留言
                    </button>
                  </div>
                ) : (
                  <p className="text-xs text-gray-400 italic">💡 請登入學校帳號以發表討論留言。</p>
                )}
              </div>
            </div>
          )
        })}
        {proposals.length === 0 && <p className="text-gray-400 text-center py-8 text-sm">目前尚無學生提案。</p>}
      </div>
    </div>
  )
}