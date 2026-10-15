// @vitest-environment node
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { startSupabaseFixture } from '../fixtures/supabase-server';
import { fakePublishableKey } from '../fixtures/supabase-data';
import { sessionRequest } from '../fixtures/server-auth-request';
vi.mock('server-only', () => ({}));
import { POST } from '../../app/api/rights/actions/route';
import { createRouteHandlerClient } from '../../lib/supabase/server';
import { LIMITS, makeFailure, REQUESTED_WITH_HEADER } from '../../lib/rights/contracts';
import { parseActionRequest } from '../../lib/rights/validation';
import { executeRightsAction, rightsException, rightsResponse } from '../../lib/rights/server-actions';

// Guard-sensitivity control, NOT a historical pre-fix reproduction or RLS proof.
// Test-only copy of the transport route; all downstream application code is real.
// RED removes only the Origin comparison below; GREEN restores it. Never ship
// an environment flag, provider identity override, or product guard bypass.
async function guardedTransportSeam(request: NextRequest) {
  let context: ReturnType<typeof createRouteHandlerClient> | undefined;
  // no-excuse-ok: catch — mirrors the real HTTP boundary's generic failures.
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
    // no-excuse-ok: catch — malformed JSON/UTF-8 is rejected at the boundary.
    try { input = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
    catch { return context.applyToResponse(rightsResponse(makeFailure('INVALID_PAYLOAD'))); }
    const parsed = parseActionRequest(input);
    if (!parsed.ok) return context.applyToResponse(rightsResponse(parsed));
    return context.applyToResponse(rightsResponse(await executeRightsAction(context.supabase, parsed.data)));
  } catch (error) {
    const response = rightsResponse(rightsException(error));
    // no-excuse-ok: catch — final cookie application must also fail closed.
    try { return context ? context.applyToResponse(response) : response; }
    catch { return rightsResponse(makeFailure('UNAVAILABLE')); }
  }
}

let fixture: Awaited<ReturnType<typeof startSupabaseFixture>>;
beforeEach(async () => {
  fixture = await startSupabaseFixture();
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', fixture.url);
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', fakePublishableKey);
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', fakePublishableKey);
});
afterEach(async () => { vi.unstubAllEnvs(); await fixture.close(); });

test.each([
  { surface: 'isolated application guard seam', handler: guardedTransportSeam },
  { surface: 'unchanged production route', handler: POST },
])('denies foreign-origin student creation at $surface before provider writes', async ({ surface, handler }) => {
  // Given a genuine registry-verified student, valid payload and foreign Origin.
  const seeded = await sessionRequest(fixture.url, 'student');
  const request = new NextRequest('http://localhost/api/rights/actions', {
    method: 'POST', headers: { cookie: seeded.headers.get('cookie') ?? '', origin: 'https://foreign.test',
      'x-requested-with': REQUESTED_WITH_HEADER, 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'createProposal', payload: { title: 'Origin sensitivity', content: 'control body', category: '其他' } }),
  });
  // When the route-shaped seam (or real route parity control) receives the POST.
  const response = await handler(request);
  // Then the unchanged denial assertion catches both HTTP success and a real write.
  const observation = { status: response.status, writes: fixture.data.counters.total,
    inserted: fixture.data.tables.proposals.filter(row => row.title === '[其他] Origin sensitivity'),
    verifiedUserRequests: fixture.data.requests.filter(entry => entry.path === '/auth/v1/user').length,
    providerMutationRequests: fixture.data.requests.filter(entry => entry.method === 'POST' && entry.path.startsWith('/rest/v1/')).length };
  console.info('guard-sensitivity observation', surface, JSON.stringify(observation));
  expect(observation).toMatchObject({ status: 403, writes: 0, inserted: [], providerMutationRequests: 0 });
});

test('permits same-origin student creation through the real dispatcher when transport is valid', async () => {
  // Given the same registry-verified student and payload, with the correct Origin.
  const seeded = await sessionRequest(fixture.url, 'student');
  const request = new NextRequest('http://localhost/api/rights/actions', {
    method: 'POST', headers: { cookie: seeded.headers.get('cookie') ?? '', origin: 'http://localhost',
      'x-requested-with': REQUESTED_WITH_HEADER, 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'createProposal', payload: { title: 'Origin sensitivity', content: 'control body', category: '其他' } }),
  });
  // When the fully guarded seam receives an authorized student action.
  const response = await guardedTransportSeam(request);
  // Then the provider mutation retains the student's server-derived attribution.
  expect({ status: response.status, writes: fixture.data.counters.total }).toEqual({ status: 200, writes: 1 });
  expect(fixture.data.tables.proposals.at(-1)).toEqual({ id: 'insert-1', title: '[其他] Origin sensitivity',
    content: 'control body', author_name: 'Fixture student', status: '待審核', upvotes_count: 0 });
});

test('denies same-origin student admin mutation when dispatcher authorization remains intact', async () => {
  // Given a real student requesting a privileged action through valid transport.
  const seeded = await sessionRequest(fixture.url, 'student');
  const request = new NextRequest('http://localhost/api/rights/actions', {
    method: 'POST', headers: { cookie: seeded.headers.get('cookie') ?? '', origin: 'http://localhost',
      'x-requested-with': REQUESTED_WITH_HEADER, 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'saveFeedbackReply', payload: { id: 'feedback-1', reply: 'forbidden' } }),
  });
  // When the real dispatcher verifies school identity and admin membership.
  const response = await guardedTransportSeam(request);
  // Then the student has not been upgraded to a fixture admin and cannot write.
  expect({ status: response.status, writes: fixture.data.counters.total }).toEqual({ status: 403, writes: 0 });
  expect(fixture.data.requests.some(entry => entry.path === '/auth/v1/user')).toBe(true);
  expect(fixture.data.requests.some(entry => entry.path.startsWith('/rest/v1/admins'))).toBe(true);
});
