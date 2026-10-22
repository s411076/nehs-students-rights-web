'use client'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { House, Lightbulb, LogOut, Menu, MessageSquareText, Moon, Sun, User, X } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { useAuth, useLogoutNotice } from '@/components/AuthProvider'
import { useTheme } from '@/components/useTheme'
import { ui } from '@/components/rights/ui'

export default function Navbar() {
  const auth = useAuth()
  const { theme, toggleTheme } = useTheme()
  const [isOpen, setIsOpen] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)
  const { logoutError, logoutPending, beginLogout, reportLogoutFailure } = useLogoutNotice()
  const logoutGeneration = useRef<number | null>(null)
  const menuTriggerRef = useRef<HTMLButtonElement>(null)
  const drawerRef = useRef<HTMLElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!isOpen) return
    const trigger = menuTriggerRef.current
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    closeButtonRef.current?.focus()

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        setIsOpen(false)
      } else if (event.key === 'Tab') {
        const controls = drawerRef.current?.querySelectorAll<HTMLElement>('a[href], button:not([disabled])')
        const first = controls?.[0]
        const last = controls?.[controls.length - 1]
        const outside = !drawerRef.current?.contains(document.activeElement)
        if (event.shiftKey && (document.activeElement === first || outside)) {
          event.preventDefault()
          last?.focus()
        } else if (!event.shiftKey && (document.activeElement === last || outside)) {
          event.preventDefault()
          first?.focus()
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = previousOverflow
      trigger?.focus()
    }
  }, [isOpen])

  // Release the local logging-out gate only when the provider advances to a
  // fresh generation (a new verification). Stale responses for the old
  // generation never restore privileged UI.
  useEffect(() => {
    if (logoutGeneration.current !== null && auth.generation !== logoutGeneration.current) {
      logoutGeneration.current = null
      setLoggingOut(false)
    }
  }, [auth.generation])

  const handleLogout = async () => {
    logoutGeneration.current = auth.generation
    setLoggingOut(true)
    beginLogout()
    try {
      const { error } = await createClient().auth.signOut()
      if (error) throw error
      window.location.href = '/'
    } catch {
      // Fail closed: stay nonprivileged until the provider verifies again.
      // Never declare logout success silently and never clear bulk storage.
      reportLogoutFailure()
    }
  }

  const isPrivileged = auth.isLoggedIn && !loggingOut
  const userName = isPrivileged ? (auth.user?.displayName.trim() || '使用者') : null

  return (
    <>
      <nav className={`${ui.surface} text-gray-900 dark:text-white border-b ${ui.border} sticky top-0 z-40`}>
        <div className="max-w-7xl mx-auto px-4 h-16 flex justify-between items-center gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              ref={menuTriggerRef}
              onClick={(event) => { event.currentTarget.focus(); setIsOpen(true) }}
              aria-label="開啟側邊選單"
              aria-expanded={isOpen}
              aria-controls="navbar-drawer"
              className={ui.iconButton}
              title="開啟側邊選單"
            >
              <Menu aria-hidden="true" className="size-5" />
            </button>

            <Link className="min-w-0 truncate font-extrabold text-lg tracking-tight text-inherit" href="/">
              竹科實中學權組
            </Link>
          </div>

          <div className="flex min-w-0 max-w-1/2 items-center justify-end gap-2 sm:gap-3">
            <button
              type="button"
              onClick={toggleTheme}
              disabled={theme === null}
              aria-label="深色模式"
              aria-pressed={theme === 'dark'}
              title={theme === 'dark' ? '切換為淺色模式' : '切換為深色模式'}
              className={ui.iconButton}
            >
              <Sun aria-hidden="true" className="hidden size-5 dark:block" />
              <Moon aria-hidden="true" className="size-5 dark:hidden" />
            </button>
             {(loggingOut || logoutPending) && !logoutError && (
              <p data-testid="operation-status" role="status" aria-live="polite" className="min-w-0 truncate text-xs font-bold text-gray-500 dark:text-neutral-400">
                登出中…
              </p>
            )}
            {logoutError && (
              <>
                <p data-testid="operation-status" role="alert" title={logoutError} className="min-w-0 truncate text-xs font-bold text-red-600 dark:text-red-400">
                  {logoutError}
                </p>
                <button
                  type="button"
                  onClick={() => window.location.reload()}
                  className={ui.secondaryButton}
                >
                  重試
                </button>
              </>
            )}
            {isPrivileged && (
              <button
                type="button"
                onClick={handleLogout}
                className={`${ui.secondaryButton} whitespace-nowrap`}
              >
                <LogOut aria-hidden="true" className="size-4 shrink-0" /> 登出
              </button>
            )}
          </div>
        </div>
      </nav>

      {isOpen && (
        <button
          type="button"
          tabIndex={-1}
          aria-label="關閉導覽選單背景"
          onClick={() => setIsOpen(false)}
          className="fixed inset-0 bg-black/50 z-50 transition-opacity"
        />
      )}

      <aside
        ref={drawerRef}
        id="navbar-drawer"
        role="dialog"
        aria-modal={isOpen ? true : undefined}
        aria-label="導覽選單"
        inert={!isOpen}
        className={`fixed top-0 left-0 bottom-0 w-72 max-w-full max-h-dvh overflow-y-auto overscroll-contain ${ui.surface} z-50 shadow-2xl transform transition-transform duration-300 ease-in-out motion-reduce:transition-opacity motion-reduce:translate-x-0 border-r ${ui.border} flex flex-col justify-between ${
          isOpen ? 'translate-x-0' : '-translate-x-full motion-reduce:opacity-0'
        }`}
      >
        <div className="shrink-0">
          <div className={`p-5 border-b ${ui.border} flex justify-between items-center`}>
            <span className="font-extrabold text-base text-gray-900 dark:text-white flex items-center gap-2">
              導覽選單
            </span>
            <button
              type="button"
              ref={closeButtonRef}
              onClick={() => setIsOpen(false)}
              aria-label="關閉側邊選單"
              className={ui.iconButton}
            >
              <X aria-hidden="true" className="size-5" />
            </button>
          </div>

          <div className="p-4 space-y-2">
            <Link href="/" onClick={() => setIsOpen(false)}
              className="flex items-center gap-3 px-4 py-3 text-sm font-bold text-gray-700 dark:text-neutral-200 hover:bg-blue-50 dark:hover:bg-neutral-800 rounded-xl transition-[background-color] group"
            >
              <House aria-hidden="true" size={18} className="shrink-0" />
              <span className="group-hover:text-blue-600 dark:group-hover:text-blue-400">首頁</span>
            </Link>

            <Link href="/feedback" onClick={() => setIsOpen(false)}
              className="flex items-center gap-3 px-4 py-3 text-sm font-bold text-gray-700 dark:text-neutral-200 hover:bg-blue-50 dark:hover:bg-neutral-800 rounded-xl transition-[background-color] group"
            >
              <MessageSquareText aria-hidden="true" size={18} className="shrink-0" />
              <span className="group-hover:text-blue-600 dark:group-hover:text-blue-400">回饋與建言</span>
            </Link>

            <Link href="/proposals" onClick={() => setIsOpen(false)}
              className="flex items-center gap-3 px-4 py-3 text-sm font-bold text-gray-700 dark:text-neutral-200 hover:bg-blue-50 dark:hover:bg-neutral-800 rounded-xl transition-[background-color] group"
            >
              <Lightbulb aria-hidden="true" size={18} className="shrink-0" />
              <span className="group-hover:text-blue-600 dark:group-hover:text-blue-400">學生提案</span>
            </Link>

            {isPrivileged && (
              <Link href="/profile" onClick={() => setIsOpen(false)}
                className="flex items-center gap-3 px-4 py-3 text-sm font-bold text-gray-700 dark:text-neutral-200 hover:bg-blue-50 dark:hover:bg-neutral-800 rounded-xl transition-[background-color] group"
              >
                <User aria-hidden="true" size={18} className="shrink-0" />
                <span className="group-hover:text-blue-600 dark:group-hover:text-blue-400">個人資料</span>
              </Link>
            )}

          </div>
        </div>

        {isPrivileged && userName && (
          <div className={`shrink-0 p-4 border-t ${ui.border} bg-neutral-50 dark:bg-neutral-800/50`}>
            <p className="text-xs text-gray-500 dark:text-neutral-400 font-bold">目前登入為：</p>
            <p className="text-sm font-extrabold text-gray-800 dark:text-neutral-200 truncate mt-0.5">{userName}</p>
          </div>
        )}
      </aside>
    </>
  )
}
