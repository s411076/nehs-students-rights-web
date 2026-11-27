import { ui } from './ui';

export function ActionFeedback({ error, guidance, notice, announce = true }: {
  readonly error: string;
  readonly guidance: string;
  readonly notice: string;
  readonly announce?: boolean;
}) {
  return <>
    {(announce || guidance) && <p role={announce ? 'status' : undefined} className={guidance ? ui.guidance : 'sr-only'}>{guidance}</p>}
    {error && <p role="alert" aria-live={announce ? undefined : 'off'} className="p-3 rounded-xl bg-red-50 dark:bg-red-950/50 text-red-700 dark:text-red-400 text-sm">{error}</p>}
    {notice && <p role="status" className="text-sm text-gray-800 dark:text-neutral-200">{notice}</p>}
  </>;
}
