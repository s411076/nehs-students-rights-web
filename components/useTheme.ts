'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import { initializeTheme, THEME_MEDIA_QUERY, THEME_STORAGE_KEY } from '@/lib/theme';
import type { Theme } from '@/lib/theme';

export function useTheme() {
  const [theme, setTheme] = useState<Theme | null>(null);
  const stopFollowingSystem = useRef<(() => void) | null>(null);

  useLayoutEffect(() => {
    const initial = initializeTheme(THEME_STORAGE_KEY, THEME_MEDIA_QUERY);
    // Deferred off the commit phase: a synchronous setState here trips react-hooks/set-state-in-effect.
    queueMicrotask(() => setTheme(initial.theme));
    if (initial.preference !== null) return;

    const media = window.matchMedia(THEME_MEDIA_QUERY);
    const followSystem = () => {
      document.documentElement.classList.toggle('dark', media.matches);
      setTheme(media.matches ? 'dark' : 'light');
    };
    media.addEventListener('change', followSystem);
    const unsubscribe = () => media.removeEventListener('change', followSystem);
    stopFollowingSystem.current = unsubscribe;
    return () => {
      unsubscribe();
      stopFollowingSystem.current = null;
    };
  }, []);

  const toggleTheme = () => {
    if (theme === null) return;
    const next = theme === 'dark' ? 'light' : 'dark';
    stopFollowingSystem.current?.();
    stopFollowingSystem.current = null;
    document.documentElement.classList.toggle('dark', next === 'dark');
    setTheme(next);
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch (error) {
      if (!(error instanceof DOMException && (error.name === 'SecurityError' || error.name === 'QuotaExceededError'))) throw error;
    }
  };

  return { theme, toggleTheme };
}
