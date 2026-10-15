import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createRouteHandlerClient } from '@/lib/supabase/server';

export async function proxy(request: NextRequest) {
  let adapter: ReturnType<typeof createRouteHandlerClient> | undefined;
  try {
    adapter = createRouteHandlerClient(request);
    // Refresh only: each protected operation must independently invoke its auth guard.
    await adapter.supabase.auth.getUser();
    return adapter.applyToResponse(NextResponse.next({ request: { headers: request.headers } }));
  } catch {
    const response = NextResponse.json({ error: 'unavailable' }, {
      status: 503, headers: { 'Cache-Control': 'private, no-store' },
    });
    try { return adapter ? adapter.applyToResponse(response) : response; }
    catch {
      return NextResponse.json({ error: 'unavailable' }, {
        status: 503, headers: { 'Cache-Control': 'private, no-store' },
      });
    }
  }
}

export const config = {
  matcher: ['/', '/admin/:path*', '/profile/:path*', '/feedback/:path*', '/proposals/:path*', '/auth/callback/:path*', '/api/rights/:path*'],
};
