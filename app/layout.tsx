import type { Metadata } from 'next'
import { Inter, Noto_Sans_TC } from 'next/font/google'
import './globals.css'
import Navbar from '@/components/Navbar'
import { AuthProvider } from '@/components/AuthProvider'
import { THEME_INIT_SCRIPT } from '@/lib/theme'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' })
const notoSansTC = Noto_Sans_TC({
  variable: '--font-noto-sans-tc',
  display: 'swap',
  preload: false,
  adjustFontFallback: false,
})

export const metadata: Metadata = {
  title: '國立竹科實中 學生權益網',
  description: '維護學生權益・促進校園溝通・即時反映意見',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="zh-TW" className={`${inter.variable} ${notoSansTC.variable}`} suppressHydrationWarning>
      <head>
        <script id="nehs-rights-theme-init">{THEME_INIT_SCRIPT}</script>
      </head>
      <body>
        <AuthProvider>
          <Navbar />
          {children}
          <footer className="max-w-4xl mx-auto px-6 pb-10 pt-4 text-center">
            <p className="text-xs text-gray-500 dark:text-neutral-400">© 2026 NEHSNESC 竹科實中學聯會・學生權益網</p>
          </footer>
        </AuthProvider>
      </body>
    </html>
  )
}
