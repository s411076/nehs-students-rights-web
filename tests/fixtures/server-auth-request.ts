import { createChunks, createServerClient } from '@supabase/ssr';
import { NextRequest } from 'next/server';
import { fakePublishableKey } from './supabase-data';
import type { FixtureIdentity } from './supabase-data';
import { fixtureSession } from './supabase-server';

export async function sessionRequest(url: string, identity: FixtureIdentity = 'student', replacement?: ReturnType<typeof fixtureSession>) {
  const jar = new Map<string, string>();
  const client = createServerClient(url, fakePublishableKey, {
    cookies: { getAll: () => [], setAll: values => { values.forEach(cookie => jar.set(cookie.name, cookie.value)); } },
  });
  const { error } = await client.auth.setSession(fixtureSession(identity));
  if (error) throw error;
  if (replacement) {
    const first = jar.keys().next().value;
    if (!first) throw new TypeError('Expected seeded cookie');
    const name = first.replace(/\.\d+$/, '');
    jar.clear();
    createChunks(name, `base64-${Buffer.from(JSON.stringify(replacement)).toString('base64url')}`)
      .forEach(cookie => jar.set(cookie.name, cookie.value));
  }
  return new NextRequest('http://localhost/feedback', {
    headers: { cookie: Array.from(jar, ([name, value]) => `${name}=${value}`).join('; ') },
  });
}
