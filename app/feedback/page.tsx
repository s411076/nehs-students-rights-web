'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'

export default function FeedbackPage() {
  const supabase = createClient()
  const [user, setUser] = useState<any>(null)
  const [feedbacks, setFeedbacks] = useState<any[]>([])
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const checkUser = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (user) setUser(user)
  }

  const loadFeedbacks = async () => {
    const { data } = await supabase.from('feedback').select('*').order('created_at', { ascending: false })
    if (data) setFeedbacks(data)
  }

  useEffect(() => {
    checkUser()
    loadFeedbacks()
  }, [])

  // 處理網址錨點定位 (#item-id)
  useEffect(() => {
    if (feedbacks.length > 0 && typeof window !== 'undefined' && window.location.hash) {
      const targetId = window.location.hash.replace('#', '')
      const element = document.getElementById(targetId)
      if (element) {
        setTimeout(() => {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' })
          element.classList.add('ring-4', 'ring-blue-500', 'transition-all')
          setTimeout(() => element.classList.remove('ring-4', 'ring-blue-500'), 3000)
        }, 300)
      }
    }
  }, [feedbacks])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user) {
      alert('請先登入後再發表建言/留言！')
      return
    }
    setSubmitting(true)

    const authorName = user.user_metadata?.full_name || user.user_metadata?.name || user.email.split('@')[0]
    const { error } = await supabase.from('feedback').insert([
      { title, content, author_email: user.email, author_name: authorName }
    ])

    if (error) {
      alert('發布失敗：' + error.message)
    } else {
      alert('建言發表成功！')
      setTitle('')
      setContent('')
      loadFeedbacks()
    }
    setSubmitting(false)
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-950 text-gray-900 dark:text-slate-100 transition-colors">
      <main className="max-w-4xl mx-auto p-6">
        <h1 className="text-2xl font-extrabold mb-6">💬 回饋與建言</h1>

        {user && (
          <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border dark:border-slate-800 shadow-sm mb-8">
            <h2 className="text-lg font-bold mb-4">✍️ 發表學生建議與留言</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <input
                type="text"
                required
                placeholder="建議主題..."
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full border dark:border-slate-700 bg-gray-50 dark:bg-slate-800 rounded-lg p-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500"
              />
              <textarea
                required
                rows={4}
                placeholder="寫下你的看法、問題或回饋..."
                value={content}
                onChange={(e) => setContent(e.target.value)}
                className="w-full border dark:border-slate-700 bg-gray-50 dark:bg-slate-800 rounded-lg p-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                type="submit"
                disabled={submitting}
                className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm px-6 py-2.5 rounded-lg transition"
              >
                {submitting ? '提交中...' : '提交建言'}
              </button>
            </form>
          </div>
        )}

        <div className="space-y-4">
          {feedbacks.map((f) => (
            <div id={`item-${f.id}`} key={f.id} className="bg-white dark:bg-slate-900 p-6 rounded-2xl border dark:border-slate-800 shadow-sm transition-all duration-300">
              <h3 className="text-lg font-bold mb-1">{f.title || '學生建議'}</h3>
              <p className="text-xs text-gray-500 dark:text-slate-400 mb-4">
                留言者：{f.author_name || '學生'} • {new Date(f.created_at).toLocaleDateString()}
              </p>
              <p className="text-gray-700 dark:text-slate-300 text-sm whitespace-pre-line">{f.content}</p>
            </div>
          ))}
        </div>
      </main>
    </div>
  )
}
