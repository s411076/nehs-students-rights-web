'use client';

import { useEffect, useRef, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import { useVerification } from '@/components/VerificationContext';
import { readRights } from '@/lib/rights/client';
import { toAuthorDTO } from '@/lib/rights/queries';
import type { AuthorDTO } from '@/lib/rights/queries';
import { ui } from '@/components/rights/ui';

type AuthorTarget = { readonly kind: 'proposal' | 'feedback' | 'comment'; readonly id: string };

export function AuthorReveal(props: AuthorTarget) {
  const auth = useAuth();
  const { epoch } = useVerification();
  if (auth.status !== 'verified' || !auth.identity.isAdmin) return null;
  return <AuthorLookup key={`${auth.generation}:${auth.identity.id}:${epoch}:${props.kind}:${props.id}`} {...props} />;
}

function AuthorLookup({ kind, id }: AuthorTarget) {
  const verification = useVerification();
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
    if (flight.current || !verification.isCurrent(verification.epoch)) return;
    flight.current = true; setBusy(true); setError('');
    const result = await readRights(`/api/rights/authors?${new URLSearchParams({ kind, id })}`, value => {
      const parsed = toAuthorDTO(value);
      if (!parsed) throw new TypeError('Invalid author attribution');
      return parsed;
    });
    if (!active.current || !verification.isCurrent(verification.epoch)) return;
    flight.current = false; setBusy(false);
    if (result.ok) setAuthor(result.data);
    else setError('無法查看作者。請確認管理員權限後再試。');
  };
  return <div className="space-y-2 text-sm text-gray-700 dark:text-neutral-300">
    <button type="button" disabled={busy || !verification.canWrite} aria-expanded={author !== null && verification.canWrite}
      onClick={() => author ? setAuthor(null) : void reveal()}
      className={ui.secondaryButton}>
      <ShieldCheck aria-hidden="true" className="size-4 shrink-0" />
      {busy ? '作者資料載入中…' : author ? '隱藏作者資料' : '查看作者（僅管理員）'}
    </button>
    {verification.canWrite && error && <p role="alert">{error}</p>}
    {verification.canWrite && author && <div className={`${ui.inset} p-3 space-y-1 break-words`}>
      <p className="font-semibold flex items-center gap-1.5"><ShieldCheck aria-hidden="true" className="size-4 shrink-0" />管理員專用作者資料（不會顯示於公開作者欄位）</p>
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
