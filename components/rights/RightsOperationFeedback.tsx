'use client';

import { useLayoutEffect, useRef } from 'react';
import { useDraftSlot } from './draftStore';
import { useRightsOperationOwner } from './RightsDraftProvider';
import type { OperationStore } from './operationStore';
import { ui } from './ui';

export function RightsOperationFeedback() {
  const owner = useRightsOperationOwner();
  return owner ? <OperationFeedback owner={owner} /> : null;
}

function OperationFeedback({ owner }: { readonly owner: OperationStore }) {
  const { snapshot } = useDraftSlot(owner.announcements, 'latest');
  const target = useRef<HTMLParagraphElement>(null);
  useLayoutEffect(() => { snapshot?.recoverFocus?.(target.current); }, [snapshot]);
  const state = snapshot?.state;
  const message = state?.busy ? '處理中…' : state?.error || state?.notice;
  return <div aria-live="polite" aria-atomic="true" className={message ? `${ui.card} p-3` : 'contents'}>
    {message && <p ref={target} role="status" aria-label="清單操作結果" tabIndex={-1}
      className={`text-sm wrap-anywhere rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${state?.error ? 'text-danger' : 'text-foreground'}`}>
      {snapshot?.label}：{message}
    </p>}
  </div>;
}
