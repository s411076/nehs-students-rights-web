'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'

export default function HomePage() {
  const supabase = createClient()
  const [isAdmin, setIsAdmin] = useState(false)
  const [sections, setSections] = useState<any[]>([])

  // 新增欄位 State
  const [newTitle, setNewTitle] = useState('')
  const [newContent, setNewContent] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // 檢查管理員身分
  const checkAdmin = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { data } = await supabase.from('admins').select('*').eq('email', user.email).single()
      if (data) setIsAdmin(true)
    }
  }

  // 載入首頁動態欄位內容
  const loadSections = async () => {
    const { data } = await supabase.from('home_sections').select('*').order('created_at', { ascending: false })
    if (data) setSections(data)
  }

  useEffect(() => {
    checkAdmin()
    loadSections()
  }, [])

  // 管理者：新增首頁欄位
  const handleAddSection = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newTitle.trim() || !newContent.trim()) return

    setSubmitting(true)
    const { error } = await supabase.from('home_sections').insert([{ title: newTitle, content: newContent }])

    if (error) {
      alert('新增失敗：' + error.message)
    } else {
      alert('首頁欄位發布成功！')
      setNewTitle('')
      setNewContent('')
      loadSections()
    }
    setSubmitting(false)
  }

  // 管理者：刪除首頁欄位
  const handleDeleteSection = async (id: string) => {
    if (!window.confirm('確定要刪除此首頁欄位嗎？')) return
    const { error } = await supabase.from('home_sections').delete().eq('id', id)
    if (error) alert('刪除失敗：' + error.message)
    else {
      alert('欄位已刪除！')
      loadSections()
    }
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="text-center my-8">
        <h1 className="text-3xl font-extrabold text-gray-900 mb-2">🎓 國立實驗高級中學 學生權益網</h1>
        <p className="text-gray-600">維護學生權益・促進校園溝通・即時反映意見</p>
      </div>

      {/* 管理員專區：發布首頁內容 */}
      {isAdmin && (
        <div className="bg-purple-50 border border-purple-200 p-6 rounded-xl mb-8 shadow-sm">
          <h2 className="text-lg font-bold text-purple-900 mb-3 flex items-center gap-2">
            🔑 管理員控制台：新增首頁內容欄位
          </h2>
          <form onSubmit={handleAddSection} className="space-y-3">
            <input
              type="text"
              required
              placeholder="欄位標題 (例如：113學年度第一學期 學生權益座談會公告)"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              className="w-full border rounded-lg p-2.5 text-sm outline-none"
            />
            <textarea
              required
              rows={3}
              placeholder="欄位內容與公告細節..."
              value={newContent}
              onChange={(e) => setNewContent(e.target.value)}
              className="w-full border rounded-lg p-2.5 text-sm outline-none"
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

      {/* 動態首頁欄位列表 */}
      <div className="space-y-6">
        {sections.map((section) => (
          <div key={section.id} className="bg-white p-6 rounded-xl border shadow-sm relative">
            {isAdmin && (
              <button
                onClick={() => handleDeleteSection(section.id)}
                className="absolute top-4 right-4 bg-red-50 text-red-600 border border-red-200 text-xs px-2.5 py-1 rounded hover:bg-red-100 font-bold"
              >
                🗑️ 刪除欄位
              </button>
            )}
            <h2 className="text-xl font-bold text-gray-800 mb-2">{section.title}</h2>
            <p className="text-gray-700 text-sm whitespace-pre-line leading-relaxed">{section.content}</p>
          </div>
        ))}

        {sections.length === 0 && (
          <div className="bg-white p-8 rounded-xl border text-center text-gray-400 text-sm">
            目前首頁尚無動態公告欄位。
          </div>
        )}
      </div>
    </div>
  )
}