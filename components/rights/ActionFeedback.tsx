export function ActionFeedback({ error, notice }: { readonly error: string; readonly notice: string }) {
  return <>
    {error && <p role="alert" className="p-3 rounded-xl bg-red-50 dark:bg-red-950/50 text-red-700 dark:text-red-400 text-sm">{error}</p>}
    {notice && <p role="status" className="text-sm text-gray-800 dark:text-slate-200">{notice}</p>}
  </>;
}
