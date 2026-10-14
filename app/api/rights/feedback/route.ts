import 'server-only';
import type { NextRequest } from 'next/server';
import { createRouteHandlerClient } from '@/lib/supabase/server';
import { makeFailure, makeSuccess } from '@/lib/rights/contracts';
import { FEEDBACK_SELECT_STRING, toFeedbackPublicDTO } from '@/lib/rights/queries';
import { rightsException, rightsResponse } from '@/lib/rights/server-actions';

export async function GET(request: NextRequest) {
  let context: ReturnType<typeof createRouteHandlerClient> | undefined;
  try {
    context = createRouteHandlerClient(request);
    const { data, error } = await context.supabase.from('feedback').select(FEEDBACK_SELECT_STRING).order('created_at', { ascending: false });
    const rows: unknown = data;
    if (error || !Array.isArray(rows)) return context.applyToResponse(rightsResponse(makeFailure('UNAVAILABLE')));
    const projection = rows.map(toFeedbackPublicDTO);
    if (projection.some(row => row === null)) return context.applyToResponse(rightsResponse(makeFailure('UNAVAILABLE')));
    return context.applyToResponse(rightsResponse(makeSuccess(projection)));
  } catch (error) {
    const response = rightsResponse(rightsException(error));
    try { return context ? context.applyToResponse(response) : response; }
    catch { return rightsResponse(makeFailure('UNAVAILABLE')); }
  }
}
