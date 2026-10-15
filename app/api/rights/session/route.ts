import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { AuthorizationError, getVerifiedIdentity, requireAdmin } from '@/lib/auth/server';
import { createRouteHandlerClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  let adapter: ReturnType<typeof createRouteHandlerClient> | undefined;
  try {
    adapter = createRouteHandlerClient(request);
    let response: NextResponse;
    const identity = await getVerifiedIdentity(adapter.supabase);
    try {
      response = NextResponse.json(await requireAdmin(adapter.supabase));
    } catch (error) {
      if (!(error instanceof AuthorizationError) || error.code !== 'admin_required') throw error;
      response = NextResponse.json(identity);
    }
    return adapter.applyToResponse(response);
  } catch (error) {
    const response = NextResponse.json(
      { error: error instanceof AuthorizationError ? error.code : 'unavailable' },
      { status: error instanceof AuthorizationError ? error.status : 503,
        headers: { 'Cache-Control': 'private, no-store' } },
    );
    try { return adapter ? adapter.applyToResponse(response) : response; }
    catch {
      return NextResponse.json({ error: 'unavailable' }, {
        status: 503, headers: { 'Cache-Control': 'private, no-store' },
      });
    }
  }
}
