import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { credentials, sessionId, users } from './identities.mjs';
import { POSTGRES_IMAGE, verifyMigrationChain } from '../database/migrations.mjs';

const restImage = 'postgrest/postgrest:v16.4@sha256:d155c6718ed9a9f990d159a2ab7c0a3f16944dbb6d0a0344557421042acfe0df';
const fixture = (name) => readFileSync(new URL(`../../tests/database/${name}`, import.meta.url), 'utf8');
const docker = (args, input) => execFileSync('docker', args, {
  input, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, timeout: 120000,
});
const sql = (container, query, user = 'supabase_admin', database = 'fixture') =>
  docker(['exec', '-i', container, 'psql', '-h', '/tmp',
    '-U', user, '-d', database, '-X', '-v', 'ON_ERROR_STOP=1'], query);
const [command, statePath, ...expectedHashes] = process.argv.slice(2);

if (command === 'up') {
  const dir = mkdtempSync(join(tmpdir(), 'rights-real-'));
  const prefix = `rights-real-${randomBytes(5).toString('hex')}`;
  const state = { prefix, db: `${prefix}-db`, rest: `${prefix}-rest`, network: `${prefix}-net`,
    dir, pgImage: POSTGRES_IMAGE, restImage, mode: 'baseline' };
  const secret = randomBytes(48).toString('hex');
  docker(['network', 'create', '--internal', '--label', 'rights.synthetic=true', state.network]);
  docker(['run', '-d', '--name', state.db, '--label', 'rights.synthetic=true',
    '--network', state.network, '--network-alias', 'db', '--user', 'postgres',
    '--tmpfs', '/var/lib/postgresql/data:rw,uid=100,gid=101',
    '--entrypoint', '/bin/sh', POSTGRES_IMAGE, '-c',
    `initdb -D /var/lib/postgresql/data/fixture -U supabase_admin --auth-local=trust --auth-host=scram-sha-256 --locale-provider=icu --icu-locale=en-US --locale=en_US.UTF-8 && printf '\\nhost fixture authenticator all scram-sha-256\\n' >> /var/lib/postgresql/data/fixture/pg_hba.conf && exec postgres -D /var/lib/postgresql/data/fixture -k /tmp -c listen_addresses='*' -c shared_preload_libraries='' -c max_worker_processes=0 -c max_parallel_workers=0 -c max_logical_replication_workers=0 -c autovacuum=off -c logging_collector=off`]);
  // Bounded readiness, not a background migration watcher.
  execFileSync('docker', ['exec', state.db, '/bin/sh', '-c',
    'for i in $(seq 1 60); do pg_isready -h /tmp -U supabase_admin && exit 0; sleep 1; done; exit 1'], { timeout: 65000 });
  sql(state.db, `${fixture('managed-roles.sql')}\nCREATE DATABASE fixture OWNER postgres TEMPLATE template0;`,
    'supabase_admin', 'postgres');
  sql(state.db, fixture('auth-bootstrap.sql'));
  sql(state.db, fixture('legacy-public-schema.sql'));
  sql(state.db, `CREATE ROLE authenticator LOGIN NOINHERIT PASSWORD '${secret}';
    GRANT anon, authenticated TO authenticator;
    ALTER ROLE anon SET statement_timeout='5s';
    ALTER ROLE authenticated SET statement_timeout='5s';`);
  for (const user of Object.values(users)) {
    sql(state.db, `INSERT INTO auth.users(id,email,email_confirmed_at,raw_user_meta_data)
      VALUES ('${user.id}','${user.email}',
      ${user.email_confirmed_at ? `'${user.email_confirmed_at}'` : 'NULL'},
      '${JSON.stringify(user.user_metadata)}');
      INSERT INTO auth.sessions(id,user_id) VALUES ('${sessionId(user)}','${user.id}');`);
  }
  sql(state.db, `INSERT INTO public.admins(email) VALUES ('${users.admin.email}');
    INSERT INTO public.proposals(id,user_id,title,content,status,author_name,author_email,upvotes_count)
    VALUES ('20000000-0000-4000-8000-000000000001','${users.studentA.id}',
    'Synthetic baseline proposal','Synthetic body','處理中','Synthetic studentA','${users.studentA.email}',7);`);
  state.tokens = credentials(secret);
  sql(state.db, `CREATE FUNCTION public.synthetic_request_identity() RETURNS jsonb
    LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS
    $$ SELECT jsonb_build_object('uid',auth.uid(),'role',current_user) $$;
    REVOKE ALL ON FUNCTION public.synthetic_request_identity() FROM PUBLIC;
    GRANT EXECUTE ON FUNCTION public.synthetic_request_identity() TO anon, authenticated;`);
  docker(['run', '-d', '--name', state.rest, '--label', 'rights.synthetic=true',
    '--network', state.network, '--network-alias', 'rest',
    '-e', `PGRST_DB_URI=postgres://authenticator:${secret}@db:5432/fixture`,
    '-e', 'PGRST_DB_ANON_ROLE=anon', '-e', 'PGRST_DB_SCHEMAS=public',
    '-e', 'PGRST_DB_CONFIG=false',
    '-e', 'PGRST_DB_POOL=5', '-e', 'PGRST_DB_MAX_ROWS=100',
    '-e', 'PGRST_JWT_AUD=authenticated', '-e', `PGRST_JWT_SECRET=${secret}`,
    '-e', 'PGRST_JWT_CACHE_MAX_ENTRIES=0', '-e', 'GHCRTS=-N2', restImage]);
  // Docker 29 internal bridges suppress published ports. Gateway uses curl HTTP
  // inside our DB container, preserving network isolation without a second network.
  state.postgrestUrl = 'http://rest:3000';
  writeFileSync(join(dir, 'state.json'), JSON.stringify(state, null, 2), { mode: 0o600 });
  console.log(`POSTGREST=${state.postgrestUrl}\nSTATE=${join(dir, 'state.json')}`);
} else {
  const state = JSON.parse(readFileSync(statePath, 'utf8'));
  if (!/^rights-real-[a-f0-9]{10}$/.test(state.prefix)
    || state.db !== `${state.prefix}-db` || state.rest !== `${state.prefix}-rest`
    || state.network !== `${state.prefix}-net`) throw new Error('Not an owned synthetic stack');
  for (const name of [state.db, state.rest]) {
    if (docker(['inspect', '-f', '{{index .Config.Labels "rights.synthetic"}}', name]).trim() !== 'true') {
      throw new Error('Missing synthetic ownership label');
    }
  }
  switch (command) {
    case 'down':
      docker(['rm', '-f', '-v', state.rest, state.db]);
      docker(['network', 'rm', state.network]);
      break;
    case 'apply': {
      if (state.mode !== 'baseline' || !state.baselinePassed) throw new Error('Run baseline HTTP tests first');
      const chain = verifyMigrationChain(resolve('.'), path => readFileSync(path, 'utf8'), expectedHashes);
      for (const entry of chain) sql(state.db, entry.sql, 'postgres');
      sql(state.db, "NOTIFY pgrst, 'reload schema';");
      state.mode = 'hardened';
      state.migrations = chain.map(({ file, sha256 }) => ({ file, sha256 }));
      writeFileSync(statePath, JSON.stringify(state, null, 2), { mode: 0o600 });
      console.log(`Applied ${chain.length} migrations to synthetic fixture only. Run hardened HTTP tests.`);
      break;
    }
    default: throw new Error('Usage: node scripts/local-stack/stack.mjs up | down STATE | apply STATE SHA256...');
  }
}
