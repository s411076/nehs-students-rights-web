import { basename } from 'node:path';

export const includesMigration = (file) => `-- Includes through ${basename(file)}`;

export function buildBaseline(dump, latestMigration) {
  const schema = dump
    // The host already provides public and its own default privilege settings.
    .replace(/^--\n-- Name: public; Type: SCHEMA;[^\n]+\n--\n[\s\S]*?(?=^--\n-- Name:)/mu, '')
    .replace(/^--\n-- Name: DEFAULT PRIVILEGES FOR .+; Type: DEFAULT ACL;[^\n]+\n--\n(?:\s*ALTER DEFAULT PRIVILEGES [^\n]+)+\n*/gmu, '')
    .replace(/^--\n-- Name: SCHEMA public; Type: ACL;/mu, `-- Drop grants inherited from the host's default privileges before replaying
-- the dump's explicit grants. The guard ensures these are all app objects.
REVOKE ALL ON ALL TABLES IN SCHEMA public, rights_private FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public, rights_private FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON ALL ROUTINES IN SCHEMA public, rights_private FROM PUBLIC, anon, authenticated, service_role;

--
-- Name: SCHEMA public; Type: ACL;`);

  return `-- NEHS Student Rights schema for an empty Supabase project. Never apply to production.
${includesMigration(latestMigration)}
-- Generated from the synthetic migration-chain database with npm run check:db -- --write-baseline.
-- Run as managed postgres. This file does not seed data or change the Auth schema.
BEGIN;

DO $baseline$
BEGIN
  IF current_user <> 'postgres' THEN
    RAISE EXCEPTION 'Run the baseline as postgres';
  END IF;
  IF EXISTS (SELECT FROM pg_namespace WHERE starts_with(nspname, 'rights_'))
    OR EXISTS (SELECT FROM pg_class WHERE relnamespace = 'public'::regnamespace
      AND relkind IN ('r', 'p', 'v', 'm', 'f', 'S'))
    OR EXISTS (SELECT FROM pg_proc WHERE pronamespace = 'public'::regnamespace)
    OR to_regrole('rights_executor') IS NOT NULL
  THEN
    RAISE EXCEPTION 'The baseline requires an empty project';
  END IF;
END
$baseline$;

CREATE ROLE rights_executor NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
GRANT rights_executor TO postgres WITH SET TRUE, INHERIT TRUE;
GRANT CREATE ON SCHEMA public TO rights_executor;

${schema.trim()}

REVOKE CREATE ON SCHEMA public FROM rights_executor;
REVOKE rights_executor FROM postgres GRANTED BY postgres;
NOTIFY pgrst, 'reload schema';
COMMIT;
`;
}
