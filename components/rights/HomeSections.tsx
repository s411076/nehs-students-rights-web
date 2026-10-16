'use client';

import { useState } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { toHomeSectionDTO } from '@/lib/rights/queries';
import { validateBody, validateRawTitle } from '@/lib/rights/validation';
import { useRightsPage } from './useRightsPage';
import { useRightsMutation } from './useRightsMutation';
import { PageContinuation } from './PageContinuation';
import { Trash2 } from 'lucide-react';
import { ActionFeedback } from './ActionFeedback';

export function HomeSections() {
  const { isAdmin } = useAuth();
  const sections = useRightsPage('/api/rights/home-sections', toHomeSectionDTO);
  const mutation = useRightsMutation();
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  return <>
    {isAdmin && <div className="bg-purple-50 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-800 p-6 rounded-xl mb-8 shadow-sm">
      <h2 className="text-lg font-bold text-purple-900 dark:text-purple-300 mb-3">🔑 管理員控制台：新增首頁動態欄位</h2>
      <form onSubmit={event => {
        event.preventDefault();
        const checkedTitle = validateRawTitle(title);
        const checkedBody = validateBody(content);
        if (!checkedTitle.ok) { mutation.setError('請輸入有效的標題（1–100 字）。'); return; }
        if (!checkedBody.ok) { mutation.setError('請輸入有效的內容（1–5000 字）。'); return; }
        void mutation.run({ action: 'createHomeSection', payload: { title: checkedTitle.data, content: checkedBody.data } }, sections.refresh).then(result => {
          if (!result?.ok) return;
          setTitle(''); setContent('');
          if (result.refresh === 'updated') mutation.setNotice('首頁欄位發布成功！');
        });
      }} className="space-y-3">
        <label htmlFor="home-section-title" className="block text-sm font-bold text-gray-700 dark:text-slate-300">欄位標題</label>
        <input id="home-section-title" type="text" required value={title} disabled={mutation.busy} onChange={event => setTitle(event.target.value)} placeholder="欄位標題..."
          className="w-full border dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-purple-500" />
        <label htmlFor="home-section-content" className="block text-sm font-bold text-gray-700 dark:text-slate-300">欄位內容與公告細節</label>
        <textarea id="home-section-content" required rows={3} value={content} disabled={mutation.busy} onChange={event => setContent(event.target.value)} placeholder="欄位內容與公告細節..."
          className="w-full border dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-purple-500" />
        <button type="submit" disabled={mutation.busy} className="bg-purple-700 hover:bg-purple-800 text-white font-bold text-sm px-5 py-2 rounded-lg transition disabled:opacity-60">{mutation.busy ? '發布中...' : '發布到首頁'}</button>
        <button type="button" onClick={() => void sections.refresh()} disabled={mutation.busy || sections.status === 'loading'}
          className="min-h-11 px-3 text-sm font-semibold underline text-blue-700 dark:text-blue-300 focus-visible:ring-2 focus-visible:ring-blue-500 rounded">重新載入公告</button>
      </form>
      <ActionFeedback error={mutation.error} notice={mutation.notice} />
    </div>}
    <div className="space-y-6">
      {sections.status === 'loading' && sections.items.length === 0 && <p className="text-sm text-gray-400 py-2">公告載入中…</p>}
      {sections.status === 'error' && <div className="bg-white dark:bg-slate-900 p-6 rounded-xl border dark:border-slate-800 shadow-sm">
        <p role="alert" className="text-sm text-red-600 dark:text-red-400 mb-3">公告載入失敗，請重試。</p>
        <button type="button" onClick={() => void sections.refresh()} className="min-h-11 text-sm font-bold text-blue-600 dark:text-blue-400 underline">重試</button>
      </div>}
      {sections.status === 'ready' && sections.items.length === 0 && <p className="text-sm text-gray-400 py-2">目前沒有首頁公告。</p>}
      {sections.items.map(section => <div key={section.id} className="bg-white dark:bg-slate-900 p-6 rounded-xl border dark:border-slate-800 shadow-sm relative">
        {isAdmin && <button type="button" disabled={mutation.busy} onClick={() => {
          if (!window.confirm('確定要刪除此首頁欄位嗎？')) return;
          void mutation.run({ action: 'deleteHomeSection', payload: { id: section.id, expectedVersion: section.version } }).then(result => {
            if (result?.ok) { sections.remove(section.id); mutation.setNotice('已刪除首頁欄位。'); }
          });
        }} className="absolute top-4 right-4 min-h-11 bg-red-50 dark:bg-red-950/50 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800 text-xs px-2.5 py-1 rounded font-bold flex items-center gap-1"><Trash2 aria-hidden="true" size={14} className="shrink-0" /> 刪除</button>}
        <h2 className={`text-xl font-bold mb-2 break-words ${isAdmin ? 'pr-20' : ''}`}>{section.title}</h2>
        <p className="text-gray-700 dark:text-slate-300 text-sm whitespace-pre-line leading-relaxed">{section.content}</p>
      </div>)}
      <PageContinuation hasMore={sections.nextCursor !== null} loading={sections.status === 'loading'} onLoadMore={sections.loadMore} label="載入更多公告" />
    </div>
  </>;
}
