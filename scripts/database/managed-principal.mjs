import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { loadMigrationChain } from './migrations.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const source = 'database-recovery-parity-20261016';
const container = `rights-managed-${Date.now()}-${process.pid}`;
const image = 'supabase/postgres@sha256:f371b5f3f2ac0a05703f33d6e6134515fb2498cab708fb948a0aeb7481467c00';
const database = 'rights_test_managed';
const file = (path) => readFileSync(resolve(root, path), 'utf8');
const hash = (value) => createHash('sha256').update(value).digest('hex');
// Complete ordered chain from the shared manifest; never a hardcoded subset.
const chain = loadMigrationChain(root, (absolute) => readFileSync(absolute, 'utf8'));

function docker(args, input, stage = 'docker') {
  const result = spawnSync('docker', args, { input, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (result.status !== 0) {
    const state = result.stderr?.match(/ERROR:\s+([A-Z0-9]{5})/u)?.[1] ?? 'LOCAL_PROCESS';
    const line = result.stderr?.match(/psql:<stdin>:(\d+):/u)?.[1] ?? 'unknown';
    const label = stage === 'full SQL regression' ? result.stderr?.match(/ERROR:\s+P0001: Regression assertion: ([A-Za-z -]+)/u)?.[1] : undefined;
    throw new Error(`${stage} failed (${state}, input line ${line}${label ? `, assertion ${label}` : ''}); raw output withheld`);
  }
  return result.stdout.trim();
}
function sql(target, db, input, user = 'supabase_admin', stage = 'SQL') {
  return docker(['exec', '-i', '-u', '0', target, 'psql', '-X', '-qAt', '-h', '/tmp', '-U', user, '-d', db, '-v', 'ON_ERROR_STOP=1', '-f', '-'], `\\set VERBOSITY sqlstate\n${input}`, stage);
}
function isolated(target) {
  if (!/^"none" (null|\{\})\s*$/u.test(docker(['inspect', '--format', '{{json .HostConfig.NetworkMode}} {{json .HostConfig.PortBindings}}', target]))) {
    throw new Error('Network-none container without published ports required');
  }
}
const principal = `SELECT to_jsonb(r)-'oid' FROM pg_roles r WHERE rolname='postgres';`;
const authCatalog = `SELECT jsonb_build_object(
  'schema',(SELECT to_jsonb(n) FROM pg_namespace n WHERE nspname='auth'),
  'relations',(SELECT jsonb_agg(to_jsonb(c) ORDER BY c.oid) FROM pg_class c WHERE relnamespace='auth'::regnamespace),
  'columns',(SELECT jsonb_agg(to_jsonb(a) ORDER BY a.attrelid,a.attnum) FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid WHERE c.relnamespace='auth'::regnamespace),
  'policies',(SELECT jsonb_agg(to_jsonb(p) ORDER BY p.oid) FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid WHERE c.relnamespace='auth'::regnamespace),
  'functions',(SELECT jsonb_agg(to_jsonb(p) ORDER BY p.oid) FROM pg_proc p WHERE pronamespace='auth'::regnamespace),
  'constraints',(SELECT jsonb_agg(to_jsonb(c) ORDER BY c.oid) FROM pg_constraint c WHERE connamespace='auth'::regnamespace),
  'defaults',(SELECT jsonb_agg(to_jsonb(a) ORDER BY a.oid) FROM pg_default_acl a WHERE defaclnamespace='auth'::regnamespace));`;
const counts = `DO $$ DECLARE r record; n bigint; BEGIN
  CREATE TEMP TABLE rights_old_counts(name text,n bigint);
  FOR r IN SELECT c.oid,c.oid::regclass::text AS name FROM pg_class c WHERE c.relnamespace IN ('auth'::regnamespace,'public'::regnamespace) AND c.relkind='r' ORDER BY c.oid LOOP
    EXECUTE format('SELECT count(*) FROM %s',r.oid::regclass) INTO n;
    INSERT INTO rights_old_counts VALUES(r.name,n);
  END LOOP;
END $$;
SELECT jsonb_agg(to_jsonb(c) ORDER BY name) FROM rights_old_counts c;`;

isolated(source);
const sourcePrincipalBefore = hash(sql(source, 'recovery', principal));
const roles = docker(['exec', '-u', '0', source, 'pg_dumpall', '-h', '/tmp', '-U', 'supabase_admin', '--roles-only', '--no-role-passwords', '--no-comments'])
  .split('\n').filter((line) => !/\brights_executor\b/u.test(line))
  .join('\n').replace(/^CREATE ROLE supabase_admin;$/mu, '');
const schema = docker(['exec', '-u', '0', source, 'pg_dump', '-h', '/tmp', '-U', 'supabase_admin', '-d', 'recovery', '--schema-only', '--schema=auth', '--schema=public', '--no-comments'])
  .replace('CREATE SCHEMA public;', 'CREATE SCHEMA IF NOT EXISTS public;');
let created = false;
try {
  docker(['run', '-d', '--pull=never', '--name', container, '--network', 'none', '--restart', 'no', '--user', 'postgres',
    '--tmpfs', '/tmp:rw,mode=1777', '--tmpfs', '/var/lib/postgresql/data:rw,uid=100,gid=101,mode=700',
    '--entrypoint', 'sh', image, '-c',
    "initdb -D /var/lib/postgresql/data/managed -U supabase_admin --auth-local=trust --auth-host=reject --locale-provider=icu --icu-locale=en-US --locale=en_US.UTF-8 >/tmp/init.log 2>&1 && exec postgres -D /var/lib/postgresql/data/managed -k /tmp -c listen_addresses='' -c shared_preload_libraries='' -c max_worker_processes=0 -c max_parallel_workers=0 -c max_logical_replication_workers=0 -c autovacuum=off -c logging_collector=off"], undefined, 'fresh cluster');
  created = true;
  for (let attempt = 0; attempt < 2; attempt++) {
    await new Promise((done) => setTimeout(done, 3000));
    const ready = spawnSync('docker', ['exec', container, 'pg_isready', '-h', '/tmp', '-U', 'supabase_admin'], { encoding: 'utf8' });
    if (ready.status === 0) break;
    if (attempt === 1) throw new Error('Fresh cluster did not become ready');
  }
  isolated(container);
  sql(container, 'postgres', roles, undefined, 'roles-only restore');
  sql(container, 'postgres', `CREATE DATABASE ${database} OWNER postgres TEMPLATE template0;`);
  sql(container, database, schema, undefined, 'Auth/public schema-only restore');
  sql(container, database, file('tests/database/legacy-seed.sql'), undefined, 'synthetic legacy seed');
  const principalBefore = hash(sql(container, database, principal));
  if (principalBefore !== sourcePrincipalBefore) throw new Error('Managed postgres attributes differ from source');
  const prerequisites = sql(container, database, `SELECT jsonb_build_object(
    'principal',current_user,'superuser',(SELECT rolsuper FROM pg_roles WHERE rolname=current_user),
    'createrole',(SELECT rolcreaterole FROM pg_roles WHERE rolname=current_user),
    'bypassrls',(SELECT rolbypassrls FROM pg_roles WHERE rolname=current_user),
    'authOwner',(SELECT relowner::regrole::text FROM pg_class WHERE oid='auth.users'::regclass),
    'select',has_table_privilege(current_user,'auth.users','SELECT'),
    'selectGrantOption',has_table_privilege(current_user,'auth.users','SELECT WITH GRANT OPTION'),
    'references',has_column_privilege(current_user,'auth.users','id','REFERENCES'),
    'referencesGrantOption',has_column_privilege(current_user,'auth.users','id','REFERENCES WITH GRANT OPTION'),
    'setAuthAdmin',pg_has_role(current_user,'supabase_auth_admin','SET'),
    'setSupabaseAdmin',pg_has_role(current_user,'supabase_admin','SET'),
    'executorAbsent',NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='rights_executor'));`, 'postgres', 'principal prerequisites');
  const baseline = JSON.parse(prerequisites);
  if (baseline.principal !== 'postgres' || baseline.superuser || !baseline.createrole || !baseline.bypassrls || baseline.authOwner === 'postgres'
    || !baseline.select || !baseline.selectGrantOption || !baseline.references || baseline.setAuthAdmin || baseline.setSupabaseAdmin || !baseline.executorAbsent) {
    throw new Error('Fresh managed-principal prerequisites failed');
  }
  const authBefore = hash(sql(container, database, authCatalog));
  const countsBefore = hash(sql(container, database, counts));
  sql(container, database, `DO $$ DECLARE caught text; BEGIN
    BEGIN EXECUTE 'CREATE POLICY rights_negative_probe ON auth.users FOR SELECT TO postgres USING (true)';
    EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS caught=RETURNED_SQLSTATE; END;
    IF caught IS DISTINCT FROM '42501' THEN RAISE EXCEPTION 'Auth policy negative probe did not deny'; END IF;
    BEGIN EXECUTE 'SET ROLE supabase_auth_admin'; EXCEPTION WHEN insufficient_privilege THEN caught:='auth_denied'; END;
    IF caught IS DISTINCT FROM 'auth_denied' THEN RAISE EXCEPTION 'Auth owner assumption allowed'; END IF;
    BEGIN EXECUTE 'SET ROLE supabase_admin'; EXCEPTION WHEN insufficient_privilege THEN caught:='admin_denied'; END;
    IF caught IS DISTINCT FROM 'admin_denied' THEN RAISE EXCEPTION 'Superuser assumption allowed'; END IF;
  END $$;`, 'postgres', 'managed negative probes');
  sql(container, database, file('tests/database/preservation.sql'));
  sql(container, database, `CREATE SCHEMA rights_principal_guard;
    CREATE FUNCTION rights_principal_guard.check_ddl() RETURNS event_trigger LANGUAGE plpgsql AS $$ BEGIN
      -- Collapse replaces executor-owned private RPCs via transient
      -- SET ROLE rights_executor; session_user must stay the managed
      -- NOSUPERUSER postgres throughout.
      IF session_user<>'postgres' OR (SELECT rolsuper FROM pg_roles WHERE rolname=session_user)
        OR current_user NOT IN ('postgres','rights_executor') THEN
        RAISE EXCEPTION 'Migration left managed postgres principal';
      END IF;
    END $$;
    CREATE EVENT TRIGGER rights_principal_guard ON ddl_command_start EXECUTE FUNCTION rights_principal_guard.check_ddl();`);
  for (const entry of chain) {
    sql(container, database, entry.sql, 'postgres', `managed migration ${entry.file}`);
  }
  sql(container, database, 'DROP EVENT TRIGGER rights_principal_guard; DROP SCHEMA rights_principal_guard CASCADE;', undefined, 'guard cleanup');
  sql(container, database, file('tests/database/preservation-check.sql'));
  const authAfter = hash(sql(container, database, authCatalog));
  const countsAfter = hash(sql(container, database, counts));
  const principalAfter = hash(sql(container, database, principal));
  if (authBefore !== authAfter || countsBefore !== countsAfter || principalBefore !== principalAfter) throw new Error('Auth catalog, legacy counts or principal attributes changed');
  sql(container, database, file('tests/database/managed-principal.sql'), undefined, 'post-migration effective privileges');
  sql(container, database, `\\set VERBOSITY verbose\nBEGIN;\n${file('tests/database/regression.sql')}\nCOMMIT;`, undefined, 'full SQL regression');
  sql(container, database, file('tests/database/queues.sql'), undefined, 'filtered queue totals and gating');
  const sourcePrincipalAfter = hash(sql(source, 'recovery', principal));
  if (sourcePrincipalBefore !== sourcePrincipalAfter) throw new Error('Source postgres attributes changed');
  writeFileSync(resolve(root, 'tests/database/verification-managed.json'), `${JSON.stringify({
    command: 'node scripts/database/managed-principal.mjs', container, database, image,
    migrations: chain.map((entry) => ({ file: entry.file, sha256: entry.sha256 })), prerequisites: baseline,
    authCatalogSha256: { before: authBefore, after: authAfter }, legacyCountsSha256: { before: countsBefore, after: countsAfter },
    principalSha256: { before: principalBefore, after: principalAfter, sourceBefore: sourcePrincipalBefore, sourceAfter: sourcePrincipalAfter },
    passed: ['fresh-cluster-no-executor', 'postgres-nosuperuser-ddl-guard', 'auth-policy-42501', 'managed-migration', 'auth-catalog-unchanged', 'legacy-counts-preserved', 'effective-privilege-cleanup', 'full-sql-regression'],
    completedAt: new Date().toISOString(), productionConnection: false, recoveredRowsOutput: false,
  }, null, 2)}\n`);
  console.log('PASS: fresh non-superuser postgres migration, Auth catalog/count preservation, effective privileges and full SQL regressions');
} finally {
  if (created) docker(['rm', '-f', '-v', container], undefined, 'fresh cluster cleanup');
}
