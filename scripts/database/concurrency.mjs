import { spawn } from 'node:child_process';
import { isDeepStrictEqual } from 'node:util';

const proposal = '20000000-0000-4000-8000-000000000001';
const createKey = '40000000-0000-4000-8000-000000000001';
const voter = (n) => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

export async function checkConcurrency(container, database, sql) {
  function concurrent(input, onReady) {
    return new Promise((resolve, reject) => {
      const child = spawn('docker', ['exec', '-i', '-u', '0', container, 'psql', '-X', '-qAt', '-h', '/tmp',
        '-U', 'supabase_admin', '-d', database, '-v', 'ON_ERROR_STOP=1'], { stdio: ['pipe', 'pipe', 'pipe'] });
      let stderr = '';
      let output = '';
      child.stdout.on('data', (chunk) => {
        output += chunk;
        if (output.includes('rights_lock_held')) onReady?.();
      });
      child.stderr.on('data', (chunk) => { stderr += chunk; });
      child.on('error', reject);
      child.stdin.on('error', reject);
      child.on('close', (code) => {
        if (code === 0) resolve(output.trim());
        else reject(new Error(`Concurrent SQL failed (${stderr.match(/ERROR:\s+([A-Z0-9]{5})/u)?.[1] ?? 'LOCAL_PROCESS'}); raw output withheld`));
      });
      child.stdin.end(`\\set VERBOSITY sqlstate\nSET statement_timeout='10s';\n${input}`);
    });
  }

  const create = `SET ROLE authenticated; SET request.jwt.claim.sub='${voter(1)}';
    SELECT public.rights_create_proposal('${createKey}','Concurrent create','body','其他');`;
  const receipts = await Promise.all(Array.from({ length: 8 }, () => concurrent(create)));
  const persisted = sql(database, `SELECT jsonb_build_object('inserted',true,'id',id,'version',content_version)
    FROM public.proposals WHERE user_id='${voter(1)}' AND title='[其他] Concurrent create';`);
  if (persisted.split('\n').filter(Boolean).length !== 1) throw new Error('Concurrent creates must persist exactly one proposal');
  const expectedReceipt = JSON.parse(persisted);
  if (!receipts.every((receipt) => receipt && isDeepStrictEqual(JSON.parse(receipt), expectedReceipt))) {
    throw new Error('Concurrent create callers must all receive the persisted proposal receipt');
  }
  console.log('PASS: 8 concurrent same-key creates persisted one proposal and returned identical receipts');

  function vote(user, value) {
    return `BEGIN; SET LOCAL ROLE authenticated; SET LOCAL request.jwt.claim.sub='${user}';
      SELECT public.rights_set_vote('${proposal}',${value});`;
  }
  function checkBallots(expected, message) {
    const count = sql(database, `SELECT count(*) FROM rights_private.proposal_ballots WHERE proposal_id='${proposal}';`);
    if (count !== String(expected)) throw new Error(`${message}: expected ${expected}, got ${count}`);
  }
  await Promise.all(Array.from({ length: 8 }, () => concurrent(`${vote(voter(1), true)} COMMIT;`)));
  checkBallots(1, 'Concurrent same-actor votes must count once');
  await Promise.all(Array.from({ length: 6 }, (_, n) => concurrent(`${vote(voter(n + 1), true)} COMMIT;`)));
  checkBallots(6, 'Concurrent distinct-actor votes must all be retained');
  await Promise.all(Array.from({ length: 6 }, (_, n) => concurrent(`${vote(voter(n + 1), false)} COMMIT;`)));
  checkBallots(0, 'Concurrent cancellations must remove every ballot');
  // Hold the vote's lock while a second connection starts its cancellation.
  let notifyReady;
  const ready = new Promise((resolve) => { notifyReady = resolve; });
  const held = concurrent(`${vote(voter(1), true)} SELECT 'rights_lock_held'; SELECT pg_sleep(1); COMMIT;`, notifyReady);
  await Promise.race([ready, held.then(() => { throw new Error('Lock readiness marker missing'); })]);
  await Promise.all([held, concurrent(`${vote(voter(1), false)} COMMIT;`)]);
  checkBallots(0, 'The cancellation must win over the earlier vote');
  if (sql(database, `SELECT rights_private.total(id,legacy_upvotes_count) FROM public.proposals WHERE id='${proposal}';`) !== '37') {
    throw new Error('Concurrent cancellation must preserve the historical baseline');
  }
  console.log('PASS: concurrent same-actor and distinct-actor votes, cancellations, serialized true→false and immutable baseline');
}
