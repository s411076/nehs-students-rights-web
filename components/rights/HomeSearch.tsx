'use client';

import { useState } from 'react';
import { isPublicStatus, toFeedbackPublicDTO, toProposalDTO } from '@/lib/rights/queries';
import { countCodePoints } from '@/lib/rights/validation';
import { useRightsPage } from './useRightsPage';
import { ArrowRight, Lightbulb, MessageSquareText, Search } from 'lucide-react';
import { PageContinuation } from './PageContinuation';

const RECENT_SEARCH_KEY = 'nehs-rights-recent-searches';
const MAX_RECENT_SEARCHES = 8;

function loadRecentSearches(): string[] {
  try {
    if (typeof window === 'undefined') return [];
    const parsed: unknown = JSON.parse(window.localStorage.getItem(RECENT_SEARCH_KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string').slice(0, MAX_RECENT_SEARCHES) : [];
  } catch {
    return [];
  }
}

export function HomeSearch() {
  const [query, setQuery] = useState('');
  const [recents, setRecents] = useState<string[]>(loadRecentSearches);
  const term = query.trim();
  const valid = countCodePoints(term) <= 100;
  const enabled = valid && term.length > 0;
  const proposals = useRightsPage('/api/rights/proposals', toProposalDTO, { query: term, enabled });
  const feedback = useRightsPage('/api/rights/feedback', toFeedbackPublicDTO, { query: term, enabled });
  const rememberRecent = (value: string) => {
    const next = [value, ...recents.filter(item => item !== value)].slice(0, MAX_RECENT_SEARCHES);
    setRecents(next);
    try {
      window.localStorage.setItem(RECENT_SEARCH_KEY, JSON.stringify(next));
    } catch {
      // Private mode: memory-only history.
    }
  };
  const clearRecents = () => {
    setRecents([]);
    try {
      window.localStorage.removeItem(RECENT_SEARCH_KEY);
    } catch {
      // Private mode: nothing persisted.
    }
  };
  const results = [
    ...proposals.items.filter(item => isPublicStatus(item.status)).map(item => ({
      id: `proposal-${item.id}`, title: item.title, preview: item.content, url: `/proposals#item-${item.id}`, badge: '學生提案', kind: 'proposal' as const, status: item.status,
    })),
    ...feedback.items.map(item => ({
      id: `feedback-${item.id}`, title: item.title || item.content.slice(0, 20), preview: item.content, url: `/feedback#item-${item.id}`, badge: '建言', kind: 'feedback' as const, status: '',
    })),
  ];
  return <div className="bg-white dark:bg-slate-900 border dark:border-slate-800 p-5 rounded-2xl shadow-sm mb-8">
    <label htmlFor="home-search" className="flex items-center gap-1.5 text-xs font-bold text-gray-500 dark:text-slate-400 mb-2"><Search aria-hidden="true" size={14} className="shrink-0" /> 搜尋全站提案與建言</label>
    <form onSubmit={event => { event.preventDefault(); if (enabled) rememberRecent(term); }}>
      <input id="home-search" type="text" value={query} onChange={event => setQuery(event.target.value)}
        placeholder="輸入關鍵字搜尋（如：鞦韆、午餐、體育...）" aria-describedby="home-search-scope"
        className="w-full border dark:border-slate-700 bg-gray-50 dark:bg-slate-800 rounded-xl p-3 text-sm focus:ring-2 focus:ring-blue-500 dark:text-white" />
    </form>
    <p id="home-search-scope" className="text-xs text-gray-500 dark:text-slate-400 mt-2">搜尋所有公開提案與建言的標題、內容；結果分頁載入，不包含討論留言。</p>
    {term === '' && recents.length > 0 && <div className="mt-3 flex flex-wrap items-center gap-2">
      <span className="text-xs text-gray-500 dark:text-slate-400">最近搜尋：</span>
      {recents.map(item => <button key={item} type="button" onClick={() => setQuery(item)}
        className="min-h-11 px-3 text-xs font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/40 rounded-full">{item}</button>)}
      <button type="button" onClick={clearRecents} className="min-h-11 px-2 text-xs text-gray-500 dark:text-slate-400 underline">清除</button>
    </div>}
    {!valid && <p role="alert" className="text-sm text-red-700 dark:text-red-400 mt-2">搜尋關鍵字最多 100 字。</p>}
    {enabled && <div className="mt-4 space-y-2">
      {proposals.status === 'loading' && <p className="text-xs text-gray-500 dark:text-slate-400 py-1">提案搜尋載入中…</p>}
      {proposals.status === 'error' && <div className="flex items-center gap-2 py-1">
        <p className="text-xs text-red-600 dark:text-red-400">提案載入失敗，請重試。</p>
        <button type="button" onClick={() => void proposals.refresh()} className="min-h-11 text-xs font-bold text-blue-600 dark:text-blue-400 underline">重試提案</button>
      </div>}
      {feedback.status === 'loading' && <p className="text-xs text-gray-500 dark:text-slate-400 py-1">建言搜尋載入中…</p>}
      {feedback.status === 'error' && <div className="flex items-center gap-2 py-1">
        <p className="text-xs text-red-600 dark:text-red-400">建言載入失敗，請重試。</p>
        <button type="button" onClick={() => void feedback.refresh()} className="min-h-11 text-xs font-bold text-blue-600 dark:text-blue-400 underline">重試建言</button>
      </div>}
      <p className="text-xs font-bold text-gray-500 dark:text-slate-400">已載入搜尋結果 ({results.length} 筆)：</p>
      {proposals.status === 'ready' && feedback.status === 'ready' && results.length === 0 && <p className="text-xs text-gray-500 dark:text-slate-400 py-2">找不到符合「{query}」的提案或建言。</p>}
      {results.map(result => <a key={result.id} href={result.url}
        className="p-3.5 bg-gray-50 dark:bg-slate-800/80 hover:bg-blue-50 dark:hover:bg-slate-700/80 rounded-xl border dark:border-slate-700/60 cursor-pointer transition flex justify-between items-center group focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900">
        <div className="flex-1 min-w-0 pr-4">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-gray-200 dark:bg-slate-700 text-gray-700 dark:text-slate-200 flex items-center gap-1">{result.kind === 'proposal' ? <Lightbulb aria-hidden="true" size={12} className="shrink-0" /> : <MessageSquareText aria-hidden="true" size={12} className="shrink-0" />}{result.badge}</span>
            <span className="font-bold text-sm text-gray-800 dark:text-slate-100 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition break-words">{result.title}</span>
          </div>
          <p className="text-xs text-gray-500 dark:text-slate-400 line-clamp-1">{result.preview}</p>
        </div>
        <div className="flex items-center gap-2">
          {result.status && <span className="text-[11px] font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/40 px-2.5 py-1 rounded-md">{result.status}</span>}
          <span className="text-xs font-bold text-blue-600 dark:text-blue-400 whitespace-nowrap flex items-center gap-1">前往 <ArrowRight aria-hidden="true" size={14} className="shrink-0" /></span>
        </div>
      </a>)}
      <div className="flex flex-wrap gap-3">
        <PageContinuation hasMore={proposals.nextCursor !== null} loading={proposals.status === 'loading'} onLoadMore={proposals.loadMore} label="載入更多提案搜尋結果" />
        <PageContinuation hasMore={feedback.nextCursor !== null} loading={feedback.status === 'loading'} onLoadMore={feedback.loadMore} label="載入更多建言搜尋結果" />
      </div>
    </div>}
  </div>;
}
