/**
 * Verified identity / role types shared by server guards and UI.
 * Pure helpers only — no SDK imports so unit tests stay dependency-free.
 */

export const SCHOOL_EMAIL_DOMAIN = 'nehs.hc.edu.tw';

export type IdentityRole = 'student' | 'admin';

export interface VerifiedIdentity {
  id: string;
  email: string;
  displayName: string;
}

export interface SessionIdentity extends VerifiedIdentity {
  isAdmin: boolean;
}

export function normalizeEmail(email: unknown): string {
  if (typeof email !== 'string') return '';
  return email.trim().toLowerCase();
}

export function getEmailDomain(email: unknown): string {
  const normalized = normalizeEmail(email);
  const at = normalized.lastIndexOf('@');
  if (at <= 0 || at === normalized.length - 1) return '';
  return normalized.slice(at + 1);
}

/**
 * Exact-domain match only. Suffix matching would wrongly admit
 * `user@nehs.hc.edu.tw.evil.test`, so compare the full domain.
 */
export function isSchoolEmail(email: unknown): boolean {
  return getEmailDomain(email) === SCHOOL_EMAIL_DOMAIN;
}

/**
 * Eligible for login-gated features: exact school domain plus a confirmed
 * email timestamp (Auth `email_confirmed_at`). Unconfirmed or outside
 * users may still read existing public pages.
 */
export function isEligibleSchoolEmail(email: unknown, emailConfirmedAt: unknown): boolean {
  if (!isSchoolEmail(email)) return false;
  if (typeof emailConfirmedAt !== 'string') return false;
  return emailConfirmedAt.trim() !== '';
}

function firstNonEmptyString(values: readonly unknown[]): string | null {
  for (const value of values) {
    if (typeof value === 'string' && value.trim() !== '') return value.trim();
  }
  return null;
}

/**
 * Display attribution from verified user data. Metadata is mutable and is
 * NOT durable ownership — used for display only, never for authorization.
 */
export function deriveDisplayName(input: unknown): string {
  const fallback = '已登入學生';
  if (typeof input !== 'object' || input === null || Array.isArray(input)) return fallback;
  const record = input as Record<string, unknown>;
  const named = firstNonEmptyString([record['name'], record['full_name'], record['displayName']]);
  if (named !== null) return named;
  const nested = record['metadata'];
  if (typeof nested === 'object' && nested !== null && !Array.isArray(nested)) {
    const nestedName = firstNonEmptyString([
      (nested as Record<string, unknown>)['full_name'],
      (nested as Record<string, unknown>)['name'],
      (nested as Record<string, unknown>)['global_name'],
    ]);
    if (nestedName !== null) return nestedName;
  }
  if (typeof record['email'] === 'string') {
    const prefix = record['email'].trim().split('@')[0]?.trim() ?? '';
    if (prefix !== '') return prefix;
  }
  return fallback;
}
