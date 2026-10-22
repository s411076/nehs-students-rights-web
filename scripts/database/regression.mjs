import { spawn, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadMigrationChain } from './migrations.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const container = 'database-recovery-parity-20261016';
const psql = ['exec', '-i', '-u', '0', container, 'psql', '-X', '-qAt', '-h', '/tmp', '-U', 'supabase_admin', '-v', 'ON_ERROR_STOP=1'];
const inspection = spawnSync('docker', ['inspect', '--format', '{{json .HostConfig.NetworkMode}} {{json .HostConfig.PortBindings}}', container], { encoding: 'utf8' });
if (inspection.status !== 0 || !/^"none" (null|\{\})\s*$/.test(inspection.stdout)) throw new Error('Isolated recovery container required');

function sql(db, input) {
  const result = spawnSync('docker', [...psql, '-d', db], { input: `\\set VERBOSITY sqlstate\n${input}`, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  if (result.status !== 0) {
    const code = result.stderr?.match(/ERROR:\s+([A-Z0-9]{5})/u)?.[1] ?? 'LOCAL_PROCESS';
    throw new Error(`Local SQL failed (${code}); raw database output withheld`);
  }
  return result.stdout.trim();
}
function file(path) { return readFileSync(resolve(root, path), 'utf8'); }

if (process.argv[2] === '--export-baseline') {
  const source = process.argv[3];
  if (!/^rights_test_[a-z0-9_]+$/u.test(source ?? '')) throw new Error('Only a disposable cloned database may supply schema');
  const result = spawnSync('docker', ['exec', '-u', '0', container, 'pg_dump', '-h', '/tmp', '-U', 'supabase_admin', '-d', source, '--schema-only', '--schema=public', '--no-comments'], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error('Schema-only export failed');
  writeFileSync(resolve(root, 'tests/database/legacy-public-schema.sql'), result.stdout.replace('SET row_security = off;\n', '').replace('CREATE SCHEMA public;', 'CREATE SCHEMA IF NOT EXISTS public;'));
  console.log('Wrote schema definitions only; no rows exported');
  process.exit(0);
}

const clone = process.argv[2] === '--restored';
if (process.argv.length > 2 && !clone) throw new Error('Usage: node scripts/database/regression.mjs [--restored]');
const db = `rights_test_${clone ? 'restored' : 'synthetic'}_${Date.now()}_${process.pid}`;
sql('postgres', `CREATE DATABASE ${db} OWNER postgres TEMPLATE ${clone ? 'recovery' : 'template0'};`);
console.log(`Disposable database: ${db}; template recovery remains pristine`);
if (!clone) {
  sql(db, file('tests/database/auth-bootstrap.sql'));
  sql(db, file('tests/database/legacy-public-schema.sql'));
  sql(db, file('tests/database/legacy-seed.sql'));
}
sql(db, file('tests/database/preservation.sql'));
// Complete ordered chain from the shared manifest; never a single-file subset.
const chain = loadMigrationChain(root, (absolute) => readFileSync(absolute, 'utf8'));
for (const entry of chain) {
  sql(db, entry.sql);
}
sql(db, file('tests/database/preservation-check.sql'));
console.log('PASS: migration application and complete legacy row preservation');
// Restored data is never read into this process: SQL tests see synthetic rows only.
sql(db, `BEGIN;\n${file('tests/database/regression.sql')}\nCOMMIT;`);
console.log('PASS: synthetic authorization, projection, pagination, version, audit and null-boundary tests');
sql(db, file('tests/database/queues.sql'));
console.log('PASS: filtered queue totals, ordering, leakage and pending gates');

function concurrent(input, onReady) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn('docker', [...psql, '-d', db], { stdio: ['pipe', 'pipe', 'pipe'] });
    let stderr = '';
    let output = '';
    child.stdout.on('data', (chunk) => {
      output += chunk;
      if (output.includes('rights_lock_held')) onReady?.();
    });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (code) => code === 0 ? resolvePromise() : reject(new Error(`Concurrent SQL failed (${stderr.match(/ERROR:\s+([A-Z0-9]{5})/u)?.[1] ?? 'LOCAL_PROCESS'}); raw output withheld`)));
    child.stdin.end(`\\set VERBOSITY sqlstate\n${input}`);
  });
}
const proposal = '20000000-0000-4000-8000-000000000001';
const voter = (n) => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
function vote(user, value, delay = 0) {
  return `BEGIN; SET LOCAL ROLE authenticated; SET LOCAL request.jwt.claim.sub='${user}'; SELECT public.rights_set_vote('${proposal}',${value}); SELECT 'rights_lock_held'; SELECT pg_sleep(${delay}); COMMIT;`;
}
await Promise.all(Array.from({ length: 8 }, () => concurrent(vote(voter(1), true))));
sql(db, `DO $$ BEGIN IF (SELECT count(*) FROM rights_private.proposal_ballots WHERE proposal_id='${proposal}')<>1 THEN RAISE EXCEPTION 'Duplicate concurrent votes'; END IF; END $$;`);
await Promise.all(Array.from({ length: 6 }, (_, n) => concurrent(vote(voter(n + 1), true))));
sql(db, `DO $$ BEGIN IF (SELECT count(*) FROM rights_private.proposal_ballots WHERE proposal_id='${proposal}')<>6 THEN RAISE EXCEPTION 'Lost concurrent vote'; END IF; END $$;`);
await Promise.all(Array.from({ length: 6 }, (_, n) => concurrent(vote(voter(n + 1), false))));
// Hold a lock in one connection; a second desired-state cancellation must wait.
let notifyReady;
const ready = new Promise((done) => { notifyReady = done; });
const held = concurrent(vote(voter(1), true, 1), notifyReady);
await Promise.race([ready, held.then(() => { throw new Error('Lock readiness marker missing'); })]);
await Promise.all([held, concurrent(vote(voter(1), false))]);
sql(db, `DO $$ BEGIN IF EXISTS (SELECT 1 FROM rights_private.proposal_ballots WHERE proposal_id='${proposal}') OR rights_private.total('${proposal}',37)<>37 THEN RAISE EXCEPTION 'Concurrent cancellation or baseline'; END IF; END $$;`);
console.log('PASS: 8 same-user connections, 6 distinct-user connections, cancellation, serialized true→false and immutable baseline');
console.log('PASS: all local database gates; retained disposable DB for parent HTTP gates');
writeFileSync(resolve(root, `tests/database/verification-${clone ? 'restored' : 'synthetic'}.json`), `${JSON.stringify({
  command: `node scripts/database/regression.mjs${clone ? ' --restored' : ''}`,
  container, database: db, template: clone ? 'recovery' : 'template0',
  migrations: chain.map((entry) => ({ file: entry.file, sha256: entry.sha256 })),
  passed: ['legacy-preservation', 'migration-application', 'authorization', 'projection', 'pagination', 'unicode-null-type-boundaries', 'versions-audit', 'multi-connection-votes'],
  completedAt: new Date().toISOString(),
  productionConnection: false, recoveredRowsOutput: false,
}, null, 2)}\n`);
