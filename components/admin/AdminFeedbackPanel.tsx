'use client';

import { useMemo, useState } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { toFeedbackAdminDTO } from '@/lib/rights/queries';
import type { FeedbackAdminDTO } from '@/lib/rights/queries';
import type { PageCursor } from '@/lib/rights/pagination';
import { useRightsPage } from '@/components/rights/useRightsPage';
import { PageContinuation } from '@/components/rights/PageContinuation';
import { AdminFeedbackRow } from './AdminFeedbackRow';
import { RightsDraftProvider, useForgetItemDrafts } from '@/components/rights/RightsDraftProvider';

type PanelProps = {
  readonly ownerId: string;
  readonly feedback: readonly FeedbackAdminDTO[];
  readonly nextCursor: PageCursor | null;
};

export default function AdminFeedbackPanel(props: PanelProps) {
  const auth = useAuth();
  if (auth.status !== 'verified' || auth.identity.id !== props.ownerId || !auth.identity.isAdmin) {
    return <main className="max-w-5xl mx-auto p-6"><p role="status" className="text-gray-600 dark:text-slate-300">正在確認管理工作階段，或已無法存取。</p></main>;
  }
  return <RightsDraftProvider><FeedbackEditor key={`${props.ownerId}:${auth.generation}`} {...props} /></RightsDraftProvider>;
}

function FeedbackEditor({ feedback, nextCursor }: PanelProps) {
  const initialPage = useMemo(() => ({ items: [...feedback], nextCursor }), [feedback, nextCursor]);
  const list = useRightsPage('/api/rights/admin/feedback', toFeedbackAdminDTO, { initialPage });
  const forgetDrafts = useForgetItemDrafts();
  const [blocked, setBlocked] = useState(false);
  return <main className="max-w-5xl mx-auto p-4 md:p-6 space-y-6">
    <header className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-gray-100 dark:border-slate-800 shadow-sm">
      <h1 className="text-2xl font-bold text-gray-800 dark:text-slate-200">竹科實中學權組 - 後台管理</h1>
      <p className="text-gray-600 dark:text-slate-400 text-sm">管理同學們提交的建言並進行官方回覆</p>
    </header>
    {blocked ? <p role="status" className="text-gray-800 dark:text-slate-200">目前已無法存取，請重新驗證管理員身分。</p> : <section className="space-y-4" aria-label="建言列表與學權組回覆管理">
      {list.status === 'error' && <p role="alert" className="text-red-700 dark:text-red-400">建言清單載入失敗；目前內容與草稿已保留。</p>}
      <button type="button" onClick={() => void list.refresh()} disabled={list.status === 'loading'}
        className="min-h-11 text-sm font-semibold underline text-blue-700 dark:text-blue-300 rounded focus-visible:ring-2 focus-visible:ring-blue-500">重新載入建言清單</button>
      {list.status === 'ready' && list.items.length === 0 && <p className="text-gray-600 dark:text-slate-400 text-center py-8 bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-800">目前沒有收到建言。</p>}
      {list.items.map(item => <AdminFeedbackRow key={item.id} item={item} refresh={list.refresh} onDeleted={id => { list.remove(id); forgetDrafts('feedback', id); }} onDenied={() => setBlocked(true)} />)}
      <PageContinuation hasMore={list.nextCursor !== null} loading={list.status === 'loading'} onLoadMore={list.loadMore} label="載入更多管理建言" />
    </section>}
  </main>;
}
