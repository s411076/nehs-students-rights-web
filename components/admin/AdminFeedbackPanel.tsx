'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';
import { createRightsActionFlight } from '@/lib/rights/client';
import type { RightsActionRequest } from '@/lib/rights/contracts';
import type { FeedbackAdminDTO } from '@/lib/rights/queries';

type PanelProps = { readonly ownerId: string; readonly feedback: readonly FeedbackAdminDTO[] };

export default function AdminFeedbackPanel(props: PanelProps) {
  const auth = useAuth();
  // This hides stale server props during account changes; only the server gate authorizes reads/writes.
  if (auth.status !== 'verified' || auth.identity.id !== props.ownerId || !auth.identity.isAdmin) {
    return <main className="max-w-5xl mx-auto p-6"><p role="status" className="text-gray-600 dark:text-slate-300">正在確認管理工作階段，或已無法存取。</p></main>;
  }
  return <FeedbackEditor key={`${props.ownerId}:${auth.generation}`} {...props} />;
}

function FeedbackEditor({ feedback }: PanelProps) {
  const router = useRouter();
  const [replies, setReplies] = useState<Record<string, string>>(() => Object.fromEntries(feedback.map(row => [row.id, row.reply])));
  const [saved, setSaved] = useState<Record<string, string>>(() => Object.fromEntries(feedback.map(row => [row.id, row.reply])));
  const [deleted, setDeleted] = useState<readonly string[]>([]);
  const [busy, setBusy] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [message, setMessage] = useState('');
  const [flight] = useState(createRightsActionFlight);
  const active = useRef(true);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);

  async function mutate(request: RightsActionRequest) {
    if (busy) return;
    setBusy(true); setMessage('');
    const result = await flight(request, async () => { if (active.current) router.refresh(); });
    if (!active.current) return;
    setBusy(false);
    if (!result.ok) {
      if (result.code === 'UNAUTHORIZED' || result.code === 'FORBIDDEN') setBlocked(true);
      setMessage(result.message);
      return;
    }
    if (request.action === 'saveFeedbackReply') setSaved(current => ({ ...current, [request.payload.id]: request.payload.reply }));
    if (request.action === 'deleteFeedback') setDeleted(current => [...current, request.payload.id]);
    setMessage(result.message ?? '操作已成功完成。');
  }

  function save(item: FeedbackAdminDTO) {
    const reply = replies[item.id] ?? '';
    if ((saved[item.id] ?? item.reply).trim() && !reply.trim() && !window.confirm('確定要清除現有的官方回覆嗎？')) return;
    void mutate({ action: 'saveFeedbackReply', payload: { id: item.id, reply } });
  }

  const rows = feedback.filter(item => !deleted.includes(item.id));
  return <main className="max-w-5xl mx-auto p-4 md:p-6 space-y-6">
    <header className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-gray-100 dark:border-slate-800 shadow-sm">
      <h1 className="text-2xl font-bold text-gray-800 dark:text-slate-200">竹科實中學權組 - 後台管理</h1>
      <p className="text-gray-600 dark:text-slate-400 text-sm">管理同學們提交的建言並進行官方回覆</p>
    </header>
    {message && <p role="status" className="text-gray-800 dark:text-slate-200">{message}</p>}
    {!blocked && <section className="space-y-4" aria-label="建言列表與學權組回覆管理">
      {rows.length === 0 ? <p className="text-gray-600 dark:text-slate-400 text-center py-8 bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-800">目前沒有收到建言。</p> : rows.map(item =>
        <article key={item.id} className="p-5 bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-800 shadow-sm space-y-4">
          <div className="text-sm text-gray-600 dark:text-slate-400">{item.category} · {item.created_at}</div>
          <h2 className="font-bold text-gray-800 dark:text-slate-200">{item.title}</h2>
          <p className="text-gray-800 dark:text-slate-300 whitespace-pre-line">{item.content}</p>
          <p className="text-sm text-gray-600 dark:text-slate-400">發布者：{item.author_name || '匿名同學'}</p>
          <label htmlFor={`reply-${item.id}`} className="block text-sm font-bold text-blue-900 dark:text-blue-300">官方回覆</label>
          <textarea id={`reply-${item.id}`} value={replies[item.id] ?? ''} rows={3} disabled={busy}
            onChange={event => setReplies(current => ({ ...current, [item.id]: event.target.value }))}
            className="w-full p-3 border border-gray-300 dark:border-slate-700 rounded-lg bg-gray-50 dark:bg-slate-800 text-gray-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          <div className="flex flex-wrap justify-end gap-3">
            <button type="button" disabled={busy} onClick={() => {
              if (window.confirm('確定要刪除此建言嗎？')) void mutate({ action: 'deleteFeedback', payload: { id: item.id } });
            }} className="px-4 py-2 rounded-lg border border-gray-300 dark:border-slate-700 text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/50 disabled:opacity-50">刪除建言</button>
            <button type="button" disabled={busy} onClick={() => save(item)}
              className="px-4 py-2 rounded-lg bg-blue-600 text-white disabled:opacity-50">{busy ? '處理中…' : '發布/更新回覆'}</button>
          </div>
        </article>)}
    </section>}
  </main>;
}
