import Link from 'next/link'

export default function HomePage() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {/* 1. 頁面橫幅 (Hero Banner) */}
      <div className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-2xl p-8 text-white mb-8 shadow-md">
        <h1 className="text-3xl font-extrabold mb-2">竹科實中 學權組官方平台</h1>
        <p className="text-blue-100 text-sm md:text-base">
          讓每一個學生的聲音都被聽見！提供提案、覆議與直接反映學生權益問題的管道。
        </p>
      </div>

      {/* 2. 快捷功能卡片 */}
      <div className="grid md:grid-cols-2 gap-4 mb-10">
        <Link
          href="/proposals"
          className="p-6 bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition group"
        >
          <div className="text-3xl mb-2">💡</div>
          <h2 className="text-lg font-bold text-gray-800 group-hover:text-blue-600 transition mb-1">
            學生提案區
          </h2>
          <p className="text-gray-600 text-xs leading-relaxed">
            發起校園制度改善提案，集結同學連署覆議，達到門檻後由學權組向校方研議。
          </p>
        </Link>

        <Link
          href="/feedback"
          className="p-6 bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition group"
        >
          <div className="text-3xl mb-2">💬</div>
          <h2 className="text-lg font-bold text-gray-800 group-hover:text-blue-600 transition mb-1">
            回饋與建言
          </h2>
          <p className="text-gray-600 text-xs leading-relaxed">
            快速反映日常校園設施、飲食或各項生活權益問題，獲得學權組專人第一時間回覆。
          </p>
        </Link>
      </div>

      {/* 3. 首頁文章／最新公告區 */}
      <article className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 md:p-8">
        <div className="flex items-center justify-between border-b pb-4 mb-6">
          <div>
            <span className="inline-block bg-blue-100 text-blue-700 text-xs font-bold px-2.5 py-1 rounded-full mb-2">
              📌 最新公告
            </span>
            <h2 className="text-xl md:text-2xl font-bold text-gray-800">
              【公告】竹科實中學生會學權組平台正式上線！
            </h2>
          </div>
          <span className="text-xs text-gray-400 whitespace-nowrap hidden sm:block">
            竹科實中學權組 宣
          </span>
        </div>

        {/* 文章內文 */}
        <div className="text-gray-700 text-sm leading-relaxed space-y-4">
          <p className="font-semibold text-gray-800">
            各位實中的同學們好：
          </p>
          <p>
            為了建立更透明、公開且具建設性的學生權益申訴與交流管道，學權組正式推出全新的線上平台。過去同學若對校園政策、設施或是生活權益有疑慮，往往苦於無直接反映管道；現在透過這個平台，大家可以隨時提出建言與提案！
          </p>

          <h3 className="text-base font-bold text-gray-800 border-l-4 border-blue-600 pl-3 my-3">
            🎯 本平台三大核心功能
          </h3>

          <ul className="list-disc pl-5 space-y-2 text-gray-600">
            <li>
              <strong className="text-gray-800">學生提案機制：</strong>同學可發表關於校園制度、法規改善之提案。獲得一定人數連署後，學權組將代表同學向學校開會研議。
            </li>
            <li>
              <strong className="text-gray-800">即時回饋與建言：</strong>生活設施故障、餐飲品質反映等各類建言，可快速留言，學權組會定期審核並給予官方回應。
            </li>
            <li>
              <strong className="text-gray-800">公開透明回覆：</strong>所有處理狀態（研議中、已成案、已回應等）皆公開可查，讓每一位同學都能監督進度。
            </li>
          </ul>

          <h3 className="text-base font-bold text-gray-800 border-l-4 border-blue-600 pl-3 my-3">
            📢 同學使用守則
          </h3>
          <p>
            請大家在發言與提案時保持理性、客觀與相互尊重，避免發表人身攻擊或與學生權益無關之內容。學權組會定期檢視討論區，並維持平台秩序。
          </p>

          <div className="bg-blue-50 p-4 rounded-lg border border-blue-100 text-xs text-blue-900 mt-6">
            💡 如果你有任何想法，現在就點擊上方卡片或選單，開始遞交你的第一份提案或建言吧！
          </div>
        </div>
      </article>
    </div>
  )
}