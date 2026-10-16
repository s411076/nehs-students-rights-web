'use client';

import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { readRights } from '@/lib/rights/client';
import { toAuthorDTO } from '@/lib/rights/queries';
import type { AuthorDTO } from '@/lib/rights/queries';

type AuthorTarget = { readonly kind: 'proposal' | 'feedback' | 'comment'; readonly id: string };

export function AuthorReveal(props: AuthorTarget) {
  const auth = useAuth();
  if (auth.status !== 'verified' || !auth.identity.isAdmin) return null;
  return <AuthorLookup key={`${auth.generation}:${auth.identity.id}:${props.kind}:${props.id}`} {...props} />;
}

function AuthorLookup({ kind, id }: AuthorTarget) {
  const [author, setAuthor] = useState<AuthorDTO | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const active = useRef(true);
  const flight = useRef(false);
  useEffect(() => {
    active.current = true;
    return () => { active.current = false; };
  }, []);
  const reveal = async () => {
    if (flight.current) return;
    flight.current = true; setBusy(true); setError('');
    const result = await readRights(`/api/rights/authors?${new URLSearchParams({ kind, id })}`, value => {
      const parsed = toAuthorDTO(value);
      if (!parsed) throw new TypeError('Invalid author attribution');
      return parsed;
    });
    if (!active.current) return;
    flight.current = false; setBusy(false);
    if (result.ok) setAuthor(result.data);
    else setError('無法查看作者。請確認管理員權限後再試。');
  };
  return <div className="space-y-2 text-sm text-gray-700 dark:text-slate-300">
    <button type="button" disabled={busy} aria-expanded={author !== null}
      onClick={() => author ? setAuthor(null) : void reveal()}
      className="min-h-11 px-3 py-2 rounded-lg bg-gray-100 dark:bg-slate-800 font-semibold hover:bg-gray-200 dark:hover:bg-slate-700 focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-60">
      {busy ? '作者資料載入中…' : author ? '隱藏作者資料' : '查看作者（僅管理員）'}
    </button>
    {error && <p role="alert">{error}</p>}
    {author && <div className="p-3 rounded-xl bg-gray-50 dark:bg-slate-800 space-y-1 break-words">
      <p className="font-semibold">管理員專用作者資料（不會顯示於公開作者欄位）</p>
      <Attribution author={author} />
    </div>}
  </div>;
}

function Attribution({ author }: { readonly author: AuthorDTO }) {
  switch (author.attribution) {
    case 'known': return <dl className="space-y-1">
      <div><dt className="inline font-semibold">姓名：</dt><dd className="inline">{author.display_name ?? '未提供'}</dd></div>
      <div><dt className="inline font-semibold">信箱：</dt><dd className="inline break-all">{author.email ?? '未提供'}</dd></div>
      <div><dt className="inline font-semibold">使用者識別碼：</dt><dd className="inline break-all">{author.user_id ?? '未提供'}</dd></div>
    </dl>;
    case 'legacy_unverified': return <p>歷史作者未經驗證，無法可靠還原身分。</p>;
    case 'unknown': return <p>作者不明，無法還原身分。</p>;
    default: return assertNever(author.attribution);
  }
}
function assertNever(value: never): never { throw new TypeError(`Unknown attribution: ${value}`); }
