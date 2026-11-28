import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadMigrationChain } from './migrations.mjs';
import { checkConcurrency } from './concurrency.mjs';

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

// Export from an untouched clone. See tests/database/export-baseline-from-migrated-db.adr.md.
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

await checkConcurrency(container, db, sql);
console.log('PASS: all local database gates; retained disposable DB for parent HTTP gates');
writeFileSync(resolve(root, `tests/database/verification-${clone ? 'restored' : 'synthetic'}.json`), `${JSON.stringify({
  command: `node scripts/database/regression.mjs${clone ? ' --restored' : ''}`,
  container, database: db, template: clone ? 'recovery' : 'template0',
  migrations: chain.map((entry) => ({ file: entry.file, sha256: entry.sha256 })),
  passed: ['legacy-preservation', 'migration-application', 'authorization', 'projection', 'pagination', 'unicode-null-type-boundaries', 'versions-audit', 'multi-connection-creates', 'multi-connection-votes'],
  completedAt: new Date().toISOString(),
  productionConnection: false, recoveredRowsOutput: false,
}, null, 2)}\n`);
