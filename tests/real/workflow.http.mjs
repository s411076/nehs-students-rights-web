import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { startGateway } from '../../scripts/local-stack/gateway.mjs';
import { users } from '../../scripts/local-stack/identities.mjs';

const state = JSON.parse(readFileSync(process.argv[2], 'utf8'));
assert.equal(state.mode, 'hardened', 'A migrated synthetic fixture is required');
assert.match(state.db, /^rights-real-[a-f0-9]{10}-db$/);
const label = execFileSync('docker', ['inspect', '-f', '{{index .Config.Labels "rights.synthetic"}}', state.db], { encoding: 'utf8' });
assert.equal(label.trim(), 'true');
const gateway = await startGateway(state);
const clients = Object.fromEntries(Object.entries(state.tokens).map(([actor, token]) => [actor,
  createClient(gateway.url, state.tokens.anon, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  }),
]));
const rpc = (actor, name, args = {}) => clients[actor].rpc(`rights_${name}`, args);
const cleanup = [];
const marker = `workflow-${randomUUID()}`;
let count = 0;
async function check(name, action) {
  // Given: uniquely owned synthetic records prepared below.
  // When / Then: each callback performs one observable operation and asserts its result.
  const value = await action(); count++; console.log(`PASS ${name}`); return value;
}
async function success(actor, name, args) {
  const result = await rpc(actor, name, args);
  assert.equal(result.error, null, `${name} failed (${result.status}, ${result.error?.code})`);
  return result.data;
}
function created(receipt, kind) {
  assert.match(receipt.id, /^[a-f0-9-]{36}$/);
  assert.deepEqual(receipt, { id: receipt.id, inserted: true, version: 1 });
  cleanup.push({ kind, id: receipt.id, version: 1 });
  return receipt.id;
}
function redacted(item) {
  assert.equal(Object.hasOwn(item, 'user_id'), false);
  assert.equal(Object.hasOwn(item, 'author_email'), false);
  for (const user of Object.values(users)) {
    assert.equal(JSON.stringify(item).includes(user.email), false);
    assert.equal(JSON.stringify(item).includes(user.id), false);
  }
}
try {
  const proposal = await check('createProposal returns exact versioned receipt', async () => created(
    await success('studentA', 'create_proposal', { p_title: marker, p_content: 'Synthetic pending body', p_category: '其他' }), 'proposal'));
  await check('pending proposal is absent from public targeted read', async () => {
    assert.equal(await success('anon', 'get_public_item', { p_kind: 'proposal', p_id: proposal }), null);
  });
  await check('admin approval advances content version', async () => {
    const receipt = await success('admin', 'approve_proposal', { p_id: proposal, p_expected_version: 1 });
    assert.deepEqual(receipt, { id: proposal, version: 2 });
    cleanup.find(row => row.id === proposal).version = 2;
  });
  const feedback = await check('anonymous feedback creation derives identity in DB', async () => created(
    await success('studentA', 'create_feedback', { p_title: `${marker} title`, p_content: 'Synthetic anonymous body',
      p_category: '其他', p_is_anonymous: true }), 'feedback'));
  const bodyMatch = created(await success('studentB', 'create_feedback', { p_title: 'Synthetic body match',
    p_content: marker, p_category: '其他', p_is_anonymous: true }), 'feedback');
  created(await success('studentB', 'create_feedback', { p_title: `noise-${randomUUID()}`,
    p_content: 'Synthetic unrelated newest item', p_category: '其他', p_is_anonymous: false }), 'feedback');
  const comment = await check('anonymous comment creation returns exact receipt', async () => created(
    await success('studentA', 'add_comment', { p_proposal_id: proposal, p_content: 'Synthetic anonymous comment', p_is_anonymous: true }), 'comment'));
  const secondComment = created(await success('studentB', 'add_comment', { p_proposal_id: proposal,
    p_content: 'Synthetic second comment', p_is_anonymous: false }), 'comment');
  for (const actor of ['anon', 'studentB', 'admin']) {
    await check(`public feedback remains anonymous for ${actor}`, async () => {
      const item = await success(actor, 'get_public_item', { p_kind: 'feedback', p_id: feedback });
      redacted(item); assert.equal(item.is_anonymous, true);
      assert.equal(Object.hasOwn(item, 'author_name'), false); assert.equal(item.version, 1);
    });
    await check(`public comment has anonymous label for ${actor}`, async () => {
      const page = await success(actor, 'list_public_comments', { p_proposal_id: proposal, p_limit: 1 });
      assert.equal(page.items.length, 1); assert.equal(page.items[0].id, comment);
      assert.equal(page.items[0].author_name, '匿名學生'); redacted(page.items[0]);
      assert.deepEqual(page.nextCursor, { id: comment, created_at: page.items[0].created_at });
    });
  }
  for (const [kind, id] of [['feedback', feedback], ['comment', comment]]) {
    await check(`only admin author lookup reveals trusted ${kind} attribution`, async () => {
      const author = await success('admin', 'admin_author', { p_kind: kind, p_id: id });
      assert.deepEqual(author, { attribution: 'known', user_id: users.studentA.id,
        email: users.studentA.email, display_name: 'Synthetic studentA' });
    });
    await check(`student cannot identify anonymous ${kind} author`, async () => {
      const result = await rpc('studentB', 'admin_author', { p_kind: kind, p_id: id });
      assert.equal(result.status, 403); assert.equal(result.error.code, 'PT403');
    });
  }
  await check('comment cursor resumes ascending list without duplication', async () => {
    const first = await success('anon', 'list_public_comments', { p_proposal_id: proposal, p_limit: 1 });
    // When: resume with the exact opaque timestamp string, never Date-rounded.
    const page = await success('anon', 'list_public_comments', { p_proposal_id: proposal, p_limit: 1, p_cursor: first.nextCursor });
    assert.deepEqual(page.items.map(item => item.id), [secondComment]); assert.equal(page.nextCursor, null);
  });
  await check('title/content query filtering precedes keyset limit', async () => {
    const first = await success('anon', 'list_public_feedback', { p_query: marker, p_limit: 1 });
    assert.deepEqual(first.items.map(item => item.id), [bodyMatch]);
    assert.deepEqual(first.nextCursor, { id: bodyMatch, created_at: first.items[0].created_at });
    const second = await success('anon', 'list_public_feedback', { p_query: marker, p_limit: 1, p_cursor: first.nextCursor });
    assert.deepEqual(second.items.map(item => item.id), [feedback]); assert.equal(second.nextCursor, null);
  });
  // An owned historical fixture tests nonzero cutover votes without touching any preexisting row.
  const historical = randomUUID();
  execFileSync('docker', ['exec', '-i', state.db, 'psql', '-h', '/tmp', '-U', 'supabase_admin', '-d', 'fixture', '-X', '-v', 'ON_ERROR_STOP=1'], {
    input: `INSERT INTO public.proposals(id,title,content,status,legacy_upvotes_count,upvotes_count)
      VALUES ('${historical}','${marker} historical','Synthetic history','處理中',13,13);`, stdio: ['pipe', 'ignore', 'pipe'],
  });
  cleanup.push({ kind: 'proposal', id: historical, version: 1 });
  for (const [actor, voted, total] of [['studentA', true, 14], ['studentA', true, 14],
    ['studentB', true, 15], ['studentA', false, 14], ['studentA', false, 14], ['studentB', false, 13]]) {
    await check(`${actor} desired vote=${voted} preserves nonzero baseline at total=${total}`, async () => {
      const receipt = await success(actor, 'set_vote', { p_proposal_id: historical, p_voted: voted });
      assert.deepEqual(receipt, { id: historical, voted, upvotes_count: total });
    });
  }
  await check('duplicate concurrent votes count once per user', async () => {
    const receipts = await Promise.all(Array.from({ length: 3 }, () => success('studentA', 'set_vote', { p_proposal_id: proposal, p_voted: true })));
    for (const receipt of receipts) assert.deepEqual(receipt, { id: proposal, voted: true, upvotes_count: 1 });
  });
  for (const [actor, voted] of [['studentA', true], ['studentB', false]]) {
    await check(`viewer_voted is caller-specific for ${actor}`, async () => {
      const item = await success(actor, 'get_public_item', { p_kind: 'proposal', p_id: proposal });
      assert.equal(item.viewer_voted, voted); assert.equal(item.version, 2);
      assert.equal(item.legacy_upvotes_count, 0); assert.equal(item.upvotes_count, 1);
    });
  }
  await check('vote cancellation returns to historical baseline without changing version', async () => {
    const item = await success('anon', 'get_public_item', { p_kind: 'proposal', p_id: historical });
    assert.equal(item.legacy_upvotes_count, 13); assert.equal(item.upvotes_count, 13); assert.equal(item.version, 1);
  });
  await check('admin edit returns next version after votes and comments', async () => {
    const receipt = await success('admin', 'update_proposal_control', { p_id: proposal, p_status: '處理中', p_reply: 'Synthetic reply', p_expected_version: 2 });
    assert.deepEqual(receipt, { id: proposal, version: 3 }); cleanup.find(row => row.id === proposal).version = 3;
  });
  for (const [name, args, status, code] of [
    ['update_proposal_control', { p_id: proposal, p_status: '處理中', p_reply: 'Stale', p_expected_version: 2 }, 409, 'PT409'],
    ['approve_proposal', { p_id: proposal, p_expected_version: 3 }, 409, 'PT409'],
    ['create_proposal', { p_title: 'Synthetic invalid', p_content: 'Body', p_category: 'invalid' }, 400, 'PT400'],
    ['set_vote', { p_proposal_id: randomUUID(), p_voted: true }, 409, 'PT409'],
    ['delete_comment', { p_id: comment, p_proposal_id: historical, p_expected_version: 1 }, 409, 'PT409'],
    ['list_public_feedback', { p_limit: 51 }, 400, 'PT400'],
    ['list_public_feedback', { p_query: '界'.repeat(101) }, 400, 'PT400'],
    ['list_public_feedback', { p_cursor: { id: randomUUID(), created_at: 'invalid' } }, 400, 'PT400'],
  ]) {
    await check(`${name} exposes deliberate HTTP ${status}/${code}`, async () => {
      const result = await rpc('admin', name, args); assert.equal(result.status, status); assert.equal(result.error.code, code);
    });
  }
  await check('student cannot execute administrator edit', async () => {
    const result = await rpc('studentA', 'delete_feedback', { p_id: feedback, p_expected_version: 1 });
    assert.equal(result.status, 403); assert.equal(result.error.code, 'PT403');
  });
  console.log(`${count} real RPC workflow checks passed; all records owned by this run`);
} finally {
  try {
    for (const row of cleanup.toReversed()) {
      const args = { p_id: row.id, p_expected_version: row.version };
      // Comment FK cascade is owned by proposal deletion; skip explicit comment cleanup.
      if (row.kind === 'comment') continue;
      const receipt = await success('admin', `delete_${row.kind}`, args);
      assert.deepEqual(receipt, { id: row.id, deleted: true });
    }
  } finally { await gateway.close(); }
}
