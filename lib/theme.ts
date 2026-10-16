export type Theme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'nehs-rights-theme';
export const THEME_MEDIA_QUERY = '(prefers-color-scheme: dark)';

// Keep this function self-contained: its source also runs in the pre-paint script.
export function initializeTheme(storageKey: string, mediaQuery: string): {
  readonly theme: Theme;
  readonly preference: Theme | null;
} {
  let preference: Theme | null = null;
  try {
    const stored = window.localStorage.getItem(storageKey);
    if (stored === 'light' || stored === 'dark') preference = stored;
  } catch (error) {
    if (!(error instanceof DOMException && error.name === 'SecurityError')) throw error;
  }
  const theme = preference ?? (window.matchMedia(mediaQuery).matches ? 'dark' : 'light');
  document.documentElement.classList.toggle('dark', theme === 'dark');
  return { theme, preference };
}

export const THEME_INIT_SCRIPT = `(${initializeTheme.toString()})(${JSON.stringify(THEME_STORAGE_KEY)},${JSON.stringify(THEME_MEDIA_QUERY)});`;
