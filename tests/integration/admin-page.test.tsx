// @vitest-environment node
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { startSupabaseFixture } from '../fixtures/supabase-server';
import { fakePublishableKey } from '../fixtures/supabase-data';
import { sessionRequest } from '../fixtures/server-auth-request';
import type { FeedbackAdminDTO } from '../../lib/rights/queries';

const state = vi.hoisted(() => ({ cookies: [] as { name: string; value: string }[], rows: [] as FeedbackAdminDTO[] }));
vi.mock('server-only', () => ({}));
vi.mock('next/headers', () => ({ cookies: async () => ({ getAll: () => state.cookies }) }));
vi.mock('../../components/admin/AdminFeedbackPanel', () => ({ default: ({ feedback }: { feedback: FeedbackAdminDTO[] }) => {
  state.rows = feedback;
  return <div>{feedback.map(row => row.content).join(',')}</div>;
} }));
import { FEEDBACK_SELECT_STRING } from '../../lib/rights/queries';

let fixture: Awaited<ReturnType<typeof startSupabaseFixture>>;
beforeEach(async () => {
  fixture = await startSupabaseFixture();
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', fixture.url);
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', fakePublishableKey);
  state.cookies = []; state.rows = [];
});
afterEach(async () => { vi.restoreAllMocks(); vi.unstubAllEnvs(); await fixture.close(); });
async function page() {
  const { default: AdminPage } = await import('../../app/admin/page');
  // Render the legacy synchronous client page too: RED observes unauthorized content, not a hook error.
  return AdminPage.constructor.name === 'AsyncFunction'
    ? renderToStaticMarkup(await AdminPage()) : renderToStaticMarkup(createElement(AdminPage));
}
async function seed(identity: 'admin' | 'student') {
  state.cookies = (await sessionRequest(fixture.url, identity)).cookies.getAll();
  fixture.data.requests.length = 0;
}
test('redirects anonymous before feedback query', async () => {
  // Given no session; when rendering the route; then redirect with no private select.
  await expect(page()).rejects.toMatchObject({ digest: 'NEXT_REDIRECT;replace;/;307;' });
  expect(fixture.data.requests).toEqual([]);
});
test('rejects student before feedback query', async () => {
  await seed('student');
  await expect(page()).rejects.toMatchObject({ digest: 'NEXT_HTTP_ERROR_FALLBACK;404' });
  expect(fixture.data.requests.some(r => r.path.startsWith('/rest/v1/feedback'))).toBe(false);
});
test('projects approved DTO only after verified admin guard', async () => {
  await seed('admin');
  fixture.data.tables.feedback[0].secret = 'PRIVATE_SECRET';
  expect(await page()).toContain('Fixture suggestion');
  expect(state.rows).toEqual([{ id: 'feedback-1', title: 'Fixture feedback', content: 'Fixture suggestion', category: '其他',
    is_anonymous: true, author_name: 'ANONYMOUS_AUTHOR_SENTINEL', reply: '', replied_at: null, created_at: '2026-01-01T00:00:00Z' }]);
  expect(fixture.data.requests[0].path).toBe('/auth/v1/user');
  expect(new URL(fixture.data.requests[2].path, fixture.url).searchParams.get('select')).toBe(FEEDBACK_SELECT_STRING);
});
test.each(['admins', 'feedback'])('renders controlled unavailable UI when %s upstream fails', async table => {
  await seed('admin');
  const fetch = globalThis.fetch;
  vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => String(input).includes(`/rest/v1/${table}`)
    ? Promise.resolve(Response.json({ message: 'TOKEN_SECRET' }, { status: 400 })) : fetch(input, init));
  const html = await page();
  expect(html).toContain('role="alert"');
  expect(html).not.toContain('TOKEN_SECRET');
  expect(state.rows).toEqual([]);
});
test('proxy keeps anonymous admin responses private and uncached', async () => {
  const { proxy } = await import('../../proxy');
  const response = await proxy(new NextRequest('http://localhost/admin'));
  expect(response.headers.get('cache-control')).toBe('private, no-store');
});
