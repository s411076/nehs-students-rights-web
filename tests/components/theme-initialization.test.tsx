import { runInNewContext } from 'node:vm';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import RootLayout from '../../app/layout';
import { mockSystemTheme } from '../fixtures/theme';

vi.mock('next/font/google', () => ({
  Inter: () => ({ className: 'fixture-font', variable: 'fixture-inter-variable' }),
  Noto_Sans_TC: () => ({ variable: 'fixture-noto-sans-tc-variable' }),
}));
vi.mock('../../components/Navbar', () => ({ default: () => null }));
vi.mock('../../components/AuthProvider', () => ({ AuthProvider: ({ children }: { readonly children: ReactNode }) => children }));

const storageKey = 'nehs-rights-theme';

function initializeBeforePaint() {
  const markup = renderToStaticMarkup(<RootLayout><main>Fixture content</main></RootLayout>);
  const parsed = new DOMParser().parseFromString(markup, 'text/html');
  const script = parsed.head.querySelector('script#nehs-rights-theme-init');
  if (!script?.textContent) throw new Error('Missing synchronous theme initialization in the root head');
  expect(script.hasAttribute('src')).toBe(false);
  expect(script.hasAttribute('async')).toBe(false);
  expect(script.hasAttribute('defer')).toBe(false);
  runInNewContext(script.textContent, { window, document, DOMException });
}

beforeEach(() => {
  localStorage.removeItem(storageKey);
  document.documentElement.classList.remove('dark');
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.removeItem(storageKey);
  document.documentElement.classList.remove('dark');
});

test.each([
  { saved: null, systemDark: false, expectedDark: false },
  { saved: null, systemDark: true, expectedDark: true },
  { saved: 'light', systemDark: true, expectedDark: false },
  { saved: 'dark', systemDark: false, expectedDark: true },
  { saved: 'invalid', systemDark: true, expectedDark: true },
])('initializes before hydration with saved=$saved and systemDark=$systemDark', ({ saved, systemDark, expectedDark }) => {
  // Given
  mockSystemTheme(systemDark);
  if (saved !== null) localStorage.setItem(storageKey, saved);
  // When
  initializeBeforePaint();
  // Then
  expect(document.documentElement.classList.contains('dark')).toBe(expectedDark);
  expect(localStorage.getItem(storageKey)).toBe(saved);
});

test('falls back to the OS before paint when storage access is denied', () => {
  // Given
  mockSystemTheme(true);
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new DOMException('Blocked storage', 'SecurityError'); });
  // When
  initializeBeforePaint();
  // Then
  expect(document.documentElement).toHaveClass('dark');
});
