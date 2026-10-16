import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import Navbar from '@/components/Navbar'
import { AuthProvider } from '@/components/AuthProvider'

const inter = Inter({ subsets: ['latin'] })

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
    <html lang="zh-TW">
      <body className={inter.className}>
        <AuthProvider>
          <Navbar />
          {children}
          <footer className="max-w-4xl mx-auto px-6 pb-10 pt-4 text-center">
            <p className="text-xs text-gray-500 dark:text-slate-400">© 2026 NESHNESC 竹科實中學聯會・學生權益網</p>
          </footer>
        </AuthProvider>
      </body>
    </html>
  )
}
