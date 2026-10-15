import 'server-only';
import type { NextRequest } from 'next/server';
import { createRouteHandlerClient } from '@/lib/supabase/server';
import { LIMITS, makeFailure, REQUESTED_WITH_HEADER } from '@/lib/rights/contracts';
import { parseActionRequest } from '@/lib/rights/validation';
import { executeRightsAction, rightsException, rightsResponse } from '@/lib/rights/server-actions';

export async function POST(request: NextRequest) {
  let context: ReturnType<typeof createRouteHandlerClient> | undefined;
  try {
    context = createRouteHandlerClient(request);
    if (request.headers.get('origin') !== new URL(request.url).origin ||
        request.headers.get('x-requested-with') !== REQUESTED_WITH_HEADER) {
      return context.applyToResponse(rightsResponse(makeFailure('FORBIDDEN')));
    }
    if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') {
      return context.applyToResponse(rightsResponse(makeFailure('UNSUPPORTED_MEDIA')));
    }
    const reader = request.body?.getReader();
    if (!reader) return context.applyToResponse(rightsResponse(makeFailure('INVALID_PAYLOAD')));
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > LIMITS.ACTION_BODY_MAX_BYTES) {
          await reader.cancel();
          return context.applyToResponse(rightsResponse(makeFailure('PAYLOAD_TOO_LARGE')));
        }
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    let input: unknown;
    try { input = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
    catch { return context.applyToResponse(rightsResponse(makeFailure('INVALID_PAYLOAD'))); }
    const parsed = parseActionRequest(input);
    if (!parsed.ok) return context.applyToResponse(rightsResponse(parsed));
    return context.applyToResponse(rightsResponse(await executeRightsAction(context.supabase, parsed.data)));
  } catch (error) {
    const response = rightsResponse(rightsException(error));
    try { return context ? context.applyToResponse(response) : response; }
    catch { return rightsResponse(makeFailure('UNAVAILABLE')); }
  }
}
