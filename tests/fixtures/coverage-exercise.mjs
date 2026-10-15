import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { startSupabaseFixture, fixtureSession } from './supabase-server.ts';
import { fakePublishableKey } from './supabase-data.ts';

const fixture = await startSupabaseFixture();
try {
  const client = createClient(fixture.url, fakePublishableKey, {
    global: { headers: { Authorization: `Bearer ${fixtureSession().access_token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  assert.equal((await client.auth.getUser(fixtureSession().access_token)).data.user?.id, 'student');
  assert.equal((await client.auth.getUser('forged')).error?.status, 401);
  assert.deepEqual((await client.from('proposals').select('id').eq('id', 'proposal-1').in('status', ['研議中']).limit(1)).data, [{ id: 'proposal-1' }]);
  assert.equal((await client.from('feedback').update({ reply: 'Coverage student write' }).eq('id', 'feedback-1').select('id').single()).error, null);
  assert.equal((await client.from('home_sections').insert({ title: 'Coverage insert' }).select('id')).error, null);
  assert.equal((await client.from('feedback').delete().eq('id', 'feedback-1').select('id')).error, null);
  fixture.data.reset();
  console.log('Native coverage exercise: verified Auth, projection/filter, permissive insert/update/delete, reset');
} finally {
  await fixture.close();
}
