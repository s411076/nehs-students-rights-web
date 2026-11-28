-- Run unchanged in psql or in the Supabase SQL Editor before migrations.
-- Checks the role named postgres even if the SQL editor uses another role.
-- Reads system catalogs only; Auth user and session rows are never queried.
DO $auth_contract$
DECLARE
  required record;
  object_id oid;
  object_owner oid;
  column_number smallint;
  uid_column smallint;
  auth_schema oid := to_regnamespace('auth');
BEGIN
  IF NOT EXISTS (
    SELECT FROM pg_roles WHERE rolname = 'postgres' AND NOT rolsuper AND rolcreaterole AND rolbypassrls
  ) THEN
    RAISE EXCEPTION 'Auth contract: postgres must be NOSUPERUSER with CREATEROLE and BYPASSRLS';
  END IF;

  FOR required IN SELECT unnest(ARRAY['supabase_auth_admin', 'supabase_admin']) AS role_name LOOP
    IF to_regrole(required.role_name) IS NULL OR pg_has_role('postgres', required.role_name, 'SET') THEN
      RAISE EXCEPTION 'Auth contract: role % must exist and postgres must not be able to SET ROLE to it', required.role_name;
    END IF;
  END LOOP;

  IF auth_schema IS NULL OR NOT has_schema_privilege('postgres', auth_schema, 'USAGE') THEN
    RAISE EXCEPTION 'Auth contract: postgres needs USAGE on schema auth';
  END IF;
  IF EXISTS (
    SELECT FROM pg_namespace WHERE oid = auth_schema
      AND (pg_has_role('postgres', nspowner, 'USAGE') OR pg_has_role('postgres', nspowner, 'SET'))
  ) THEN
    RAISE EXCEPTION 'Auth contract: postgres must not have owner privileges on schema auth';
  END IF;

  -- rights_private.user_identity(uuid), rights_private.live_session_user(),
  -- and the foreign keys to auth.users(id).
  FOR required IN
    SELECT * FROM (VALUES
      ('users', 'id', ARRAY['uuid'::regtype]),
      ('users', 'email', ARRAY['text'::regtype, 'varchar'::regtype]),
      ('users', 'email_confirmed_at', ARRAY['timestamptz'::regtype]),
      ('users', 'banned_until', ARRAY['timestamptz'::regtype]),
      ('users', 'deleted_at', ARRAY['timestamptz'::regtype]),
      ('users', 'is_anonymous', ARRAY['boolean'::regtype]),
      ('users', 'raw_user_meta_data', ARRAY['jsonb'::regtype]),
      ('sessions', 'id', ARRAY['uuid'::regtype]),
      ('sessions', 'user_id', ARRAY['uuid'::regtype]),
      ('sessions', 'not_after', ARRAY['timestamptz'::regtype])
    ) AS columns(table_name, column_name, allowed_types)
  LOOP
    SELECT oid, relowner INTO object_id, object_owner
    FROM pg_class WHERE relnamespace = auth_schema AND relname = required.table_name AND relkind IN ('r', 'p');
    IF object_id IS NULL THEN
      RAISE EXCEPTION 'Auth contract: missing table auth.%', required.table_name;
    END IF;
    IF pg_has_role('postgres', object_owner, 'USAGE') OR pg_has_role('postgres', object_owner, 'SET') THEN
      RAISE EXCEPTION 'Auth contract: postgres must not have owner privileges on auth.%', required.table_name;
    END IF;
    SELECT attnum INTO column_number FROM pg_attribute
    WHERE attrelid = object_id AND attname = required.column_name AND NOT attisdropped
      AND atttypid = ANY(required.allowed_types);
    IF column_number IS NULL THEN
      RAISE EXCEPTION 'Auth contract: missing or incompatible column auth.%.% (expected %)',
        required.table_name, required.column_name, required.allowed_types;
    END IF;
    IF NOT has_column_privilege('postgres', object_id, column_number, 'SELECT') THEN
      RAISE EXCEPTION 'Auth contract: postgres needs SELECT on auth.%.%', required.table_name, required.column_name;
    END IF;
    IF required.table_name = 'users' AND required.column_name = 'id' THEN
      uid_column := column_number;
      IF NOT has_column_privilege('postgres', object_id, uid_column, 'REFERENCES') OR NOT EXISTS (
        SELECT FROM pg_index WHERE indrelid = object_id AND indisunique AND indisvalid AND indimmediate
          AND indpred IS NULL AND indnkeyatts = 1 AND indkey[0] = uid_column
      ) THEN
        RAISE EXCEPTION 'Auth contract: auth.users(id) must be a foreign-key target and postgres needs REFERENCES';
      END IF;
    END IF;
  END LOOP;

  -- Retained public-table policies use these routines. Identity helpers read
  -- request claims directly and do not grant rights_executor access to Auth.
  FOR required IN
    SELECT * FROM (VALUES ('uid', 'uuid'::regtype), ('role', 'text'::regtype), ('jwt', 'jsonb'::regtype))
      AS routines(function_name, result_type)
  LOOP
    SELECT oid INTO object_id FROM pg_proc
    WHERE pronamespace = auth_schema AND proname = required.function_name AND pronargs = 0
      AND prokind = 'f' AND NOT proretset AND prorettype = required.result_type;
    IF object_id IS NULL THEN
      RAISE EXCEPTION 'Auth contract: missing or incompatible auth.%() (expected %)',
        required.function_name, required.result_type;
    END IF;
    IF NOT has_function_privilege('postgres', object_id, 'EXECUTE') THEN
      RAISE EXCEPTION 'Auth contract: postgres needs EXECUTE on auth.%()', required.function_name;
    END IF;
  END LOOP;
  RAISE NOTICE 'Auth contract passed';
END
$auth_contract$;
