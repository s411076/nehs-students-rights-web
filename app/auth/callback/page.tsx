'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'

export default function AuthCallbackPage() {
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    // 檢查登入狀態並自動跳轉回首頁
    const checkAuth = async () => {
      await supabase.auth.getSession()
      router.push('/')
      router.refresh()
    }
    checkAuth()
  }, [router, supabase])

  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-24">
      <h2 className="text-xl font-semibold text-gray-700">登入成功！正在跳轉中...</h2>
    </div>
  )
}