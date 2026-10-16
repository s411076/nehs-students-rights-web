import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { hydrateRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import Navbar from '../../components/Navbar';
import { mockSystemTheme } from '../fixtures/theme';

vi.mock('../../components/AuthProvider', () => ({
  useAuth: () => ({ isLoggedIn: false, isAdmin: false, user: null, generation: 0 }),
  useLogoutNotice: () => ({ logoutError: null, logoutPending: false, beginLogout: vi.fn(), reportLogoutFailure: vi.fn() }),
}));
vi.mock('../../lib/supabase', () => ({ createClient: vi.fn() }));

const storageKey = 'nehs-rights-theme';
let system: ReturnType<typeof mockSystemTheme>;

beforeEach(() => {
  localStorage.removeItem(storageKey);
  document.documentElement.classList.remove('dark');
  system = mockSystemTheme();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.removeItem(storageKey);
  localStorage.removeItem('unrelated-preference');
  document.documentElement.classList.remove('dark', 'unrelated');
});

test.each([false, true])('follows the OS on first visit when system dark is %s', async systemDark => {
  // Given
  system.change(systemDark);
  // When
  render(<Navbar />);
  await act(async () => {});
  // Then: the control is in the visible top bar, not the closed drawer.
  const toggle = within(screen.getByRole('navigation')).getByRole('button', { name: '深色模式' });
  expect(toggle).toBeVisible();
  expect(toggle).toHaveAttribute('aria-pressed', String(systemDark));
  expect(toggle).toHaveClass('min-h-11', 'min-w-11');
  expect(document.documentElement.classList.contains('dark')).toBe(systemDark);
  expect(localStorage.getItem(storageKey)).toBeNull();
});

test.each([
  { systemDark: false, next: 'dark', pressed: true },
  { systemDark: true, next: 'light', pressed: false },
])('switches instantly to $next and stores the explicit override', async ({ systemDark, next, pressed }) => {
  // Given
  system.change(systemDark);
  document.documentElement.classList.add('unrelated');
  localStorage.setItem('unrelated-preference', 'keep');
  render(<Navbar />);
  await act(async () => {});
  // When
  fireEvent.click(screen.getByRole('button', { name: '深色模式' }));
  // Then
  expect(document.documentElement.classList.contains('dark')).toBe(pressed);
  expect(screen.getByRole('button', { name: '深色模式' })).toHaveAttribute('aria-pressed', String(pressed));
  expect(localStorage.getItem(storageKey)).toBe(next);
  expect(document.documentElement).toHaveClass('unrelated');
  expect(localStorage.getItem('unrelated-preference')).toBe('keep');
});

test.each(['light', 'dark'] as const)('restores a toggled %s preference on remount despite the opposite OS theme', async saved => {
  // Given: make an explicit choice opposite to the system, then simulate a reload.
  system.change(saved === 'light');
  const first = render(<Navbar />);
  await act(async () => {});
  fireEvent.click(screen.getByRole('button', { name: '深色模式' }));
  first.unmount();
  document.documentElement.classList.remove('dark');
  // When
  render(<Navbar />);
  await act(async () => {});
  // Then
  expect(document.documentElement.classList.contains('dark')).toBe(saved === 'dark');
  expect(screen.getByRole('button', { name: '深色模式' })).toHaveAttribute('aria-pressed', String(saved === 'dark'));
  expect(localStorage.getItem(storageKey)).toBe(saved);
});

test('updates with system changes while there is no override', async () => {
  // Given
  render(<Navbar />);
  await act(async () => {});
  // When
  act(() => system.change(true));
  // Then
  expect(document.documentElement).toHaveClass('dark');
  expect(screen.getByRole('button', { name: '深色模式' })).toHaveAttribute('aria-pressed', 'true');
  expect(localStorage.getItem(storageKey)).toBeNull();
});

test.each(['light', 'dark'] as const)('does not subscribe to system changes with a stored %s override', saved => {
  // Given
  system.change(saved === 'dark');
  localStorage.setItem(storageKey, saved);
  const subscribe = vi.spyOn(system.query, 'addEventListener');
  render(<Navbar />);
  // When
  act(() => system.change(saved === 'light'));
  // Then
  expect(document.documentElement.classList.contains('dark')).toBe(saved === 'dark');
  expect(subscribe).not.toHaveBeenCalled();
});

test('detaches the system listener after the user overrides the theme', async () => {
  // Given
  const unsubscribe = vi.spyOn(system.query, 'removeEventListener');
  render(<Navbar />);
  await act(async () => {});
  fireEvent.click(screen.getByRole('button', { name: '深色模式' }));
  act(() => system.change(true));
  // When
  act(() => system.change(false));
  // Then
  expect(document.documentElement).toHaveClass('dark');
  expect(screen.getByRole('button', { name: '深色模式' })).toHaveAttribute('aria-pressed', 'true');
  expect(unsubscribe).toHaveBeenCalledWith('change', expect.any(Function));
});

test('releases the system listener on unmount', () => {
  // Given
  const unsubscribe = vi.spyOn(system.query, 'removeEventListener');
  const view = render(<Navbar />);
  // When
  view.unmount();
  // Then
  expect(unsubscribe).toHaveBeenCalledWith('change', expect.any(Function));
});

test('keeps the explicit session theme when persistence is blocked', async () => {
  // Given
  render(<Navbar />);
  await act(async () => {});
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('Storage full', 'QuotaExceededError'); });
  // When
  fireEvent.click(screen.getByRole('button', { name: '深色模式' }));
  // Then
  expect(document.documentElement).toHaveClass('dark');
  expect(screen.getByRole('button', { name: '深色模式' })).toHaveAttribute('aria-pressed', 'true');
});

test('hydrates deterministic server markup before exposing the effective dark state', async () => {
  // Given: the pre-paint initializer has selected dark without changing navbar markup.
  system.change(true);
  const container = document.createElement('div');
  container.innerHTML = renderToString(<Navbar />);
  document.body.append(container);
  document.documentElement.classList.add('dark');
  const toggle = within(container).getByRole('button', { name: '深色模式' });
  expect(toggle).toBeDisabled();
  const recover = vi.fn();
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  let root: Root | undefined;
  try {
    // When
    await act(async () => { root = hydrateRoot(container, <Navbar />, { onRecoverableError: recover }); });
    // Then
    expect(recover).not.toHaveBeenCalled();
    expect(consoleError).not.toHaveBeenCalled();
    expect(toggle).toBeEnabled();
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    expect(localStorage.getItem(storageKey)).toBeNull();
  } finally {
    act(() => root?.unmount());
    container.remove();
  }
});
