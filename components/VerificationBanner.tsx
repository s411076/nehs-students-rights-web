'use client';

import { useVerification } from './VerificationContext';
import { ui } from './rights/ui';

export function VerificationBanner({ hasIdentity }: { readonly hasIdentity: boolean }) {
  const { status, retry } = useVerification();
  let message: string;
  switch (status) {
    case 'ready': return null;
    case 'checking':
      if (!hasIdentity) return null;
      message = '正在重新驗證登入狀態。草稿已保留，仍可繼續編輯；送出、儲存與作者查詢暫停。';
      break;
    case 'unavailable':
      message = hasIdentity
        ? '暫時無法驗證登入狀態。草稿已保留，仍可繼續編輯；送出、儲存與作者查詢暫停。請檢查網路後重試。'
        : '暫時無法驗證登入狀態，尚未開放登入後操作。請檢查網路後重試。';
      break;
    default: return assertNever(status);
  }
  return <div className="mx-auto max-w-4xl p-4">
    <div className={`${ui.card} flex flex-wrap items-center justify-between gap-3 p-4`}>
      <p role="status" aria-live="polite" aria-atomic="true" className="min-w-0 flex-1 text-sm text-foreground">{message}</p>
      <button type="button" onClick={retry} disabled={status === 'checking'} className={ui.secondaryButton}>
        {status === 'checking' ? '驗證中…' : '重新驗證登入狀態'}
      </button>
    </div>
  </div>;
}
function assertNever(value: never): never { throw new TypeError(`Unknown verification status: ${value}`); }
