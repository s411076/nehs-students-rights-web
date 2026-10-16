'use client';

import { useState } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { useRightsMutation } from '@/components/rights/useRightsMutation';
import { ActionFeedback } from '@/components/rights/ActionFeedback';
import { PROPOSAL_CATEGORIES } from '@/lib/rights/contracts';

export function ProposalComposer({ refresh }: { readonly refresh: () => Promise<unknown> }) {
  const auth = useAuth();
  const mutation = useRightsMutation();
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [category, setCategory] = useState('環境與設備');
  if (!auth.isLoggedIn) return <div className="p-3.5 bg-gray-100/90 dark:bg-slate-800/80 rounded-2xl text-center text-sm font-semibold text-gray-500 dark:text-slate-400 shadow-sm flex items-center justify-center gap-1.5 border border-gray-200/50 dark:border-slate-700">🔒 請登入後即可發起提案</div>;
  return <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-gray-200 dark:border-slate-800 shadow-sm space-y-4">
    <ActionFeedback error={mutation.error} notice={mutation.notice} />
    <form onSubmit={event => {
      event.preventDefault();
      void mutation.run({ action: 'createProposal', payload: { title, content, category } }, refresh).then(result => {
        if (!result?.ok) return;
        setTitle(''); setContent('');
        window.alert('學權組已收到你的提案！提案將由學權組審核，核可後才會公開發布。');
      });
    }} className="space-y-4">
      <fieldset disabled={mutation.busy} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="sm:col-span-2">
            <label htmlFor="proposal-title" className="block text-sm font-semibold text-gray-700 dark:text-slate-300 mb-1">提案標題</label>
            <input id="proposal-title" type="text" value={title} onChange={event => setTitle(event.target.value)} required
              placeholder="例如：關於圖書館開館時間建議..."
              className="w-full p-2.5 border border-gray-300 dark:border-slate-700 rounded-xl bg-gray-50 dark:bg-slate-800 text-gray-800 dark:text-slate-200 dark:placeholder:text-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label htmlFor="proposal-category" className="block text-sm font-semibold text-gray-700 dark:text-slate-300 mb-1">分類</label>
            <select id="proposal-category" value={category} onChange={event => setCategory(event.target.value)}
              className="w-full p-2.5 border border-gray-300 dark:border-slate-700 rounded-xl bg-gray-50 dark:bg-slate-800 text-gray-800 dark:text-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              {PROPOSAL_CATEGORIES.map(option => <option key={option} value={option}>{option}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label htmlFor="proposal-content" className="block text-sm font-semibold text-gray-700 dark:text-slate-300 mb-1">寶貴意見內容</label>
          <textarea id="proposal-content" value={content} onChange={event => setContent(event.target.value)} rows={4} required
            placeholder="請詳細說明您的想法或建議..."
            className="w-full p-3 border border-gray-300 dark:border-slate-700 rounded-xl bg-gray-50 dark:bg-slate-800 text-gray-800 dark:text-slate-200 dark:placeholder:text-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition" />
        </div>
        <div className="flex items-center justify-end pt-2">
          <button type="submit" className="px-6 py-2.5 bg-blue-700 hover:bg-blue-800 text-white font-medium rounded-xl text-sm transition shadow-sm disabled:opacity-50">
            {mutation.busy ? '發送中...' : '送出提案'}
          </button>
        </div>
      </fieldset>
    </form>
  </div>;
}
