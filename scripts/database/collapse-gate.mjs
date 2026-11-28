import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { POSTGRES_IMAGE, loadMigrationChain } from './migrations.mjs';
import { checkConcurrency } from './concurrency.mjs';

// Bootstrap as supabase_admin so the migration login is non-superuser postgres.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const container = `rights-collapse-${Date.now()}-${process.pid}`;
const database = 'rights_test_collapse';
const file = (path) => readFileSync(resolve(root, path), 'utf8');
const chain = loadMigrationChain(root, (absolute) => readFileSync(absolute, 'utf8'));

function docker(args, input, stage = 'docker') {
  const result = spawnSync('docker', args, { input, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (result.status !== 0) {
    const state = result.stderr?.match(/ERROR:\s+([A-Z0-9]{5})/u)?.[1] ?? 'LOCAL_PROCESS';
    const line = result.stderr?.match(/psql:<stdin>:(\d+):/u)?.[1] ?? 'unknown';
    const assertion = result.stderr?.match(/ERROR:\s+P0001: (Auth contract: [^\n]+|Regression assertion: [A-Za-z0-9 ,_-]+|Legacy objects remain: [A-Za-z0-9_.,() ]+|Retained row preservation failed)/u)?.[1];
    throw new Error(`${stage} failed (${state}, input line ${line}${assertion ? `, assertion: ${assertion}` : ''}); raw output withheld`);
  }
  return (result.stdout ?? '').trim();
}
function sql(db, input, user = 'supabase_admin', stage = 'SQL') {
  return docker(['exec', '-i', '-u', '0', container, 'psql', '-X', '-qAt', '-h', '/tmp', '-U', user, '-d', db, '-v', 'ON_ERROR_STOP=1', '-f', '-'], `\\set VERBOSITY sqlstate\n${input}`, stage);
}
function schemaDump(db, schemas) {
  return docker(['exec', '-u', '0', container, 'pg_dump', '-h', '/tmp',
    '-U', 'supabase_admin', '-d', db, '--schema-only',
    ...schemas.map((schema) => `--schema=${schema}`)], undefined, 'schema-only dump')
    .replace(/^\\(?:un)?restrict [^\n]+(?:\n|$)/gmu, '');
}
function isolated() {
  if (!/^"none" (null|\{\})\s*$/u.test(docker(['inspect', '--format', '{{json .HostConfig.NetworkMode}} {{json .HostConfig.PortBindings}}', container]))) {
    throw new Error('Network-none container without published ports required');
  }
}

let created = false;
try {
  docker(['run', '-d', '--pull=never', '--name', container, '--network', 'none', '--restart', 'no', '--user', 'postgres',
    '--tmpfs', '/tmp:rw,mode=1777', '--tmpfs', '/var/lib/postgresql/data:rw,uid=100,gid=101,mode=700',
    '--label', 'rights.synthetic=true',
    '--entrypoint', 'sh', POSTGRES_IMAGE, '-c',
    "initdb -D /var/lib/postgresql/data/managed -U supabase_admin --auth-local=trust --auth-host=reject --locale-provider=icu --icu-locale=en-US --locale=en_US.UTF-8 >/tmp/init.log 2>&1 && exec postgres -D /var/lib/postgresql/data/managed -k /tmp -c listen_addresses='' -c shared_preload_libraries='' -c max_worker_processes=0 -c max_parallel_workers=0 -c max_logical_replication_workers=0 -c autovacuum=off -c logging_collector=off"], undefined, 'fresh cluster');
  created = true;
  for (let attempt = 0; attempt < 2; attempt++) {
    await new Promise((done) => setTimeout(done, 3000));
    const ready = spawnSync('docker', ['exec', container, 'pg_isready', '-h', '/tmp', '-U', 'supabase_admin'], { encoding: 'utf8' });
    if (ready.status === 0) break;
    if (attempt === 1) throw new Error('Fresh cluster did not become ready');
  }
  isolated();
  // Mirror the managed role limits. See create-policies-on-managed-auth-users.adr.md.
  sql('postgres', `${file('tests/database/managed-roles.sql')}
    CREATE DATABASE ${database} OWNER postgres TEMPLATE template0;`, 'supabase_admin', 'roles');
  sql(database, file('tests/database/auth-bootstrap.sql'), 'supabase_admin', 'auth bootstrap');
  sql(database, `\\set VERBOSITY verbose\n${file('supabase/check-auth-contract.sql')}`, 'postgres', 'auth contract');
  sql(database, file('tests/database/legacy-public-schema.sql'), 'supabase_admin', 'legacy schema');
  sql(database, file('tests/database/legacy-seed.sql'), 'supabase_admin', 'legacy seed');
  const prerequisites = sql(database, `SELECT jsonb_build_object(
    'principal',current_user,'superuser',(SELECT rolsuper FROM pg_roles WHERE rolname=current_user),
    'createrole',(SELECT rolcreaterole FROM pg_roles WHERE rolname=current_user),
    'bypassrls',(SELECT rolbypassrls FROM pg_roles WHERE rolname=current_user),
    'authOwner',(SELECT relowner::regrole::text FROM pg_class WHERE oid='auth.users'::regclass),
    'select',has_table_privilege(current_user,'auth.users','SELECT'),
    'references',has_column_privilege(current_user,'auth.users','id','REFERENCES'),
    'usage',has_schema_privilege(current_user,'auth','USAGE'),
    'setAuthAdmin',pg_has_role(current_user,'supabase_auth_admin','SET'),
    'setSupabaseAdmin',pg_has_role(current_user,'supabase_admin','SET'),
    'executorAbsent',NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='rights_executor'));`, 'postgres', 'principal prerequisites');
  const baseline = JSON.parse(prerequisites);
  if (baseline.principal !== 'postgres' || baseline.superuser || !baseline.createrole || !baseline.bypassrls
    || baseline.authOwner === 'postgres' || !baseline.select || !baseline.references || !baseline.usage
    || baseline.setAuthAdmin || baseline.setSupabaseAdmin || !baseline.executorAbsent) {
    throw new Error('Managed-principal prerequisites failed');
  }
  const authBefore = schemaDump(database, ['auth']);
  const principal = "SELECT to_jsonb(r) FROM pg_roles r WHERE rolname='postgres';";
  const principalBefore = sql(database, principal);
  sql(database, `DO $$ BEGIN
    BEGIN
      CREATE POLICY rights_negative_probe ON auth.users FOR SELECT TO postgres USING (true);
      RAISE EXCEPTION 'Expected auth.users CREATE POLICY to fail with 42501';
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
  END $$;`, 'postgres', 'managed auth policy denial');
  sql(database, file('tests/database/preservation.sql'), 'postgres', 'preservation snapshot');
  // Guard itself needs a superuser (event triggers); it only *asserts* the
  // migration DDL below runs as the managed postgres principal.
  sql(database, `CREATE SCHEMA rights_principal_guard;
    CREATE FUNCTION rights_principal_guard.check_ddl() RETURNS event_trigger LANGUAGE plpgsql AS $$ BEGIN
      -- Collapse replaces executor-owned private RPCs via transient
      -- SET ROLE rights_executor; session_user must stay the managed
      -- NOSUPERUSER postgres throughout.
      IF session_user<>'postgres' OR (SELECT rolsuper FROM pg_roles WHERE rolname=session_user)
        OR current_user NOT IN ('postgres','rights_executor') THEN
        RAISE EXCEPTION 'Migration left managed postgres principal';
      END IF;
    END $$;
    CREATE EVENT TRIGGER rights_principal_guard ON ddl_command_start EXECUTE FUNCTION rights_principal_guard.check_ddl();`, 'supabase_admin', 'ddl guard');
  for (const entry of chain) {
    sql(database, entry.sql, 'postgres', `managed migration ${entry.file}`);
  }
  sql(database, 'DROP EVENT TRIGGER rights_principal_guard; DROP SCHEMA rights_principal_guard CASCADE;', 'supabase_admin', 'guard cleanup');
  if (schemaDump(database, ['auth']) !== authBefore || sql(database, principal) !== principalBefore) {
    throw new Error('Managed migrations changed the Auth schema or postgres role attributes');
  }
  // Preservation check reads executor-owned ballots; like the other runners
  // it executes as the superuser without printing rows.
  sql(database, `\\set VERBOSITY verbose\n${file('tests/database/preservation-check.sql')}`, 'supabase_admin', 'preservation check');
  const mapping = sql(database, `SELECT jsonb_build_object(
    'processing',(SELECT count(*) FROM public.proposals WHERE status='處理中'),
    'closed',(SELECT count(*) FROM public.proposals WHERE status='已結案'),
    'pending',(SELECT count(*) FROM public.proposals WHERE status='待審核'),
    'returned',(SELECT count(*) FROM public.proposals WHERE status='被退回'),
    'legacy',(SELECT count(*) FROM public.proposals WHERE status IN ('研議中','通過','已採納','不採納')));`, 'postgres', 'mapping counts');
  const counts = JSON.parse(mapping);
  if (counts.legacy !== 0 || counts.processing < 2 || counts.closed < 2 || counts.pending < 1 || counts.returned < 1) {
    throw new Error('Exact status mapping counts failed');
  }
  sql(database, file('tests/database/managed-principal.sql'), 'supabase_admin', 'post-migration effective privileges');
  sql(database, `\\set VERBOSITY verbose\nBEGIN;\n${file('tests/database/regression.sql')}\nCOMMIT;`, 'supabase_admin', 'full SQL regression');
  sql(database, file('tests/database/queues.sql'), 'supabase_admin', 'filtered queue totals and gating');
  await checkConcurrency(container, database, sql);
  writeFileSync(resolve(root, 'tests/database/verification-collapse.json'), `${JSON.stringify({
    command: 'node scripts/database/collapse-gate.mjs', container, database, image: POSTGRES_IMAGE,
    migrations: chain.map((entry) => ({ file: entry.file, sha256: entry.sha256 })),
    prerequisites: baseline, mappingCounts: counts,
    passed: ['managed-principal', 'auth-contract', 'whole-chain', 'legacy-objects-absent', 'preservation-exact-mapping', 'effective-privilege-cleanup', 'full-sql-regression', 'multi-connection-creates', 'multi-connection-votes'],
    completedAt: new Date().toISOString(), productionConnection: false, recoveredRowsOutput: false,
  }, null, 2)}\n`);
  console.log('PASS: portable NOSUPERUSER postgres whole-chain collapse gate with cleanup and full SQL regression');
} finally {
  if (created) docker(['rm', '-f', '-v', container], undefined, 'fresh cluster cleanup');
}
