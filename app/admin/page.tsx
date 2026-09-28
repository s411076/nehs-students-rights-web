'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'

// 🎓 學權組幹部 Email 白單
const ADMIN_EMAILS = [
  's411076@nehs.hc.edu.tw',
  's411158@nehs.hc.edu.tw',
]

export default function AdminPage() {
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [currentUser, setCurrentUser] = useState<any>(null)
  const [isAdmin, setIsAdmin] = useState(false)

  // 帳密登入用 State
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  // 後台資料 State
  const [activeTab, setActiveTab] = useState<'proposals' | 'feedbacks'>('proposals')
  const [proposals, setProposals] = useState<any[]>([])
  const [comments, setComments] = useState<{ [key: string]: any[] }>({})
  const [propResponses, setPropResponses] = useState<{ [key: string]: string }>({})
  const [propStatuses, setPropStatuses] = useState<{ [key: string]: string }>({})

  const [feedbacks, setFeedbacks] = useState<any[]>([])
  const [fbResponses, setFbResponses] = useState<{ [key: string]: string }>({})
  const [fbStatuses, setFbStatuses] = useState<{ [key: string]: string }>({})

  // 檢查登入者身分與幹部權限
  const checkAdminStatus = async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()

    if (user) {
      setCurrentUser(user)
      // 檢查 Email 是否在幹部白單內
      const hasPermission = ADMIN_EMAILS.includes(user.email || '')
      setIsAdmin(hasPermission)

      if (hasPermission) {
        loadAdminData()
      }
    } else {
      setCurrentUser(null)
      setIsAdmin(false)
    }
    setLoading(false)
  }

  // 載入後台資料
  const loadAdminData = async () => {
    // 1. 撈取提案
    const { data: propData } = await supabase.from('proposals').select('*').order('created_at', { ascending: false })
    if (propData) setProposals(propData)

    // 2. 撈取提案留言
    const { data: commData } = await supabase.from('proposal_comments').select('*').order('created_at', { ascending: true })
    if (commData) {
      const grouped: { [key: string]: any[] } = {}
      commData.forEach((c) => {
        if (!grouped[c.proposal_id]) grouped[c.proposal_id] = []
        grouped[c.proposal_id].push(c)
      })
      setComments(grouped)
    }

    // 3. 撈取建言 (feedbacks)
    const { data: fbData } = await supabase.from('feedbacks').select('*').order('created_at', { ascending: false })
    if (fbData) setFeedbacks(fbData)
  }

  useEffect(() => {
    checkAdminStatus()
  }, [])

  // 1. Google 幹部登入
  const handleGoogleLogin = async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.href }
    })
  }

  // 2. Email / 密碼 幹部登入
  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      alert('登入失敗：' + error.message)
    } else {
      alert('幹部登入成功！')
      checkAdminStatus()
    }
  }

  // 幹部登出
  const handleLogout = async () => {
    await supabase.auth.signOut()
    setCurrentUser(null)
    setIsAdmin(false)
  }

  // 儲存提案回覆與狀態
  const handleUpdateProposal = async (id: string) => {
    const text = propResponses[id]
    const status = propStatuses[id] || proposals.find((p) => p.id === id)?.status || '研議中'

    const { error } = await supabase.from('proposals').update({
      admin_response: text,
      status: status,
      responded_at: new Date().toISOString(),
    }).eq('id', id)

    if (error) alert('更新失敗：' + error.message)
    else { alert('成功更新提案！'); loadAdminData() }
  }

  // 刪除提案留言
  const handleDeleteComment = async (commentId: string) => {
    if (!confirm('確定刪除這條留言嗎？')) return
    const { error } = await supabase.from('proposal_comments').delete().eq('id', commentId)
    if (error) alert('刪除失敗：' + error.message)
    else { alert('已刪除留言！'); loadAdminData() }
  }

  // 儲存建言回覆與狀態
  const handleUpdateFeedback = async (id: string) => {
    const text = fbResponses[id]
    const status = fbStatuses[id] || (text ? '已回應' : '未回應')

    const { error } = await supabase.from('feedbacks').update({
      admin_response: text,
      status: status,
      responded_at: new Date().toISOString(),
    }).eq('id', id)

    if (error) alert('更新建言失敗：' + error.message)
    else { alert('成功更新建言回覆！'); loadAdminData() }
  }

  // 刪除惡意建言
  const handleDeleteFeedback = async (id: string) => {
    if (!confirm('確定刪除這則建言嗎？')) return
    const { error } = await supabase.from('feedbacks').delete().eq('id', id)
    if (error) alert('刪除失敗：' + error.message)
    else { alert('已刪除建言！'); loadAdminData() }
  }

  if (loading) {
    return <div className="p-12 text-center text-gray-500">權限驗證中，請稍候...</div>
  }

  // 🔒 未登入或非幹部時顯示：幹部專屬登入畫面
  if (!isAdmin) {
    return (
      <div className="max-w-md mx-auto my-12 p-8 bg-white rounded-xl border shadow-md">
        <div className="text-center mb-6">
          <div className="text-4xl mb-2">🎓</div>
          <h1 className="text-2xl font-bold text-gray-800">學權組幹部專屬登入</h1>
          <p className="text-xs text-gray-500 mt-1">此區域僅限指定幹部帳號存取與管理</p>
        </div>

        {/* Google 快捷登入 */}
        <button
          onClick={handleGoogleLogin}
          className="w-full bg-white border border-gray-300 text-gray-700 font-bold py-2.5 px-4 rounded-lg hover:bg-gray-50 transition flex items-center justify-center gap-2 mb-6 text-sm shadow-sm"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
          </svg>
          使用學校 Google 幹部帳號登入
        </button>

        <div className="relative my-6 text-center">
          <hr className="border-gray-200" />
          <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white px-3 text-xs text-gray-400">
            或使用幹部帳號密碼
          </span>
        </div>

        {/* 帳密登入表單 */}
        <form onSubmit={handleEmailLogin} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">幹部 Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full border rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              placeholder="s411076@nehs.hc.edu.tw"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">密碼</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              placeholder="••••••••"
            />
          </div>
          <button
            type="submit"
            className="w-full bg-blue-600 text-white font-bold py-2.5 rounded-lg hover:bg-blue-700 transition text-sm shadow"
          >
            登入管理後台
          </button>
        </form>

        {currentUser && !isAdmin && (
          <p className="text-xs text-red-500 text-center mt-4 bg-red-50 p-2 rounded border border-red-200">
            ⚠️ 目前帳號 ({currentUser.email}) 未在幹部授權名單中。
          </p>
        )}
      </div>
    )
  }

  // 🔓 驗證為授權幹部後顯示：後台管理系統
  return (
    <div className="max-w-5xl mx-auto p-6">
      <div className="flex justify-between items-center mb-6 pb-4 border-b">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">⚙️ 學權組後台管理系統</h1>
          <p className="text-xs text-gray-500 mt-1">目前登入幹部：{currentUser?.email}</p>
        </div>
        <button
          onClick={handleLogout}
          className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold px-3 py-1.5 rounded transition"
        >
          登出後台
        </button>
      </div>

      {/* 頁籤切換 */}
      <div className="flex border-b mb-6 gap-4">
        <button
          onClick={() => setActiveTab('proposals')}
          className={`pb-3 px-4 text-sm font-bold border-b-2 transition ${
            activeTab === 'proposals' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500'
          }`}
        >
          💡 學生提案管理 ({proposals.length})
        </button>
        <button
          onClick={() => setActiveTab('feedbacks')}
          className={`pb-3 px-4 text-sm font-bold border-b-2 transition ${
            activeTab === 'feedbacks' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500'
          }`}
        >
          💬 回饋與建言管理 ({feedbacks.length})
        </button>
      </div>

      {/* 提案管理分頁 */}
      {activeTab === 'proposals' && (
        <div className="space-y-6">
          {proposals.map((item) => (
            <div key={item.id} className="bg-white p-6 rounded-lg border shadow-sm">
              <div className="flex justify-between items-center mb-2">
                <span className="text-xs text-gray-500">覆議人數：{item.endorsement_count || 0} 人</span>
                <select
                  value={propStatuses[item.id] ?? item.status ?? '研議中'}
                  onChange={(e) => setPropStatuses({ ...propStatuses, [item.id]: e.target.value })}
                  className="border rounded px-2 py-1 text-xs font-bold"
                >
                  <option value="研議中">研議中</option>
                  <option value="已成案">已成案</option>
                  <option value="已採納">已採納</option>
                  <option value="不採納">不採納</option>
                </select>
              </div>
              <h3 className="font-bold text-lg mb-1">{item.title}</h3>
              <p className="text-gray-700 text-sm mb-4">{item.content}</p>

              <div className="bg-blue-50 p-4 rounded-lg border border-blue-200 mb-4">
                <label className="block text-xs font-bold text-blue-900 mb-1">🎓 學權組回覆提案：</label>
                <textarea
                  value={propResponses[item.id] ?? item.admin_response ?? ''}
                  onChange={(e) => setPropResponses({ ...propResponses, [item.id]: e.target.value })}
                  className="w-full border rounded p-2 text-sm bg-white h-20 mb-2"
                  placeholder="輸入回覆說明..."
                />
                <button onClick={() => handleUpdateProposal(item.id)} className="bg-blue-600 text-white text-xs px-4 py-2 rounded font-bold hover:bg-blue-700 transition">
                  儲存回覆與狀態
                </button>
              </div>

              {/* 留言管理 */}
              <div className="border-t pt-2">
                <h4 className="text-xs font-bold text-gray-500 mb-2">留言列表：</h4>
                {(comments[item.id] || []).map((c) => (
                  <div key={c.id} className="flex justify-between bg-gray-50 p-2 rounded text-xs mb-1 border">
                    <span>{c.content}</span>
                    <button onClick={() => handleDeleteComment(c.id)} className="text-red-600 font-bold ml-2">[刪除]</button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 建言管理分頁 */}
      {activeTab === 'feedbacks' && (
        <div className="space-y-6">
          {feedbacks.map((item) => (
            <div key={item.id} className="bg-white p-6 rounded-lg border shadow-sm">
              <div className="flex justify-between items-center mb-2">
                <span className="text-xs font-bold text-blue-600">[{item.category || '其他'}]</span>
                <div className="flex items-center gap-2">
                  <select
                    value={fbStatuses[item.id] ?? item.status ?? '未回應'}
                    onChange={(e) => setFbStatuses({ ...fbStatuses, [item.id]: e.target.value })}
                    className="border rounded px-2 py-1 text-xs font-bold"
                  >
                    <option value="未回應">未回應</option>
                    <option value="處理中">處理中</option>
                    <option value="已回應">已回應</option>
                  </select>
                  <button onClick={() => handleDeleteFeedback(item.id)} className="text-red-600 text-xs font-bold hover:underline">
                    [刪除建言]
                  </button>
                </div>
              </div>
              <h3 className="font-bold text-lg mb-1">{item.title}</h3>
              <p className="text-gray-700 text-sm mb-4">{item.content}</p>

              {/* 建言官方回覆區 */}
              <div className="bg-green-50 p-4 rounded-lg border border-green-200">
                <label className="block text-xs font-bold text-green-900 mb-1">📢 學權組回覆建言：</label>
                <textarea
                  value={fbResponses[item.id] ?? item.admin_response ?? ''}
                  onChange={(e) => setFbResponses({ ...fbResponses, [item.id]: e.target.value })}
                  className="w-full border rounded p-2 text-sm bg-white h-20 mb-2"
                  placeholder="請撰寫給同學的答覆或處置情形..."
                />
                <button
                  onClick={() => handleUpdateFeedback(item.id)}
                  className="bg-green-600 text-white text-xs px-4 py-2 rounded font-bold hover:bg-green-700 transition"
                >
                  儲存建言回覆
                </button>
              </div>
            </div>
          ))}
          {feedbacks.length === 0 && <p className="text-gray-400 text-center py-8">目前尚無同學提交建言。</p>}
        </div>
      )}
    </div>
  )
}
