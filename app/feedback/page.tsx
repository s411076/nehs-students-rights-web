'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'

export default function FeedbackPage() {
  const supabase = createClient()
  const [user, setUser] = useState<any>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [feedbacks, setFeedbacks] = useState<any[]>([])
  
  const [category, setCategory] = useState('環境與設備')
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [isAnonymous, setIsAnonymous] = useState(false)
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

  const loadFeedbacks = async () => {
    const { data } = await supabase.from('feedback').select('*').order('created_at', { ascending: false })
    if (data) setFeedbacks(data)
  }

  useEffect(() => {
    checkUserAndRole()
    loadFeedbacks()
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user) return alert('請先登入！')
    setSubmitting(true)

    // 若勾選匿名，留言者名稱顯示為「匿名學生」
    const authorName = isAnonymous
      ? '匿名學生'
      : (user.user_metadata?.full_name || user.user_metadata?.name || user.email.split('@')[0] || '學生')

    const { error } = await supabase.from('feedback').insert([
      { 
        category, 
        title, 
        content, 
        user_id: user.id,
        author_email: user.email, 
        author_name: authorName,
        is_anonymous: isAnonymous
      }
    ])

    if (error) {
      alert('發布失敗：' + error.message)
    } else {
      alert('建言發布成功！感謝您的寶貴意見！')
      setTitle('')
      setContent('')
      setIsAnonymous(false)
      loadFeedbacks()
    }
    setSubmitting(false)
  }

  const handleDelete = async (id: string) => {
    if (!window.confirm('確定要刪除這則建言嗎？')) return
    const { error } = await supabase.from('feedback').delete().eq('id', id)
    if (error) alert('刪除失敗：' + error.message)
    else {
      alert('已成功刪除！')
      loadFeedbacks()
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-950 text-gray-900 dark:text-slate-100 transition-colors">
      <main className="max-w-4xl mx-auto p-6">
        <h1 className="text-2xl font-extrabold mb-6">💬 回饋與建言</h1>

        {user && (
          <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border dark:border-slate-800 shadow-sm mb-8">
            <h2 className="text-lg font-bold mb-4">✍️ 發表建議</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="flex gap-4">
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="border dark:border-slate-700 bg-gray-50 dark:bg-slate-800 rounded-lg p-2.5 text-sm outline-none font-bold"
                >
                  <option value="環境與設備">🌱 環境與設備</option>
                  <option value="課程與教學">📚 課程與教學</option>
                  <option value="學聯與活動">🎉 學聯與活動</option>
                  <option value="其他">💡 其他</option>
                </select>

                <input
                  type="text"
                  required
                  placeholder="簡短標題..."
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="flex-1 border dark:border-slate-700 bg-gray-50 dark:bg-slate-800 rounded-lg p-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <textarea
                required
                rows={4}
                placeholder="請詳細說明您的建言或想法..."
                value={content}
                onChange={(e) => setContent(e.target.value)}
                className="w-full border dark:border-slate-700 bg-gray-50 dark:bg-slate-800 rounded-lg p-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500"
              />

              <div className="flex justify-between items-center pt-1">
                <label className="flex items-center gap-2 text-xs font-bold text-gray-600 dark:text-slate-400 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={isAnonymous}
                    onChange={(e) => setIsAnonymous(e.target.checked)}
                    className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
                  />
                  🕵️ 匿名發布（隱藏姓名）
                </label>

                <button
                  type="submit"
                  disabled={submitting}
                  className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm px-6 py-2.5 rounded-lg transition cursor-pointer"
                >
                  {submitting ? '提交建言' : '提交建言'}
                </button>
              </div>
            </form>
          </div>
        )}

        <div className="space-y-6">
          {feedbacks.map((f) => (
            <div key={f.id} className="bg-white dark:bg-slate-900 p-6 rounded-2xl border dark:border-slate-800 shadow-sm relative">
              <div className="flex justify-between items-start mb-2 pr-12">
                <div className="flex items-center gap-2">
                  <span className="bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300 text-xs px-2.5 py-1 rounded-md font-bold">
                    {f.category || '其他'}
                  </span>
                  <h3 className="text-lg font-bold">{f.title}</h3>
                </div>

                {isAdmin && (
                  <button
                    onClick={() => handleDelete(f.id)}
                    className="absolute top-6 right-6 bg-red-50 dark:bg-red-950/50 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800 text-xs px-2.5 py-1 rounded-lg font-bold hover:bg-red-100 transition cursor-pointer"
                  >
                    🗑️ 刪除
                  </button>
                )}
              </div>

              <p className="text-xs text-gray-500 dark:text-slate-400 mb-3">
                留言者：{f.author_name || '匿名學生'} • 發布時間：{new Date(f.created_at).toLocaleString()}
              </p>

              <p className="text-gray-700 dark:text-slate-300 text-sm whitespace-pre-line">{f.content}</p>
            </div>
          ))}
        </div>
      </main>
    </div>
  )
}
