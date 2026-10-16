'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase'
import confetti from 'canvas-confetti'
import { useAuth, useOAuthReturn } from '@/components/AuthProvider'
import {
  clearLoginCelebrationFlag,
  consumeLoginCelebrationFlag,
  markLoginCelebrationFlag,
  startGoogleOAuth,
} from '@/lib/auth/oauth-completion'
import { RIGHTS_FEEDBACK_PATH, makeFailure, makeSuccess } from '@/lib/rights/contracts'
import type { RightsResult } from '@/lib/rights/contracts'
import { createRightsActionFlight, readRights } from '@/lib/rights/client'
import {
  HOME_SELECT_STRING,
  PROPOSAL_SELECT_STRING,
  applyPublicStatusFilter,
  isPublicStatus,
  toFeedbackPublicDTO,
  toHomeSectionDTO,
  toProposalDTO,
} from '@/lib/rights/queries'
import type { FeedbackPublicDTO, HomeSectionDTO, ProposalDTO } from '@/lib/rights/queries'
import { validateBody, validateId, validateRawTitle } from '@/lib/rights/validation'

type SourceStatus = 'loading' | 'error' | 'ready'

interface ProposalSource {
  status: SourceStatus
  items: ProposalDTO[]
}

interface FeedbackSource {
  status: SourceStatus
  items: FeedbackPublicDTO[]
}

interface SectionSource {
  status: SourceStatus
  items: HomeSectionDTO[]
}

interface ActionMessage {
  kind: 'success' | 'error'
  text: string
}

/** Fail-closed list parser: any malformed row fails the whole read, never guessed. */
function parseFeedbackList(data: unknown): FeedbackPublicDTO[] {
  if (!Array.isArray(data)) throw new TypeError('Invalid feedback payload')
  return data.map((row) => {
    const dto = toFeedbackPublicDTO(row)
    if (dto === null) throw new TypeError('Invalid feedback row')
    return dto
  })
}

export default function HomePage() {
  const [supabase] = useState(() => createClient())
  const auth = useAuth()
  const oauthReturn = useOAuthReturn()
  const generation = auth.generation
  const isAdmin = auth.isAdmin
  const isLoggedIn = auth.isLoggedIn
  const authStatus = auth.status
  const genRef = useRef(generation)
  genRef.current = generation

  const [proposals, setProposals] = useState<ProposalSource>({ status: 'loading', items: [] })
  const [feedbacks, setFeedbacks] = useState<FeedbackSource>({ status: 'loading', items: [] })
  const [sections, setSections] = useState<SectionSource>({ status: 'loading', items: [] })
  const [proposalNonce, setProposalNonce] = useState(0)
  const [feedbackNonce, setFeedbackNonce] = useState(0)
  const [sectionNonce, setSectionNonce] = useState(0)
  const [searchQuery, setSearchQuery] = useState('')
  const [authRetryNonce, setAuthRetryNonce] = useState(0)
  const [loginPending, setLoginPending] = useState(false)
  const loginFlight = useRef(false)

  useEffect(() => {
    if (authRetryNonce > 0) window.location.reload()
  }, [authRetryNonce])

  const [newTitle, setNewTitle] = useState('')
  const [newContent, setNewContent] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [actionMessage, setActionMessage] = useState<ActionMessage | null>(null)
  const createFlight = useRef(createRightsActionFlight())
  const deleteFlight = useRef(createRightsActionFlight())

  const [posStudent, setPosStudent] = useState({ x: 0, y: 0 })

  useEffect(() => {
    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    let interval: ReturnType<typeof setInterval> | undefined
    const updateMotion = () => {
      clearInterval(interval)
      if (motionQuery.matches || loginPending || isLoggedIn || authStatus === 'unavailable') {
        setPosStudent({ x: 0, y: 0 })
        return
      }
      interval = setInterval(() => {
        setPosStudent({
          x: Math.sin(Date.now() / 800) * 18,
          y: Math.cos(Date.now() / 600) * 10
        })
      }, 50)
    }
    updateMotion()
    motionQuery.addEventListener('change', updateMotion)
    return () => {
      clearInterval(interval)
      motionQuery.removeEventListener('change', updateMotion)
    }
  }, [loginPending, isLoggedIn, authStatus])

  const triggerConfetti = () => {
    confetti({ particleCount: 120, spread: 80, origin: { y: 0.6 } })
  }

  const [oauthOutcome, setOauthOutcome] = useState<'failure' | 'ineligible' | null>(null)
  useEffect(() => {
    if (typeof window === 'undefined') return
    let active = true
    const gen = generation
    void (async () => {
      if (!oauthReturn.intended) return
      const result = await oauthReturn.complete()
      if (!active || genRef.current !== gen) return
      if (authStatus === 'loading') return
      if (result.status === 'success' && isLoggedIn) {
        setOauthOutcome(null)
        if (consumeLoginCelebrationFlag()) triggerConfetti()
        return
      }
      setOauthOutcome(result.status === 'ineligible' || authStatus === 'ineligible' ? 'ineligible' : 'failure')
      clearLoginCelebrationFlag()
    })().catch(() => {
      if (!active || genRef.current !== gen) return
      clearLoginCelebrationFlag()
      setOauthOutcome('failure')
    })
    return () => {
      active = false
    }
  }, [authStatus, isLoggedIn, generation, oauthReturn])

  const loadProposalsNow = useCallback(async (gen: number): Promise<RightsResult<unknown>> => {
    try {
      const baseQuery = supabase
        .from('proposals')
        .select(PROPOSAL_SELECT_STRING)
        .order('created_at', { ascending: false })
      const { data, error } = await (applyPublicStatusFilter(baseQuery) as typeof baseQuery)
      if (error || !Array.isArray(data)) throw new Error('proposals unavailable')
      const items = data
        .map((row) => toProposalDTO(row))
        .filter((dto): dto is ProposalDTO => dto !== null && isPublicStatus(dto.status))
      if (genRef.current !== gen) return makeFailure('UNAVAILABLE')
      setProposals({ status: 'ready', items })
      return makeSuccess(null)
    } catch {
      if (genRef.current !== gen) return makeFailure('UNAVAILABLE')
      setProposals((previous) => ({ status: 'error', items: previous.items }))
      return makeFailure('UNAVAILABLE')
    }
  }, [supabase])

  const loadFeedbackNow = useCallback(async (gen: number): Promise<RightsResult<unknown>> => {
    const result = await readRights(RIGHTS_FEEDBACK_PATH, parseFeedbackList)
    if (genRef.current !== gen) return makeFailure('UNAVAILABLE')
    if (!result.ok) {
      setFeedbacks((previous) => ({ status: 'error', items: previous.items }))
      return result
    }
    setFeedbacks({ status: 'ready', items: result.data })
    return makeSuccess(null)
  }, [])

  const loadSectionsNow = useCallback(async (gen: number): Promise<RightsResult<unknown>> => {
    try {
      const { data, error } = await supabase
        .from('home_sections')
        .select(HOME_SELECT_STRING)
        .order('created_at', { ascending: false })
      if (error || !Array.isArray(data)) throw new Error('sections unavailable')
      const items = data
        .map((row) => toHomeSectionDTO(row))
        .filter((dto): dto is HomeSectionDTO => dto !== null)
      if (genRef.current !== gen) return makeFailure('UNAVAILABLE')
      setSections({ status: 'ready', items })
      return makeSuccess(null)
    } catch {
      if (genRef.current !== gen) return makeFailure('UNAVAILABLE')
      setSections((previous) => ({ status: 'error', items: previous.items }))
      return makeFailure('UNAVAILABLE')
    }
  }, [supabase])

  useEffect(() => {
    setProposals((previous) => (previous.status === 'ready' ? previous : { status: 'loading', items: previous.items }))
    void loadProposalsNow(generation)
  }, [generation, proposalNonce, loadProposalsNow])

  useEffect(() => {
    setFeedbacks((previous) => (previous.status === 'ready' ? previous : { status: 'loading', items: previous.items }))
    void loadFeedbackNow(generation)
  }, [generation, feedbackNonce, loadFeedbackNow])

  useEffect(() => {
    setSections((previous) => (previous.status === 'ready' ? previous : { status: 'loading', items: previous.items }))
    void loadSectionsNow(generation)
  }, [generation, sectionNonce, loadSectionsNow])

  const handleLogin = async () => {
    if (loginFlight.current) return
    loginFlight.current = true
    setLoginPending(true)
    const gen = generation
    markLoginCelebrationFlag()
    try {
      const result = await startGoogleOAuth(supabase, window.location.origin)
      if (result && typeof result === 'object' && 'error' in result && result.error) throw result.error
    } catch {
      loginFlight.current = false
      clearLoginCelebrationFlag()
      if (genRef.current === gen) {
        setOauthOutcome('failure')
        setLoginPending(false)
      }
    }
  }

  const handleAddSection = async (e: React.FormEvent) => {
    e.preventDefault()
    if (submitting) return

    const title = validateRawTitle(newTitle)
    if (!title.ok) {
      setActionMessage({ kind: 'error', text: '請輸入有效的標題（1–100 字）。' })
      return
    }
    const body = validateBody(newContent)
    if (!body.ok) {
      setActionMessage({ kind: 'error', text: '請輸入有效的內容（1–5000 字）。' })
      return
    }

    setSubmitting(true)
    try {
      const gen = genRef.current
      const result = await createFlight.current(
        { action: 'createHomeSection', payload: { title: title.data, content: body.data } },
        () => (genRef.current === gen ? loadSectionsNow(gen) : Promise.resolve(makeSuccess(null))),
      )
      if (genRef.current !== gen) return
      if (!result.ok) {
        setActionMessage({ kind: 'error', text: result.message })
        return
      }
      if (result.refresh === 'failed') {
        setActionMessage({ kind: 'error', text: result.message ?? '已儲存，但清單更新失敗' })
        return
      }
      setActionMessage({ kind: 'success', text: '首頁欄位發布成功！' })
      setNewTitle('')
      setNewContent('')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDeleteSection = async (id: string) => {
    const checked = validateId(id)
    if (!checked.ok) {
      setActionMessage({ kind: 'error', text: '無效的欄位識別碼，無法刪除。' })
      return
    }
    if (!window.confirm('確定要刪除此首頁欄位嗎？')) return
    const gen = genRef.current
    const result = await deleteFlight.current(
      { action: 'deleteHomeSection', payload: { id: checked.data } },
      () => (genRef.current === gen ? loadSectionsNow(gen) : Promise.resolve(makeSuccess(null))),
    )
    if (genRef.current !== gen) return
    if (!result.ok) {
      setActionMessage({ kind: 'error', text: result.message })
      return
    }
    if (result.refresh === 'failed') {
      setActionMessage({ kind: 'error', text: result.message ?? '已儲存，但清單更新失敗' })
      return
    }
    setActionMessage({ kind: 'success', text: '已刪除首頁欄位。' })
  }

  // 全站搜尋比對（僅公開提案標題/內容、公開建言標題/內容）
  const q = searchQuery.trim().toLowerCase()
  const searchResults = q ? [
    ...proposals.items
      .filter(p => p.title?.toLowerCase().includes(q) || p.content?.toLowerCase().includes(q))
      .map(p => ({
        id: p.id,
        type: 'proposal',
        title: p.title || '無標題提案',
        preview: p.content,
        url: `/proposals#item-${p.id}`,
        badge: '💡 學生提案',
        status: p.status
      })),
    ...feedbacks.items
      .filter(f => f.title?.toLowerCase().includes(q) || f.content?.toLowerCase().includes(q))
      .map(f => ({
        id: f.id,
        type: 'feedback',
        title: f.title || f.content?.slice(0, 20) || '無標題建言',
        preview: f.content,
        url: `/feedback#item-${f.id}`,
        badge: '💬 建言/留言',
        status: null as string | null
      }))
  ] : []

  const userName = auth.user?.displayName || auth.user?.email?.split('@')[0]

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-950 text-gray-900 dark:text-slate-100 transition-colors">
      <main className="max-w-4xl mx-auto p-6">
        <div className="text-center my-8">
          <h1 className="text-3xl font-extrabold mb-2">🎓 國立竹科實中 學生權益網</h1>
          <p className="text-gray-600 dark:text-slate-400 text-sm">維護學生權益・促進校園溝通・即時反映意見</p>
        </div>

        {authStatus !== 'unavailable' && (authStatus === 'ineligible' || oauthOutcome) && (
              <p role="alert" className="mb-4 text-sm font-bold text-red-600 dark:text-red-400">
                {authStatus === 'ineligible' || oauthOutcome === 'ineligible'
                  ? '登入資格不符：請使用已驗證的竹科實中學校帳號。'
                  : '登入失敗：Google 回傳錯誤或登入未完成，請再試一次。'}
              </p>
        )}
        {authStatus === 'unavailable' ? (
          <div className="bg-white dark:bg-slate-900 border dark:border-slate-800 p-8 rounded-2xl shadow-lg mb-10 text-center">
            <p role="alert" className="text-sm font-bold text-red-600 dark:text-red-400 mb-4">
              登入服務暫時無法使用，無法確認目前的登入狀態。請稍後重試。
            </p>
            <button
              type="button"
              onClick={() => setAuthRetryNonce((n) => n + 1)}
              disabled={authRetryNonce > 0}
              className="text-sm font-bold text-blue-600 dark:text-blue-400 underline rounded focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-60 disabled:cursor-wait"
            >
              {authRetryNonce > 0 ? '重試中…' : '重試身分驗證'}
            </button>
          </div>
        ) : !isLoggedIn ? (
          <div className="bg-white dark:bg-slate-900 border dark:border-slate-800 p-8 rounded-2xl shadow-lg mb-10 text-center relative overflow-hidden">
            <h2 className="text-xl font-bold mb-6 text-gray-800 dark:text-slate-200">登入學生權益網</h2>

            <div className="flex items-center justify-center py-6 relative min-h-[160px]">
              <button
                type="button"
                onClick={() => handleLogin()}
                disabled={loginPending}
                aria-busy={loginPending}
                style={{ transform: `translate(${posStudent.x}px, ${posStudent.y}px)` }}
                className="w-full sm:w-auto bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-extrabold text-xl sm:text-2xl py-6 px-4 sm:px-10 rounded-2xl shadow-xl hover:shadow-2xl transition-all duration-150 motion-reduce:transition-none flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-3 cursor-pointer focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900 disabled:opacity-60 disabled:cursor-wait"
              >
                <span aria-live="polite">{loginPending ? '登入中…' : '以學校帳號登入'}</span>
                <span className="text-sm font-normal">（限 @nehs.hc.edu.tw）</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="bg-blue-50 dark:bg-slate-900/80 border border-blue-200 dark:border-slate-800 p-4 rounded-xl mb-8 flex justify-between items-center">
            <span className="font-bold text-blue-900 dark:text-blue-300">
              🎉 歡迎回來，{userName}！
            </span>
            {isAdmin && (
              <span className="bg-purple-100 dark:bg-purple-900/60 text-purple-700 dark:text-purple-300 text-xs px-3 py-1 rounded-full font-bold">
                學權組管理員權限
              </span>
            )}
          </div>
        )}

        {/* 全站精準搜尋列 */}
        <div className="bg-white dark:bg-slate-900 border dark:border-slate-800 p-5 rounded-2xl shadow-sm mb-8">
          <label htmlFor="home-search" className="block text-xs font-bold text-gray-500 dark:text-slate-400 mb-2">🔍 搜尋全站提案、建言與留言</label>
          <input
            id="home-search"
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="輸入關鍵字搜尋（如：鞦韆、午餐、體育...）"
            className="w-full border dark:border-slate-700 bg-gray-50 dark:bg-slate-800 rounded-xl p-3 text-sm focus:ring-2 focus:ring-blue-500 dark:text-white"
          />

          {searchQuery.trim() && (
            <div className="mt-4 space-y-2">
              {proposals.status === 'loading' && (
                <p className="text-xs text-gray-400 py-1">提案搜尋載入中…</p>
              )}
              {proposals.status === 'error' && (
                <div className="flex items-center gap-2 py-1">
                  <p className="text-xs text-red-600 dark:text-red-400">提案載入失敗，請重試。</p>
                  <button
                    type="button"
                    onClick={() => setProposalNonce((n) => n + 1)}
                    className="text-xs font-bold text-blue-600 dark:text-blue-400 underline"
                  >
                    重試提案
                  </button>
                </div>
              )}
              {feedbacks.status === 'loading' && (
                <p className="text-xs text-gray-400 py-1">建言搜尋載入中…</p>
              )}
              {feedbacks.status === 'error' && (
                <div className="flex items-center gap-2 py-1">
                  <p className="text-xs text-red-600 dark:text-red-400">建言載入失敗，請重試。</p>
                  <button
                    type="button"
                    onClick={() => setFeedbackNonce((n) => n + 1)}
                    className="text-xs font-bold text-blue-600 dark:text-blue-400 underline"
                  >
                    重試建言
                  </button>
                </div>
              )}
              <p className="text-xs font-bold text-gray-500 dark:text-slate-400">
                搜尋結果 ({searchResults.length} 筆)：
              </p>
              {proposals.status === 'ready' && feedbacks.status === 'ready' && searchResults.length === 0 ? (
                <p className="text-xs text-gray-400 py-2">找不到符合「{searchQuery}」的提案或建言。</p>
              ) : (
                searchResults.map((res) => (
                  <a
                    key={`${res.type}-${res.id}`}
                    href={res.url}
                    className="p-3.5 bg-gray-50 dark:bg-slate-800/80 hover:bg-blue-50 dark:hover:bg-slate-700/80 rounded-xl border dark:border-slate-700/60 cursor-pointer transition flex justify-between items-center group focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900"
                  >
                    <div className="flex-1 min-w-0 pr-4">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-gray-200 dark:bg-slate-700 text-gray-700 dark:text-slate-200">
                          {res.badge}
                        </span>
                        <span className="font-bold text-sm text-gray-800 dark:text-slate-100 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition">
                          {res.title}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 dark:text-slate-400 line-clamp-1">
                        {res.preview}
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      {res.status && (
                        <span className="text-[11px] font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/40 px-2.5 py-1 rounded-md">
                          {res.status}
                        </span>
                      )}
                      <span className="text-xs font-bold text-blue-600 dark:text-blue-400">👉 前往</span>
                    </div>
                  </a>
                ))
              )}
            </div>
          )}
        </div>

        {isAdmin && (
          <div className="bg-purple-50 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-800 p-6 rounded-xl mb-8 shadow-sm">
            <h2 className="text-lg font-bold text-purple-900 dark:text-purple-300 mb-3">🔑 管理員控制台：新增首頁動態欄位</h2>
            <form onSubmit={handleAddSection} className="space-y-3">
              <label htmlFor="home-section-title" className="block text-sm font-bold text-gray-700 dark:text-slate-300">欄位標題</label>
              <input
                id="home-section-title"
                type="text"
                required
                placeholder="欄位標題..."
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                className="w-full border dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-purple-500"
              />
              <label htmlFor="home-section-content" className="block text-sm font-bold text-gray-700 dark:text-slate-300">欄位內容與公告細節</label>
              <textarea
                id="home-section-content"
                required
                rows={3}
                placeholder="欄位內容與公告細節..."
                value={newContent}
                onChange={(e) => setNewContent(e.target.value)}
                className="w-full border dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-purple-500"
              />
              <button
                type="submit"
                disabled={submitting}
                className="bg-purple-700 hover:bg-purple-800 text-white font-bold text-sm px-5 py-2 rounded-lg transition"
              >
                {submitting ? '發布中...' : '發布到首頁'}
              </button>
            </form>
            {actionMessage && (
              <p
                role={actionMessage.kind === 'error' ? 'alert' : 'status'}
                className={actionMessage.kind === 'error'
                  ? 'mt-3 text-sm text-red-600 dark:text-red-400'
                  : 'mt-3 text-sm text-green-700 dark:text-green-400'}
              >
                {actionMessage.text}
              </p>
            )}
          </div>
        )}

        <div className="space-y-6">
          {sections.status === 'loading' && (
            <p className="text-sm text-gray-400 py-2">公告載入中…</p>
          )}
          {sections.status === 'error' && (
            <div className="bg-white dark:bg-slate-900 p-6 rounded-xl border dark:border-slate-800 shadow-sm">
              <p className="text-sm text-red-600 dark:text-red-400 mb-3">公告載入失敗，請重試。</p>
              <button
                type="button"
                onClick={() => setSectionNonce((n) => n + 1)}
                className="text-sm font-bold text-blue-600 dark:text-blue-400 underline"
              >
                重試
              </button>
            </div>
          )}
          {sections.status === 'ready' && sections.items.length === 0 && (
            <p className="text-sm text-gray-400 py-2">目前沒有首頁公告。</p>
          )}
          {sections.items.map((section) => (
            <div key={section.id} className="bg-white dark:bg-slate-900 p-6 rounded-xl border dark:border-slate-800 shadow-sm relative">
              {isAdmin && (
                <button
                  type="button"
                  onClick={() => handleDeleteSection(section.id)}
                  className="absolute top-4 right-4 bg-red-50 dark:bg-red-950/50 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800 text-xs px-2.5 py-1 rounded font-bold"
                >
                  🗑️ 刪除
                </button>
              )}
              <h2 className={`text-xl font-bold mb-2 break-words ${isAdmin ? 'pr-20' : ''}`}>{section.title}</h2>
              <p className="text-gray-700 dark:text-slate-300 text-sm whitespace-pre-line leading-relaxed">{section.content}</p>
            </div>
          ))}
        </div>
      </main>
    </div>
  )
}
