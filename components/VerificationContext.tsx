'use client';

import { createContext, useContext } from 'react';

export type VerificationState = {
  readonly status: 'ready' | 'checking' | 'unavailable';
  readonly epoch: number;
};
export type VerificationContextValue = VerificationState & {
  readonly canWrite: boolean;
  readonly retry: () => void;
  readonly isCurrent: (epoch: number) => boolean;
};

// Isolated component tests supply identity mocks; the real AuthProvider always overrides readiness.
export const VerificationContext = createContext<VerificationContextValue>({
  status: 'ready', epoch: 0, canWrite: true, retry: () => {}, isCurrent: () => true,
});
export function useVerification() { return useContext(VerificationContext); }

export const VERIFICATION_PAUSED_MESSAGE = '登入狀態尚待驗證，草稿已保留，仍可繼續編輯。請重新驗證後再手動送出；系統不會自動重送。';
