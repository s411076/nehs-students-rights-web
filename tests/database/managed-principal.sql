CREATE SCHEMA rights_principal_test;
CREATE FUNCTION rights_principal_test.assert(p_ok boolean,p_label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF p_ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'Principal assertion: %',p_label; END IF; END $$;
CREATE FUNCTION rights_principal_test.throws(p_sql text,p_state text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE caught text;
BEGIN
  BEGIN EXECUTE p_sql; EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS caught=RETURNED_SQLSTATE; END;
  IF caught IS DISTINCT FROM p_state THEN RAISE EXCEPTION 'Expected SQLSTATE %, got %',p_state,coalesce(caught,'success'); END IF;
END $$;
GRANT USAGE ON SCHEMA rights_principal_test TO postgres,anon,authenticated,rights_executor;

SET SESSION AUTHORIZATION postgres;
SELECT rights_principal_test.assert(current_user='postgres' AND session_user='postgres','actual managed principal');
SELECT rights_principal_test.assert(NOT (SELECT rolsuper FROM pg_roles WHERE rolname=current_user),'not superuser');
SELECT rights_principal_test.assert(NOT pg_has_role('postgres','rights_executor','SET') AND NOT pg_has_role('postgres','rights_executor','USAGE'),'temporary SET and INHERIT removed');
SELECT rights_principal_test.assert(NOT has_schema_privilege('postgres','rights_private','CREATE'),'temporary private CREATE removed');
SELECT rights_principal_test.assert(NOT EXISTS (
  SELECT 1 FROM pg_auth_members WHERE roleid='rights_executor'::regrole AND
    (member<>'postgres'::regrole OR NOT admin_option OR set_option OR inherit_option)
),'at most creator ADMIN-only membership');
SELECT rights_principal_test.throws('SET ROLE rights_executor','42501');
SELECT rights_principal_test.throws('SET ROLE supabase_auth_admin','42501');
SELECT rights_principal_test.throws('SET ROLE supabase_admin','42501');
RESET SESSION AUTHORIZATION;

SET SESSION AUTHORIZATION rights_executor;
SELECT rights_principal_test.throws('SET ROLE postgres','42501');
SELECT rights_principal_test.throws('SELECT email FROM auth.users','42501');
SELECT rights_principal_test.throws('CREATE TABLE public.rights_principal_probe(id integer)','42501');
RESET SESSION AUTHORIZATION;
SET SESSION AUTHORIZATION anon;
SELECT rights_principal_test.throws('SET ROLE rights_executor','42501');
SELECT rights_principal_test.throws('SELECT * FROM rights_private.user_identity(NULL)','42501');
RESET SESSION AUTHORIZATION;
SET SESSION AUTHORIZATION authenticated;
SELECT rights_principal_test.throws('SET ROLE rights_executor','42501');
SELECT rights_principal_test.throws('SELECT * FROM rights_private.user_identity(NULL)','42501');
RESET SESSION AUTHORIZATION;
DROP SCHEMA rights_principal_test CASCADE;
