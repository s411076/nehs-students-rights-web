const surface = 'bg-surface';
const border = 'border-neutral-200 dark:border-neutral-800';
const focus = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-surface';
const button = `inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold ${focus} disabled:cursor-not-allowed disabled:opacity-50`;

export const ui = {
  surface,
  border,
  card: `${surface} rounded-2xl border ${border} shadow-sm`,
  inset: 'rounded-xl bg-neutral-50 dark:bg-neutral-800/50',
  primaryButton: `${button} bg-primary text-primary-foreground hover:bg-blue-800 active:bg-blue-900 dark:hover:bg-blue-300 dark:active:bg-blue-500`,
  secondaryButton: `${button} border ${border} bg-neutral-100 text-neutral-700 hover:bg-neutral-200 active:bg-neutral-300 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700 dark:active:bg-neutral-600`,
  dangerButton: `${button} border border-danger/50 bg-transparent text-danger hover:bg-danger hover:text-danger-foreground active:bg-danger active:text-danger-foreground`,
  iconButton: `inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-xl text-neutral-700 hover:bg-neutral-100 active:bg-neutral-200 dark:text-neutral-200 dark:hover:bg-neutral-800 dark:active:bg-neutral-700 ${focus} disabled:cursor-not-allowed disabled:opacity-50`,
  badge: 'inline-flex items-center gap-1.5 rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-semibold text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300',
  field: 'w-full min-w-0 rounded-xl border border-neutral-300 bg-neutral-50 p-3 text-sm text-gray-800 placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200 dark:placeholder:text-neutral-400',
} as const;
