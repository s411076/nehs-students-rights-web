import { vi } from 'vitest';

export function mockSystemTheme(initialDark = false) {
  let matches = initialDark;
  const events = new EventTarget();
  const query: MediaQueryList = {
    get matches() { return matches; },
    media: '(prefers-color-scheme: dark)',
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: events.addEventListener.bind(events),
    removeEventListener: events.removeEventListener.bind(events),
    dispatchEvent: events.dispatchEvent.bind(events),
  };
  vi.stubGlobal('matchMedia', vi.fn(() => query));
  return {
    query,
    change(dark: boolean) {
      matches = dark;
      events.dispatchEvent(Object.assign(new Event('change'), { matches, media: query.media }));
    },
  };
}
