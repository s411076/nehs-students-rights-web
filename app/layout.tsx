import './globals.css'
import Link from 'next/link'

export const metadata = {
  title: '竹科實中 學權組平台',
  description: '竹科實中學生會學權組官方平台',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="zh-TW">
      <body className="bg-gray-50 min-h-screen text-gray-900">
        {/* 全站頂部導覽列 */}
        <nav className="bg-white border-b shadow-sm sticky top-0 z-50">
          <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
            <Link href="/" className="font-bold text-xl text-blue-600">
              竹科實中學權組
            </Link>
            <div className="flex items-center gap-6 font-medium text-sm">
              <Link href="/" className="hover:text-blue-600 transition">
                🏠 首頁
              </Link>
              <Link href="/feedback" className="hover:text-blue-600 transition">
                💬 回饋與建言
              </Link>
              <Link href="/proposals" className="hover:text-blue-600 transition">
                💡 學生提案區
              </Link>
              <Link
                href="/admin"
                className="bg-slate-800 text-white hover:bg-slate-700 font-bold px-3 py-1.5 rounded-lg transition flex items-center gap-1 text-xs ml-2"
              >
                🎓 幹部登入 / 後台
              </Link>
            </div>
          </div>
        </nav>

        {/* 頁面內容 */}
        <main>{children}</main>
      </body>
    </html>
  )
}