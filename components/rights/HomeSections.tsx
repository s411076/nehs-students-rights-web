'use client';

import { useState } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { toHomeSectionDTO } from '@/lib/rights/queries';
import { validateBody, validateRawTitle } from '@/lib/rights/validation';
import { useRightsPage } from './useRightsPage';
import { useRightsMutation } from './useRightsMutation';
import { PageContinuation } from './PageContinuation';
import { Save, ShieldCheck, Trash2 } from 'lucide-react';
import { ActionFeedback } from './ActionFeedback';
import { ui } from './ui';

export function HomeSections() {
  const { isAdmin } = useAuth();
  const sections = useRightsPage('/api/rights/home-sections', toHomeSectionDTO);
  const mutation = useRightsMutation();
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  return <>
    {isAdmin && <div className={`${ui.card} p-6 mb-8`}>
      <h2 className="text-lg font-bold text-gray-800 dark:text-neutral-200 mb-3 flex items-center gap-2"><ShieldCheck aria-hidden="true" className="size-5 shrink-0" /> 管理員控制台：新增首頁動態欄位</h2>
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
        <label htmlFor="home-section-title" className="block text-sm font-bold text-gray-700 dark:text-neutral-300">欄位標題</label>
        <input id="home-section-title" type="text" required value={title} disabled={mutation.busy} onChange={event => setTitle(event.target.value)} placeholder="欄位標題..."
          className={ui.field} />
        <label htmlFor="home-section-content" className="block text-sm font-bold text-gray-700 dark:text-neutral-300">欄位內容與公告細節</label>
        <textarea id="home-section-content" required rows={3} value={content} disabled={mutation.busy} onChange={event => setContent(event.target.value)} placeholder="欄位內容與公告細節..."
          className={ui.field} />
        <div className="flex flex-wrap items-center gap-2">
          <button type="submit" disabled={mutation.busy || !mutation.canWrite} className={ui.primaryButton}><Save aria-hidden="true" className="size-4 shrink-0" />{mutation.busy ? '發布中...' : '發布到首頁'}</button>
          <button type="button" onClick={() => void sections.refresh()} disabled={mutation.busy || sections.status === 'loading'}
            className={ui.secondaryButton}>重新載入公告</button>
        </div>
      </form>
      <ActionFeedback error={mutation.error} notice={mutation.notice} />
    </div>}
    <div className="space-y-6">
      {sections.status === 'loading' && sections.items.length === 0 && <p className="text-sm text-gray-400 py-2">公告載入中…</p>}
      {sections.status === 'error' && <div className={`${ui.card} p-6`}>
        <p role="alert" className="text-sm text-red-600 dark:text-red-400 mb-3">公告載入失敗，請重試。</p>
        <button type="button" onClick={() => void sections.refresh()} className={ui.secondaryButton}>重試</button>
      </div>}
      {sections.status === 'ready' && sections.items.length === 0 && <p className="text-sm text-gray-400 py-2">目前沒有首頁公告。</p>}
      {sections.items.map(section => <div key={section.id} className={`${ui.card} p-6 relative`}>
        {isAdmin && <button type="button" disabled={mutation.busy || !mutation.canWrite} onClick={() => {
          if (!window.confirm('確定要刪除此首頁欄位嗎？')) return;
          void mutation.run({ action: 'deleteHomeSection', payload: { id: section.id, expectedVersion: section.version } }).then(result => {
            if (result?.ok) { sections.remove(section.id); mutation.setNotice('已刪除首頁欄位。'); }
          });
        }} className={`${ui.dangerButton} absolute top-4 right-4`}><Trash2 aria-hidden="true" className="size-4 shrink-0" /> 刪除</button>}
        <h2 className={`text-xl font-bold mb-2 break-words ${isAdmin ? 'pr-24' : ''}`}>{section.title}</h2>
        <p className="text-gray-700 dark:text-neutral-300 text-sm whitespace-pre-line leading-relaxed">{section.content}</p>
      </div>)}
      <PageContinuation hasMore={sections.nextCursor !== null} loading={sections.status === 'loading'} onLoadMore={sections.loadMore} label="載入更多公告" />
    </div>
  </>;
}
