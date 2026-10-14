// @vitest-environment node
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { NextResponse } from 'next/server';
import { fixtureSession, startSupabaseFixture } from '../fixtures/supabase-server';
import { fakePublishableKey } from '../fixtures/supabase-data';
import { sessionRequest } from '../fixtures/server-auth-request';
vi.mock('server-only', () => ({}));
import { GET } from '../../app/api/rights/session/route';
import { proxy } from '../../proxy';

let fixture: Awaited<ReturnType<typeof startSupabaseFixture>>;
beforeEach(async () => {
  fixture = await startSupabaseFixture();
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', fixture.url);
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', fakePublishableKey);
});
afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  await fixture.close();
});

const surfaces = [
  { name: 'session', handler: GET },
  { name: 'proxy', handler: proxy },
] as const;
const faults = ['configuration', 'verification', 'refresh-cookie', 'response-cookie'] as const;
test.each(surfaces.flatMap(surface => faults.map(fault => ({ ...surface, fault }))))(
  '$name contains $fault failure without privilege', async ({ handler, fault }) => {
  // Given: real SDK sessions and narrow faults at each adapter boundary.
    const request = await sessionRequest(fixture.url, 'admin', fixtureSession('admin', true));
    fixture.data.requests.length = 0;
    if (fault === 'configuration') vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    if (fault === 'verification') vi.spyOn(request.signal, 'throwIfAborted').mockImplementation(() => { throw new TypeError('private upstream failure'); });
    if (fault === 'refresh-cookie') vi.spyOn(request.cookies, 'set').mockImplementation(() => { throw new TypeError('private cookie failure'); });
    if (fault === 'response-cookie') {
      const json = NextResponse.json.bind(NextResponse);
      const next = NextResponse.next.bind(NextResponse);
      const failCookie = (response: NextResponse) => {
        vi.spyOn(response.cookies, 'set').mockImplementation(() => { throw new TypeError('private response failure'); });
        return response;
      };
      vi.spyOn(NextResponse, 'json').mockImplementation((...args) => failCookie(json(...args)));
      vi.spyOn(NextResponse, 'next').mockImplementation((...args) => failCookie(next(...args)));
    }
    // When: initialization, getUser, refresh or final application throws.
    const response = await handler(request);
    // Then: generic non-cacheable failure, no forwarded privilege or mutations.
    expect(response.status, fault).toBe(503);
    expect(await response.json(), fault).toEqual({ error: 'unavailable' });
    expect(response.headers.get('cache-control'), fault).toBe('private, no-store');
    expect(response.headers.get('x-middleware-next'), fault).toBeNull();
    expect(fixture.data.counters.total, fault).toBe(0);
    if (fault !== 'response-cookie') expect(fixture.data.requests.some(entry => entry.path.startsWith('/rest/')), fault).toBe(false);
});
