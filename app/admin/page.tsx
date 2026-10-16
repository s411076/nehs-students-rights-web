import { notFound, redirect } from 'next/navigation';
import { AuthorizationError, requireAdmin } from '@/lib/auth/server';
import { createReadOnlyClient } from '@/lib/supabase/server';
import { FEEDBACK_SELECT_STRING, toFeedbackAdminDTO } from '@/lib/rights/queries';
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
  let result;
  try {
    const supabase = await createReadOnlyClient();
    const identity = await requireAdmin(supabase);
    const { data, error } = await supabase.from('feedback').select(FEEDBACK_SELECT_STRING)
      .order('created_at', { ascending: false }).overrideTypes<unknown[], { merge: false }>();
    if (error || !Array.isArray(data)) return unavailable;
    const feedback = data.map(toFeedbackAdminDTO);
    if (feedback.some(row => row === null)) return unavailable;
    result = { ownerId: identity.id, feedback: feedback.filter(row => row !== null) };
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
