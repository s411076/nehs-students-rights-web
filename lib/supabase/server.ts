import 'server-only';

import { createServerClient } from '@supabase/ssr';
import type { CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { NextRequest, NextResponse } from 'next/server';

function publicConfiguration() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new TypeError('Missing public Supabase configuration');
  return { url, key };
}

export async function createReadOnlyClient() {
  const store = await cookies();
  const { url, key } = publicConfiguration();
  return createServerClient(url, key, {
    cookies: { getAll: () => store.getAll() },
    global: { fetch: (input, init) => fetch(input, { ...init, cache: 'no-store' }) },
  });
}

// Route Handlers must apply pending refresh state to their final response, including errors.
export function createRouteHandlerClient(request: NextRequest) {
  const { url, key } = publicConfiguration();
  const pending = new Map<string, { readonly name: string; readonly value: string; readonly options: CookieOptions }>();
  const headers = new Headers({ 'Cache-Control': 'private, no-store' });
  let cookieWriteFailure: Error | undefined;
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (values, cacheHeaders) => {
        try {
          values.forEach(({ name, value, options }) => {
            request.cookies.set(name, value);
            pending.set(name, { name, value, options });
          });
          Object.entries(cacheHeaders).forEach(([name, value]) => headers.set(name, value));
        } catch (error) {
          if (!(error instanceof Error)) throw error;
          // SDK refresh notifications reject internal promises if a subscriber throws.
          // Defer the original error to the awaited getUser/response boundary, never authorize.
          cookieWriteFailure = error;
        }
      },
    },
    global: {
      fetch: (input, init) => fetch(input, {
        ...init, cache: 'no-store',
        signal: init?.signal ? AbortSignal.any([request.signal, init.signal]) : request.signal,
      }),
    },
  });
  const getUser = supabase.auth.getUser.bind(supabase.auth);
  supabase.auth.getUser = async jwt => {
    request.signal.throwIfAborted();
    if (cookieWriteFailure) throw cookieWriteFailure;
    const result = await getUser(jwt);
    request.signal.throwIfAborted();
    if (cookieWriteFailure) throw cookieWriteFailure;
    return result;
  };
  return {
    supabase,
    applyToResponse<T extends NextResponse>(response: T): T {
      if (cookieWriteFailure) throw cookieWriteFailure;
      pending.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      headers.forEach((value, name) => response.headers.set(name, value));
      return response;
    },
  };
}
