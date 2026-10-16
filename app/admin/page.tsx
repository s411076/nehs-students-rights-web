import { notFound, redirect } from 'next/navigation';
import { AuthorizationError, requireAdmin } from '@/lib/auth/server';
import { createReadOnlyClient } from '@/lib/supabase/server';
import { toFeedbackAdminDTO } from '@/lib/rights/queries';
import { parsePage } from '@/lib/rights/pagination';
import type { FeedbackAdminDTO } from '@/lib/rights/queries';
import type { PageCursor } from '@/lib/rights/pagination';
import AdminFeedbackPanel from '@/components/admin/AdminFeedbackPanel';

export const dynamic = 'force-dynamic';

export default async function AdminPage() {
  const unavailable = <main className="max-w-5xl mx-auto p-6">
    <section className="space-y-4 rounded-xl border border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
      <p role="alert" className="text-gray-800 dark:text-slate-200">服務暫時無法使用，請稍後再試。</p>
      <form action="/admin" method="get">
        <button type="submit" className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500">
          重試
        </button>
      </form>
    </section>
  </main>;
  let result: { readonly ownerId: string; readonly feedback: FeedbackAdminDTO[]; readonly nextCursor: PageCursor | null };
  try {
    const supabase = await createReadOnlyClient();
    const identity = await requireAdmin(supabase);
    const { data, error } = await supabase.rpc('rights_list_admin_feedback', { p_limit: 20, p_cursor: null });
    if (error) return unavailable;
    const page = parsePage(data, toFeedbackAdminDTO);
    if (!page) return unavailable;
    result = { ownerId: identity.id, feedback: page.items, nextCursor: page.nextCursor };
  } catch (error) {
    if (error instanceof AuthorizationError) {
      if (error.status === 401) redirect('/');
      if (error.status === 403) notFound();
    }
    // Server boundary: upstream/configuration failures never disclose raw errors or imply an empty list.
    return unavailable;
  }
  // The matched proxy applies Cache-Control: private, no-store to the final response.
  return <AdminFeedbackPanel key={result.ownerId} {...result} />;
}
