'use client'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import {
  consumeOAuthResultParams,
  markLoginCelebrationFlag,
  resolveOAuthCompletion,
} from '@/lib/auth/oauth-completion'
import type { CompletionStatus } from '@/lib/auth/oauth-completion'

type CallbackView = 'verifying' | CompletionStatus

export default function AuthCallbackPage() {
  const [supabase] = useState(() => createClient())
  // The router object identity changes per render; hold it in a ref so the
  // one-shot completion effect below cannot re-run and re-verify.
  const routerRef = useRef(useRouter())
  const [view, setView] = useState<CallbackView>('verifying')

  useEffect(() => {
    let active = true
    void (async () => {
      // Await SDK initialization so the browser-owned automatic exchange
      // consumes ?code=… exactly once, then verify the resulting identity.
      // No manual exchange call is made here.
      const result = await resolveOAuthCompletion(supabase)
      if (!active) return
      consumeOAuthResultParams()
      if (!active) return
      setView(result.status)
      if (result.status === 'success') {
        markLoginCelebrationFlag()
        routerRef.current.replace('/')
        routerRef.current.refresh()
      }
    })()
    return () => {
      active = false
    }
  }, [supabase])

  if (view === 'success') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center p-24">
        <h2 className="text-xl font-semibold text-gray-700">登入成功！正在前往首頁…</h2>
      </div>
    )
  }

  if (view === 'ineligible') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-24 text-center">
        <h2 className="text-xl font-semibold text-gray-700">無法使用登入功能</h2>
        <p role="alert" className="text-sm text-gray-500">
          此帳號不是已確認的學校帳號（限 @nehs.hc.edu.tw）。公開內容仍可瀏覽，請使用學校帳號重新登入。
        </p>
        <a href="/" className="text-sm font-bold text-blue-600 underline">
          回首頁
        </a>
      </div>
    )
  }

  if (view === 'failure') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-24 text-center">
        <h2 className="text-xl font-semibold text-gray-700">登入失敗</h2>
        <p role="alert" className="text-sm text-gray-500">
          登入未完成或連結已失效（例如重複使用的登入連結），請回首頁重新登入。
        </p>
        <a href="/" className="text-sm font-bold text-blue-600 underline">
          回首頁重新登入
        </a>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-24">
      <h2 className="text-xl font-semibold text-gray-700">登入驗證中…</h2>
      <p role="status" className="mt-2 text-sm text-gray-500">
        正在確認學校帳號登入狀態，請稍候。
      </p>
    </div>
  )
}
