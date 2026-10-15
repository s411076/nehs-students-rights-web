/**
 * Shared OAuth completion behavior for the root login return and
 * `app/auth/callback/page.tsx`.
 *
 * The browser Supabase SDK owns the automatic PKCE code exchange: when the
 * provider redirects back with `?code=…`, the SDK consumes it during
 * `getSession()` / `onAuthStateChange(INITIAL_SESSION)`. This module therefore
 * NEVER calls `exchangeCodeForSession` itself — doing so would duplicate the
 * automatic exchange and race it. Completion only *awaits* SDK initialization,
 * then verifies the resulting identity and cleans the consumed OAuth result
 * parameters from the URL (preserving unrelated query parameters and hash).
 *
 * Success is granted only for a verified, confirmed school identity. Missing,
 * failed, replayed (no session), non-school or unconfirmed completions are
 * never reported as success.
 */

import { SCHOOL_EMAIL_DOMAIN, isEligibleSchoolEmail } from './types';

export const SCHOOL_HD_HINT = SCHOOL_EMAIL_DOMAIN;

/** OAuth result parameters consumed by the SDK exchange. Removed after use. */
const OAUTH_RESULT_PARAMS: readonly string[] = [
  'code',
  'error',
  'error_code',
  'error_description',
];

const LOGIN_CELEBRATION_KEY = 'just_logged_in';

export type CompletionStatus = 'success' | 'ineligible' | 'failure';

export interface CompletionResult {
  readonly status: CompletionStatus;
  /** Normalized verified email, or null when no verified identity exists. */
  readonly email: string | null;
}

export interface CompletionUser {
  readonly email?: unknown;
  readonly email_confirmed_at?: unknown;
}

/**
 * Minimal structural surface of the browser SDK client used by completion.
 * The singleton from `@/lib/supabase` satisfies this interface.
 */
export interface CompletionAuthClient {
  readonly auth: {
    getSession(): Promise<unknown>;
    getUser(): Promise<{ readonly data: { readonly user: unknown }; readonly error: unknown }>;
    signInWithOAuth(args: {
      readonly provider: 'google';
      readonly options: {
        readonly redirectTo: string;
        readonly queryParams: { readonly hd: string };
      };
    }): Promise<unknown>;
  };
}

/**
 * Single shared Google OAuth entry used by both login buttons. The role
 * parameter was removed: both buttons start the same school-hinted flow and
 * the admin label is granted only after server verification, never by which
 * button was pressed. `origin` must be `window.location.origin` — never a
 * hardcoded production domain.
 */
export async function startGoogleOAuth(
  client: CompletionAuthClient,
  origin: string,
): Promise<unknown> {
  return client.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: origin,
      queryParams: { hd: SCHOOL_HD_HINT },
    },
  });
}

/**
 * Reports whether a search string carries OAuth result parameters.
 * Malformed input fails closed (treated as absent, never throws).
 */
export function hasOAuthResultParams(search: string): boolean {
  try {
    const params = new URLSearchParams(search);
    for (const name of OAUTH_RESULT_PARAMS) {
      if (params.has(name)) return true;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Strips consumed OAuth result parameters while preserving every unrelated
 * query parameter (order preserved) — e.g. `?code=x&next=/a&q=1` keeps
 * `next` and `q`. Returns '' when nothing remains, otherwise `?…`.
 */
export function buildCleanedSearch(search: string): string {
  const params = new URLSearchParams(search);
  for (const name of OAUTH_RESULT_PARAMS) params.delete(name);
  const rest = params.toString();
  return rest === '' ? '' : `?${rest}`;
}

/** Rebuilds a same-document URL without OAuth result params, keeping hash. */
export function buildCleanedUrl(pathname: string, search: string, hash: string): string {
  const normalizedHash = hash && hash.startsWith('#') ? hash : hash === '' ? '' : `#${hash}`;
  return `${pathname}${buildCleanedSearch(search)}${normalizedHash}`;
}

/**
 * Decides completion from an already SDK-verified user (`getUser` hits the
 * Auth server, unlike storage reads). Pure and synchronous for testability:
 * - transport/user errors or a missing email mean `failure` (missing session,
 *   exchange failure, replayed code with no session behind it);
 * - a verified identity outside the confirmed school domain means
 *   `ineligible` — these users may still read public pages;
 * - otherwise `success`.
 */
export function decideCompletion(user: unknown, error: unknown): CompletionResult {
  if (error !== null && error !== undefined) return { status: 'failure', email: null };
  if (typeof user !== 'object' || user === null || Array.isArray(user)) {
    return { status: 'failure', email: null };
  }
  const record = user as Record<string, unknown> & CompletionUser;
  const email = typeof record.email === 'string' ? record.email.trim().toLowerCase() : '';
  if (email === '') return { status: 'failure', email: null };
  if (!isEligibleSchoolEmail(record.email, record.email_confirmed_at)) {
    return { status: 'ineligible', email };
  }
  return { status: 'success', email };
}

/**
 * Awaits SDK initialization so the browser-owned automatic exchange has a
 * chance to consume `?code=…`. Settles (never throws): initialization failure
 * fails closed and is reported by the subsequent verification, never as
 * success. Makes no manual `exchangeCodeForSession` call.
 */
export async function awaitSdkInit(client: CompletionAuthClient): Promise<void> {
  try {
    await client.auth.getSession();
  } catch {
    // Initialization is a boundary: verification below reports the outcome.
  }
}

/**
 * Resolves the OAuth completion after SDK initialization: exactly one
 * `getSession` (letting the automatic exchange run once), then one verified
 * `getUser`. Never calls `exchangeCodeForSession` — the browser SDK owns it.
 */
export async function resolveOAuthCompletion(
  client: CompletionAuthClient,
): Promise<CompletionResult> {
  await awaitSdkInit(client);
  let user: unknown = null;
  let error: unknown = null;
  try {
    const result = await client.auth.getUser();
    user = result.data.user;
    error = result.error;
  } catch (caught) {
    error = caught;
  }
  return decideCompletion(user, error);
}

/**
 * Removes consumed OAuth result parameters from the current address-bar URL
 * via `history.replaceState` — no navigation, unrelated params/hash kept.
 * Must be called only AFTER the SDK had its chance to consume them
 * (`awaitSdkInit` settled). Returns the cleaned URL, or null when there was
 * nothing to remove (no premature URL rewriting) or the environment forbids
 * it. Never throws.
 */
export function consumeOAuthResultParams(): string | null {
  try {
    if (typeof window === 'undefined' || typeof window.location === 'undefined') return null;
    const { pathname, search, hash } = window.location;
    if (!hasOAuthResultParams(search)) return null;
    const cleaned = buildCleanedUrl(pathname, search, hash);
    window.history.replaceState(null, '', cleaned);
    return cleaned;
  } catch {
    return null;
  }
}

/**
 * Marks the pre-OAuth intent flag. Called before redirecting to Google;
 * consumed (with celebration) only after a verified eligible identity.
 * Storage denial fails closed (no celebration), never throws.
 */
export function markLoginCelebrationFlag(): void {
  try {
    sessionStorage.setItem(LOGIN_CELEBRATION_KEY, 'true');
  } catch {
    // Storage restrictions fail closed: simply no celebration later.
  }
}

/**
 * Takes the celebration flag: true exactly once when it was set. Storage
 * denial returns false (no celebration), never throws.
 */
export function consumeLoginCelebrationFlag(): boolean {
  try {
    if (sessionStorage.getItem(LOGIN_CELEBRATION_KEY) !== 'true') return false;
    sessionStorage.removeItem(LOGIN_CELEBRATION_KEY);
    return true;
  } catch {
    return false;
  }
}

/** Clears a stale celebration flag without celebrating. Never throws. */
export function clearLoginCelebrationFlag(): void {
  try {
    sessionStorage.removeItem(LOGIN_CELEBRATION_KEY);
  } catch {
    // Nothing to celebrate and nothing to report.
  }
}
