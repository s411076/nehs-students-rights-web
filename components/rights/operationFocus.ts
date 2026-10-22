import type { FocusRecovery } from './operationStore';

export function captureOperationFocus(signal: AbortSignal): FocusRecovery {
  const focused = document.activeElement;
  const row = focused?.closest('[data-rights-row]');
  if (!row) return () => {};
  const events = new AbortController();
  let moved = false;
  const observe = (event: Event) => {
    if (event.target instanceof Node && event.target !== document.body && !row.contains(event.target)) moved = true;
  };
  document.addEventListener('focusin', observe, { signal: events.signal });
  document.addEventListener('pointerdown', observe, { signal: events.signal });
  signal.addEventListener('abort', () => events.abort(), { once: true, signal: events.signal });
  return target => {
    events.abort();
    if (signal.aborted || moved || row.isConnected || document.activeElement !== document.body) return;
    target?.focus();
  };
}
