"use client";

import { useAuth } from "@/components/AuthProvider";
import Link from "next/link";

function Shell({ children }: { readonly children: React.ReactNode }) {
  return (
    <main className="max-w-4xl mx-auto p-4 md:p-6 space-y-6">
      <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-gray-200 dark:border-slate-800 shadow-sm space-y-3">
        <h1 className="text-xl font-bold text-gray-800 dark:text-slate-200 flex items-center gap-2">
          👤 個人帳號資訊
        </h1>
        {children}
      </div>
    </main>
  );
}

export default function ProfilePage() {
  const auth = useAuth();

  if (auth.status === "loading") {
    return (
      <Shell>
        <p className="text-sm text-gray-500 dark:text-slate-400">登入狀態確認中，請稍候……</p>
      </Shell>
    );
  }

  if (auth.status === "anonymous") {
    return (
      <Shell>
        <p className="text-sm text-gray-700 dark:text-slate-300">您尚未登入，請先以學校帳號登入後再查看個人資訊。</p>
        <Link href="/" className="inline-flex min-h-11 items-center text-sm font-bold text-blue-600 dark:text-blue-400 underline">
          回首頁重新登入
        </Link>
      </Shell>
    );
  }

  if (auth.status === "ineligible") {
    return (
      <Shell>
        <p className="text-sm text-gray-700 dark:text-slate-300">
          此帳號不符合學校信箱資格，無法使用個人資訊功能。公開頁面仍可正常瀏覽。
        </p>
        <Link href="/" className="inline-flex min-h-11 items-center text-sm font-bold text-blue-600 dark:text-blue-400 underline">
          回首頁
        </Link>
      </Shell>
    );
  }

  if (auth.status === "unavailable") {
    return (
      <Shell>
        <p className="text-sm text-gray-700 dark:text-slate-300">
          目前無法確認登入狀態，請稍後再試。為保護您的帳號，在確認完成前不會顯示個人資訊。
        </p>
        <Link href="/" className="inline-flex min-h-11 items-center text-sm font-bold text-blue-600 dark:text-blue-400 underline">
          回首頁
        </Link>
      </Shell>
    );
  }

  // Verified only: identity comes from the server-verified provider.
  // Rendered directly from useAuth with no retained local copy, so an
  // account switch or logout clears the prior identity immediately
  // (the provider also remounts children on generation change).
  // No proposal queries run here at all: durable ownership is unavailable
  // until author UUIDs are supported, so nothing is claimed by name/email.
  // The explicit null check (not just the status discriminant) keeps the
  // page fail-closed if the provider shape ever drifts.
  if (auth.identity === null) {
    return (
      <Shell>
        <p className="text-sm text-gray-700 dark:text-slate-300">
          目前無法確認登入狀態，請稍後再試。為保護您的帳號，在確認完成前不會顯示個人資訊。
        </p>
        <Link href="/" className="inline-flex min-h-11 items-center text-sm font-bold text-blue-600 dark:text-blue-400 underline">
          回首頁
        </Link>
      </Shell>
    );
  }
  const { displayName, email } = auth.identity;

  return (
    <main className="max-w-4xl mx-auto p-4 md:p-6 space-y-6">
      <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-gray-200 dark:border-slate-800 shadow-sm space-y-3">
        <h1 className="text-xl font-bold text-gray-800 dark:text-slate-200 flex items-center gap-2">
          👤 個人帳號資訊
        </h1>
        <div className="text-sm text-gray-700 dark:text-slate-300 space-y-1">
          <p><span className="font-semibold">名稱：</span>{displayName}</p>
          <p className="break-all"><span className="font-semibold">電子郵件：</span>{email}</p>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-gray-200 dark:border-slate-800 shadow-sm space-y-4">
        <h2 className="text-lg font-bold text-gray-800 dark:text-slate-200 flex items-center gap-2">
          📝 我發表的提案
        </h2>
        <p
          data-testid="profile-ownership-unavailable"
          className="text-sm text-gray-500 dark:text-slate-400 leading-relaxed"
        >
          目前無法可靠列出本人提案：提案僅以顯示名稱記載作者，沒有穩定的作者識別碼，無法以姓名或信箱準確比對，相似名稱也可能是其他同學。因此在作者 UUID
          支援之前，不會以姓名或信箱比對來認領提案。
        </p>
      </div>
    </main>
  );
}
