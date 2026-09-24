'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'

export default function FeedbackPage() {
  const supabase = createClient()

  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [category, setCategory] = useState('設施與環境')
  const [feedbacks, setFeedbacks] = useState<any[]>([])
  const [submitting, setSubmitting] = useState(false)

  // 檢查學生登入狀態
  const checkUser = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (user && user.email?.endsWith('@nehs.hc.edu.tw')) {
      setUser(user)
    } else {
      setUser(null)
    }
    setLoading(false)
  }

  // 載入所有建言
  const loadFeedbacks = async () => {
    const { data, error } = await supabase
      .from('feedbacks')
      .select('*')
      .order('created_at', { ascending: false })

    if (data) setFeedbacks(data)
  }

  useEffect(() => {
    checkUser()
    loadFeedbacks()
  }, [])

  // Google 學校帳號登入
  const handleStudentLogin = async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.href,
        queryParams: { hd: 'nehs.hc.edu.tw' } // 限制預設顯示學校 Domain
      }
    })
  }

  // 提交建言
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user) {
      alert('請先使用學校帳號 (@nehs.hc.edu.tw) 登入！')
      return
    }

    setSubmitting(true)
    const { error } = await supabase.from('feedbacks').insert([
      {
        title,
        content,
        category,
        user_email: user.email,
        status: '未回應',
      },
    ])

    if (error) {
      alert('提交失敗：' + error.message)
    } else {
      alert('成功送出建言！學權組將會盡快檢視並給予回覆。')
      setTitle('')
      setContent('')
      loadFeedbacks()
    }
    setSubmitting(false)
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="mb-8 border-b pb-4">
        <h1 className="text-2xl font-bold text-gray-800">💬 回饋與建言</h1>
        <p className="text-sm text-gray-600 mt-1">
          有校園生活設施、飲食或各項權益問題嗎？歡迎在此反映，學權組將會定期彙整並答覆。
        </p>
      </div>

      {/* 提交表單區（需驗證學校帳號） */}
      <div className="bg-white p-6 rounded-xl border shadow-sm mb-10">
        <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
          📝 提交建言
          {user && <span className="text-xs font-normal text-green-600 bg-green-50 px-2 py-0.5 rounded border border-green-200">已驗證學校帳號：{user.email}</span>}
        </h2>

        {loading ? (
          <div className="text-sm text-gray-400 py-4">檢查登入狀態中...</div>
        ) : !user ? (
          /* 未登入或非學校帳號顯示提示 */
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 text-center">
            <div className="text-3xl mb-2">🔒</div>
            <h3 className="font-bold text-blue-900 mb-1">留言發表功能受保護</h3>
            <p className="text-xs text-blue-700 mb-4">
              為了維持校園交流品質，提交建言前請先使用學校全名帳號 (@nehs.hc.edu.tw) 登入驗證。
            </p>
            <button
              onClick={handleStudentLogin}
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm px-5 py-2.5 rounded-lg transition inline-flex items-center gap-2 shadow"
            >
              使用學校 Google 帳號登入
            </button>
          </div>
        ) : (
          /* 已登入學校帳號顯示輸入表單 */
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">類別</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full border rounded-lg p-2.5 text-sm bg-white focus:ring-2 focus:ring-blue-500 outline-none"
              >
                <option value="設施與環境">設施與環境</option>
                <option value="膳食與合作社">膳食與合作社</option>
                <option value="學權與法規">學權與法規</option>
                <option value="活動與其他">活動與其他</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">建言語題標題</label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="例如：高中部大樓三樓飲水機水壓不足"
                className="w-full border rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">詳細說明</label>
              <textarea
                required
                rows={4}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="請具體說明問題發生的時間、地點與您的建議改善方式..."
                className="w-full border rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm px-6 py-2.5 rounded-lg transition"
            >
              {submitting ? '提交中...' : '確認送出建言'}
            </button>
          </form>
        )}
      </div>

      {/* 建言列表與官方回覆（開放所有人瀏覽） */}
      <h2 className="text-xl font-bold mb-4">📋 歷史建言與學權組回應</h2>
      <div className="space-y-4">
        {feedbacks.map((item) => (
          <div key={item.id} className="bg-white p-6 rounded-xl border shadow-sm">
            <div className="flex justify-between items-center mb-2">
              <span className="text-xs font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded">
                [{item.category || '其他'}]
              </span>
              <span className={`text-xs px-2.5 py-1 rounded-full font-bold ${
                item.status === '已回應' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
              }`}>
                {item.status || '處理中'}
              </span>
            </div>
            <h3 className="font-bold text-lg text-gray-800 mb-1">{item.title}</h3>
            <p className="text-gray-600 text-sm mb-4 leading-relaxed">{item.content}</p>

            {/* 📢 學權組官方回覆 */}
            {item.admin_response && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-sm mt-4">
                <div className="font-bold text-green-900 mb-1 flex items-center gap-1">
                  📢 學權組官方回覆：
                </div>
                <p className="text-green-800 leading-relaxed">{item.admin_response}</p>
              </div>
            )}
          </div>
        ))}
        {feedbacks.length === 0 && <p className="text-gray-400 text-center py-8 text-sm">目前尚無同學提交建言。</p>}
      </div>
    </div>
  )
}