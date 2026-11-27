BEGIN;
SET LOCAL lock_timeout = '10s';
SET LOCAL search_path = '';

-- Temporarily assume the schema owner to allow construction by managed
-- postgres, then replace the executor-owned functions without moving owners.
DO $$
BEGIN
  IF NOT (SELECT rolsuper FROM pg_catalog.pg_roles WHERE rolname=current_user) THEN
    EXECUTE pg_catalog.format('GRANT rights_executor TO %I WITH SET TRUE, INHERIT TRUE',current_user);
  END IF;
END $$;
SET ROLE rights_executor;
GRANT CREATE ON SCHEMA rights_private TO postgres;
RESET ROLE;

-- Auth stays owned by Supabase. Return only the current caller's UUID when
-- both claims match an active session. Never grant the executor Auth SELECT.
CREATE FUNCTION rights_private.live_session_user() RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  WITH claims AS (
    SELECT NULLIF(pg_catalog.current_setting('request.jwt.claims',true),'')::jsonb AS jwt
  )
  SELECT s.user_id
  FROM auth.sessions AS s CROSS JOIN claims
  WHERE s.id=CASE WHEN pg_catalog.pg_input_is_valid(jwt->>'session_id','pg_catalog.uuid')
                  THEN (jwt->>'session_id')::uuid END
    AND s.user_id=COALESCE(NULLIF(pg_catalog.current_setting('request.jwt.claim.sub',true),''),
                          jwt->>'sub')::uuid
    AND (s.not_after IS NULL OR s.not_after>pg_catalog.statement_timestamp())
$$;
ALTER FUNCTION rights_private.live_session_user() OWNER TO postgres;
REVOKE ALL ON FUNCTION rights_private.live_session_user() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION rights_private.live_session_user() TO rights_executor;

SET ROLE rights_executor;
CREATE OR REPLACE FUNCTION rights_private.actor(p_admin boolean DEFAULT false) RETURNS uuid
LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE u uuid := rights_private.live_session_user(); e text;
BEGIN
  IF u IS NULL THEN RAISE SQLSTATE 'PT401' USING MESSAGE='Authentication required'; END IF;
  SELECT pg_catalog.lower(pg_catalog.btrim(email, E' \t\n\r\v\f' || U&'\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF'))
    INTO e FROM rights_private.user_identity(u) WHERE email_confirmed_at IS NOT NULL
    AND deleted_at IS NULL AND is_anonymous IS NOT TRUE
    AND (banned_until IS NULL OR banned_until<=pg_catalog.now());
  IF e IS NULL OR e !~ '^[^@[:space:]]+@nehs[.]hc[.]edu[.]tw$' THEN
    RAISE SQLSTATE 'PT403' USING MESSAGE='School identity required';
  END IF;
  IF p_admin AND NOT EXISTS (SELECT 1 FROM public.admins WHERE email=e) THEN
    RAISE SQLSTATE 'PT403' USING MESSAGE='Administrator required';
  END IF;
  RETURN u;
END $$;

CREATE OR REPLACE FUNCTION rights_private.project(p_kind text,p_row jsonb) RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE j jsonb;
BEGIN
  j:=pg_catalog.jsonb_build_object('id',p_row->'id','content',p_row->'content','created_at',p_row->'created_at','version',p_row->'content_version');
  IF p_kind='comment' THEN
    RETURN j||pg_catalog.jsonb_build_object('proposal_id',p_row->'proposal_id','author_name',
      CASE WHEN (p_row->>'is_anonymous')::boolean IS NOT FALSE THEN '匿名學生' ELSE COALESCE(p_row->>'author_name','匿名學生') END);
  END IF;
  j:=j||pg_catalog.jsonb_build_object('title',p_row->'title');
  IF p_kind='home' THEN RETURN j; END IF;
  j:=j||pg_catalog.jsonb_build_object('reply',p_row->'reply');
  IF p_kind='feedback' THEN
    j:=j||pg_catalog.jsonb_build_object('category',p_row->'category','is_anonymous',COALESCE((p_row->>'is_anonymous')::boolean,true),'replied_at',p_row->'replied_at');
    IF (p_row->>'is_anonymous')::boolean IS FALSE THEN
      j:=j||pg_catalog.jsonb_build_object('author_name',COALESCE(p_row->>'author_name','匿名學生'));
    END IF;
    RETURN j;
  END IF;
  RETURN j||pg_catalog.jsonb_build_object('status',p_row->'status','author_name',
    CASE WHEN (p_row->>'is_anonymous')::boolean IS NOT FALSE THEN '匿名學生' ELSE COALESCE(p_row->>'author_name','匿名學生') END,
    'upvotes_count',rights_private.total((p_row->>'id')::uuid,(p_row->>'legacy_upvotes_count')::bigint),
    'legacy_upvotes_count',p_row->'legacy_upvotes_count','viewer_voted',EXISTS (
      SELECT 1 FROM rights_private.proposal_ballots WHERE proposal_id=(p_row->>'id')::uuid
        AND user_id=(SELECT rights_private.live_session_user())));
END $$;

REVOKE CREATE ON SCHEMA rights_private FROM postgres;
RESET ROLE;
DO $$
BEGIN
  IF NOT (SELECT rolsuper FROM pg_catalog.pg_roles WHERE rolname=current_user) THEN
    EXECUTE pg_catalog.format('REVOKE rights_executor FROM %I GRANTED BY %I',current_user,current_user);
  END IF;
END $$;
NOTIFY pgrst, 'reload schema';
COMMIT;
