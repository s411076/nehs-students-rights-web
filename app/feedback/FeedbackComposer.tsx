'use client';

import { useState } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { PROPOSAL_CATEGORIES } from '@/lib/rights/contracts';
import { useRightsMutation } from '@/components/rights/useRightsMutation';
import { ActionFeedback } from '@/components/rights/ActionFeedback';

export function FeedbackComposer({ refresh }: { readonly refresh: () => Promise<unknown> }) {
  const { isLoggedIn } = useAuth();
  const mutation = useRightsMutation();
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [category, setCategory] = useState('其他');
  const [isAnonymous, setIsAnonymous] = useState(false);
  if (!isLoggedIn) return <div className="p-3.5 bg-gray-100/90 dark:bg-slate-800/80 rounded-2xl text-center text-sm font-semibold text-gray-500 dark:text-slate-400 shadow-sm flex items-center justify-center gap-1.5 border border-gray-200/50 dark:border-slate-700">🔒 請登入後即可發表建言</div>;
  return <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-gray-200 dark:border-slate-800 shadow-sm space-y-4">
    <ActionFeedback error={mutation.error} notice={mutation.notice} />
    <form onSubmit={event => {
      event.preventDefault();
      void mutation.run({ action: 'createFeedback', payload: { title, content, category, isAnonymous } }, refresh).then(result => {
        if (!result?.ok) return;
        setTitle(''); setContent('');
        if (result.refresh === 'updated') mutation.setNotice('建言已成功送出！');
      });
    }} className="space-y-4">
      <fieldset disabled={mutation.busy} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="sm:col-span-2">
            <label htmlFor="feedback-title" className="block text-sm font-semibold text-gray-700 dark:text-slate-300 mb-1">建言標題</label>
            <input id="feedback-title" type="text" value={title} onChange={event => setTitle(event.target.value)} placeholder="例如：關於圖書館開館時間建議..."
              className="w-full p-2.5 border border-gray-300 dark:border-slate-700 rounded-xl bg-gray-50 dark:bg-slate-800 text-gray-800 dark:text-slate-200 dark:placeholder:text-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label htmlFor="feedback-category" className="block text-sm font-semibold text-gray-700 dark:text-slate-300 mb-1">分類</label>
            <select id="feedback-category" value={category} onChange={event => setCategory(event.target.value)}
              className="w-full p-2.5 border border-gray-300 dark:border-slate-700 rounded-xl bg-gray-50 dark:bg-slate-800 text-gray-800 dark:text-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              {PROPOSAL_CATEGORIES.map(option => <option key={option} value={option}>{option}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label htmlFor="feedback-content" className="block text-sm font-semibold text-gray-700 dark:text-slate-300 mb-1">寶貴意見內容</label>
          <textarea id="feedback-content" value={content} onChange={event => setContent(event.target.value)} rows={4} required placeholder="請詳細說明您的想法或建議..."
            className="w-full p-3 border border-gray-300 dark:border-slate-700 rounded-xl bg-gray-50 dark:bg-slate-800 text-gray-800 dark:text-slate-200 dark:placeholder:text-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition" />
        </div>
        <div className="flex flex-wrap gap-2 items-center justify-between pt-2">
          <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-600 dark:text-slate-300">
            <input type="checkbox" checked={isAnonymous} onChange={event => setIsAnonymous(event.target.checked)} className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500" />
            <span>🕵️ 匿名發布（隱藏姓名）</span>
          </label>
          <button type="submit" disabled={mutation.busy} className="px-6 py-2.5 bg-blue-700 hover:bg-blue-800 text-white font-medium rounded-xl text-sm transition shadow-sm disabled:opacity-50">{mutation.busy ? '發送中...' : '送出建言'}</button>
        </div>
      </fieldset>
    </form>
  </div>;
}
