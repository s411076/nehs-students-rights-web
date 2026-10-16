import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { startGateway } from '../../scripts/local-stack/gateway.mjs';
import { users } from '../../scripts/local-stack/identities.mjs';

const statePath = process.argv[2];
const state = JSON.parse(readFileSync(statePath, 'utf8'));
const gateway = await startGateway(state);
const client = token => createClient(gateway.url, state.tokens.anon, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  global: { headers: { Authorization: `Bearer ${token}` } },
});
let count = 0;
async function check(name, action) {
  await action(); count++; console.log(`PASS ${name}`);
}

try {
  for (const [name, user] of Object.entries(users)) {
    await check(`Auth facade registry returns only synthetic ${name}`, async () => {
      // Given a registered locally signed token; When SDK calls Auth; Then registry identity matches.
      const result = await client(state.tokens[name]).auth.getUser();
      assert.equal(result.error, null); assert.equal(result.data.user.id, user.id);
    });
  }
  await check('real PostgREST rejects a tampered signature', async () => {
    // Given a corrupt signature; When SDK sends a table read; Then PostgREST returns JWT denial.
    const result = await client(`${state.tokens.studentA.slice(0, -4)}XXXX`).from('proposals').select('id');
    assert.equal(result.status, 401); assert.equal(result.error.code, 'PGRST301');
  });
  if (state.mode === 'baseline') {
    for (const [name, token] of Object.entries(state.tokens)) {
      await check(`real RPC impersonates ${name} via role and auth.uid()`, async () => {
        // Given a local token; When an invoker RPC executes; Then DB claims match the identity.
        const result = await client(token).rpc('synthetic_request_identity');
        assert.equal(result.error, null);
        assert.deepEqual(result.data, { uid: users[name]?.id ?? null,
          role: name === 'anon' ? 'anon' : 'authenticated' });
      });
    }
    await check('baseline public read reaches restored schema', async () => {
      // Given the synthetic proposal; When anon reads; Then the fixture row is returned.
      const result = await client(state.tokens.anon).from('proposals').select('id,upvotes_count');
      assert.equal(result.error, null);
      assert.deepEqual(result.data, [{ id: '20000000-0000-4000-8000-000000000001', upvotes_count: 7 }]);
    });
    await check('baseline RLS denies anon announcement insert', async () => {
      // Given anon; When inserting an announcement; Then the restored RLS policy rejects it.
      const result = await client(state.tokens.anon).from('home_sections').insert({ title: 'Denied', content: 'Synthetic' });
      assert.equal(result.status, 401); assert.equal(result.error.code, '42501');
    });
    state.baselinePassed = true;
    writeFileSync(statePath, JSON.stringify(state, null, 2), { mode: 0o600 });
  } else {
    for (const [name, token] of Object.entries(state.tokens)) {
      await check(`hardened sensitive raw proposal access denied for ${name}`, async () => {
        // Given an application JWT; When raw sensitive columns are requested; Then ACL denies access.
        const result = await client(token).from('proposals').select('user_id,author_email');
        assert.ok([401, 403].includes(result.status)); assert.equal(result.error.code, '42501');
      });
      await check(`hardened public RPC returns a safe Page for ${name}`, async () => {
        // Given a public RPC; When called with any identity; Then it returns projected page data.
        const result = await client(token).rpc('rights_list_public_proposals', { p_limit: 20 });
        assert.equal(result.error, null);
        assert.ok(Array.isArray(result.data.items));
        assert.ok(Object.hasOwn(result.data, 'nextCursor'));
        for (const item of result.data.items) {
          assert.equal(Object.hasOwn(item, 'author_email'), false);
          assert.equal(Object.hasOwn(item, 'user_id'), false);
        }
      });
    }
    for (const name of ['anon', 'outsider', 'unconfirmed']) {
      await check(`hardened mutation independently rejects ${name}`, async () => {
        // Given an ineligible identity; When RPC creates content; Then DB identity checks deny it.
        const result = await client(state.tokens[name]).rpc('rights_create_proposal', {
          p_title: 'Synthetic denied proposal', p_content: 'Synthetic body', p_category: '其他',
        });
        assert.ok([401, 403].includes(result.status));
      });
    }
  }
  console.log(`${count} real HTTP checks passed (${state.mode}); PostgREST=${state.postgrestUrl}`);
} finally {
  await gateway.close();
}
