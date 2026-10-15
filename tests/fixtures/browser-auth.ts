import { createServerClient } from '@supabase/ssr';
import type { BrowserContext } from '@playwright/test';
import { fakePublishableKey } from './supabase-data';
import { fixtureSession } from './supabase-server';
import type { FixtureIdentity } from './supabase-data';

export async function seedSessionCookies(context: BrowserContext, options: { appURL: string; fixtureURL: string; identity?: FixtureIdentity; expired?: boolean }) {
  const cookies: { name: string; value: string }[] = [];
  const client = createServerClient(options.fixtureURL, fakePublishableKey, {
    cookies: { getAll: () => [], setAll: values => { cookies.push(...values); } },
  });
  const session = fixtureSession(options.identity, options.expired);
  const { error } = await client.auth.setSession(session);
  if (error) throw error;
  await context.addCookies(cookies.map(cookie => ({ ...cookie, url: options.appURL, sameSite: 'Lax' })));
  return cookies;
}
