-- Filtered queues with accurate totals: separate read API, old Page RPCs untouched.
-- Local files only; never apply to prod/staging from this task.
-- public.rights_queue_page(p_kind,p_filter,p_limit,p_cursor,p_query) returns
-- {items,nextCursor,total,counts} where counts covers every query-matched row
-- before the selected filter/cursor/limit, and total=counts[filter], so pages
-- stay accurate even when a page is empty. Counts and items are computed in one
-- STABLE definer call (single snapshot). Awaiting/pending order oldest-first
-- (created_at,id ASC); all other queues newest-first (DESC). Cursor keeps
-- native microsecond precision. Empty reply stays reply='' (whitespace is
-- nonempty per existing contract). Pending requires the strict admin actor
-- check; public queues never count or return 待審核 rows.
BEGIN;
SET LOCAL lock_timeout = '10s';
SET LOCAL search_path = '';

-- Managed-principal execution: same transient pattern as the hardening
-- cutover and status collapse. PG17 gives a CREATEROLE creator ADMIN only,
-- not SET/INHERIT, so construction needs this grant. It is revoked before
-- commit (never the reverse). No permanent grant, no BYPASSRLS change.
DO $$
BEGIN
  IF NOT (SELECT rolsuper FROM pg_catalog.pg_roles WHERE rolname=current_user) THEN
    EXECUTE pg_catalog.format('GRANT rights_executor TO %I WITH SET TRUE, INHERIT TRUE',current_user);
  END IF;
END $$;

-- The new public wrapper below is created by the migration principal, so the
-- executor needs transient CREATE on public for the ownership transfer (same
-- pattern as the hardening cutover); revoked before commit.
GRANT CREATE ON SCHEMA public TO rights_executor;
SET ROLE rights_executor;
CREATE OR REPLACE FUNCTION rights_private.queue_page(p_kind text,p_filter text,p_limit integer,p_cursor jsonb,p_query text) RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE t text; proj text; sel text; direction text:='DESC'; cmp text:='<'; stamp timestamptz; ident uuid;
  r record; items jsonb:='[]'; next_cursor jsonb:=NULL; last_cursor jsonb; n integer:=0; q text;
  c_all bigint; c_a bigint; c_b bigint; total bigint; counts jsonb; cond text;
BEGIN
  IF p_kind IS NULL OR p_filter IS NULL OR p_limit IS NULL OR p_query IS NULL THEN
    RAISE SQLSTATE 'PT400' USING MESSAGE='Null argument';
  END IF;
  IF p_limit NOT BETWEEN 1 AND 50 THEN RAISE SQLSTATE 'PT400' USING MESSAGE='Invalid limit'; END IF;
  q:=rights_private.text_value(p_query,100,true);
  IF p_cursor IS NOT NULL THEN
    IF pg_catalog.jsonb_typeof(p_cursor)<>'object' OR NOT (p_cursor ?& ARRAY['created_at','id'])
      OR (p_cursor-ARRAY['created_at','id'])<>'{}'::jsonb
      OR pg_catalog.jsonb_typeof(p_cursor->'created_at')<>'string' OR pg_catalog.jsonb_typeof(p_cursor->'id')<>'string'
      OR (p_cursor->>'created_at') !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$' THEN
      RAISE SQLSTATE 'PT400' USING MESSAGE='Invalid cursor';
    END IF;
    BEGIN
      stamp:=(p_cursor->>'created_at')::timestamptz; ident:=(p_cursor->>'id')::uuid;
      IF NOT pg_catalog.isfinite(stamp) THEN RAISE SQLSTATE 'PT400' USING MESSAGE='Invalid cursor'; END IF;
    EXCEPTION WHEN invalid_text_representation OR datetime_field_overflow OR invalid_datetime_format THEN
      RAISE SQLSTATE 'PT400' USING MESSAGE='Invalid cursor';
    END;
  END IF;
  CASE p_kind
    WHEN 'feedback' THEN
      t:='feedback'; proj:='feedback';
      IF p_filter='all' THEN sel:='true';
      ELSIF p_filter='awaiting' THEN sel:='reply='''''; direction:='ASC'; cmp:='>';
      ELSIF p_filter='replied' THEN sel:='reply<>''''';
      ELSE RAISE SQLSTATE 'PT400' USING MESSAGE='Invalid filter';
      END IF;
    WHEN 'proposal' THEN
      t:='proposals'; proj:='proposal';
      IF p_filter='all' THEN sel:='status IN (''處理中'',''已結案'')';
      ELSIF p_filter='processing' THEN sel:='status=''處理中''';
      ELSIF p_filter='closed' THEN sel:='status=''已結案''';
      ELSE RAISE SQLSTATE 'PT400' USING MESSAGE='Invalid filter';
      END IF;
    WHEN 'pending' THEN
      PERFORM rights_private.actor(true);
      t:='proposals'; proj:='proposal';
      IF p_filter<>'pending' THEN RAISE SQLSTATE 'PT400' USING MESSAGE='Invalid filter'; END IF;
      sel:='status=''待審核'''; direction:='ASC'; cmp:='>';
    ELSE RAISE SQLSTATE 'PT400' USING MESSAGE='Invalid kind';
  END CASE;
  -- Population counts are query-matched BEFORE the selected filter/cursor/limit.
  IF p_kind='pending' THEN
    EXECUTE pg_catalog.format('SELECT count(*) FROM public.%I WHERE (%s) AND ($1='''' OR strpos(lower(title),lower($1))>0 OR strpos(lower(content),lower($1))>0)',t,sel)
      INTO c_all USING q;
    total:=c_all;
    counts:=pg_catalog.jsonb_build_object('pending',c_all);
  ELSE
    EXECUTE pg_catalog.format('SELECT count(*) FILTER (WHERE %s), count(*) FILTER (WHERE %s), count(*) FILTER (WHERE %s) FROM public.%I WHERE ($1='''' OR strpos(lower(title),lower($1))>0 OR strpos(lower(content),lower($1))>0)',
      CASE WHEN p_kind='feedback' THEN 'true' ELSE 'status IN (''處理中'',''已結案'')' END,
      CASE WHEN p_kind='feedback' THEN 'reply=''''' ELSE 'status=''處理中''' END,
      CASE WHEN p_kind='feedback' THEN 'reply<>''''' ELSE 'status=''已結案''' END,t)
      INTO c_all,c_a,c_b USING q;
    IF p_filter IN ('all') THEN total:=c_all;
    ELSIF p_filter IN ('awaiting','processing') THEN total:=c_a;
    ELSE total:=c_b;
    END IF;
    counts:=CASE WHEN p_kind='feedback'
      THEN pg_catalog.jsonb_build_object('all',c_all,'awaiting',c_a,'replied',c_b)
      ELSE pg_catalog.jsonb_build_object('all',c_all,'processing',c_a,'closed',c_b) END;
  END IF;
  -- All filtered rows remain reachable: filter applies before keyset pagination.
  cond:=sel||' AND ($4='''' OR strpos(lower(title),lower($4))>0 OR strpos(lower(content),lower($4))>0)';
  FOR r IN EXECUTE pg_catalog.format('SELECT to_jsonb(x) AS row FROM public.%I x WHERE (%s) AND ($1 IS NULL OR (created_at,id) %s ($1,$2)) ORDER BY created_at %s,id %s LIMIT $3',t,cond,cmp,direction,direction)
    USING stamp,ident,p_limit+1,q LOOP
    n:=n+1;
    IF n>p_limit THEN next_cursor:=last_cursor; EXIT; END IF;
    items:=items||pg_catalog.jsonb_build_array(rights_private.project(proj,r.row));
    last_cursor:=pg_catalog.jsonb_build_object('created_at',r.row->'created_at','id',r.row->'id');
  END LOOP;
  RETURN pg_catalog.jsonb_build_object('items',items,'nextCursor',next_cursor,'total',total,'counts',counts);
END $$;
RESET ROLE;

-- Oldest-first awaiting queue: partial index so the ASC keyset scan stays bounded.
CREATE INDEX IF NOT EXISTS rights_feedback_awaiting_order ON public.feedback(created_at ASC,id ASC) WHERE reply='';

-- Thin, typed exposed entrypoint. Only this wrapper is callable by JWT roles;
-- the private implementation above has no application EXECUTE grant.
CREATE OR REPLACE FUNCTION public.rights_queue_page(p_kind text,p_filter text,p_limit integer DEFAULT 20,p_cursor jsonb DEFAULT NULL,p_query text DEFAULT '') RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$ SELECT rights_private.queue_page(p_kind,p_filter,p_limit,p_cursor,p_query) $$;

ALTER FUNCTION rights_private.queue_page(text,text,integer,jsonb,text) OWNER TO rights_executor;
ALTER FUNCTION public.rights_queue_page(text,text,integer,jsonb,text) OWNER TO rights_executor;
REVOKE ALL ON FUNCTION rights_private.queue_page(text,text,integer,jsonb,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.rights_queue_page(text,text,integer,jsonb,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.rights_queue_page(text,text,integer,jsonb,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rights_queue_page(text,text,integer,jsonb,text) TO anon;
REVOKE CREATE ON SCHEMA public FROM rights_executor;

-- Ownership must not drift to the migration principal. Re-asserting is
-- idempotent when the SET ROLE path above already preserved it.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE p.oid IN ('rights_private.queue_page(text,text,integer,jsonb,text)'::regprocedure,
      'public.rights_queue_page(text,text,integer,jsonb,text)'::regprocedure)
    AND p.proowner<>'rights_executor'::regrole) THEN
    RAISE EXCEPTION 'filtered queues: function owner drifted';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc WHERE oid='rights_private.user_identity(uuid)'::regprocedure
    AND proowner<>'postgres'::regrole) THEN
    RAISE EXCEPTION 'filtered queues: identity owner drifted';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='rights_executor'
    AND (rolsuper OR rolbypassrls)) THEN
    RAISE EXCEPTION 'filtered queues: executor gained superuser or bypassrls';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='rights_private' AND p.proname='queue_page'
    AND EXISTS (SELECT 1 FROM pg_catalog.aclexplode(p.proacl) WHERE grantee=0)) THEN
    RAISE EXCEPTION 'filtered queues: private EXECUTE leaked to PUBLIC';
  END IF;
END $$;

-- Remove only our own transient membership; PG17's bootstrap ADMIN-only row stays.
DO $$
BEGIN
  IF NOT (SELECT rolsuper FROM pg_catalog.pg_roles WHERE rolname=current_user) THEN
    EXECUTE pg_catalog.format('REVOKE rights_executor FROM %I GRANTED BY %I',current_user,current_user);
  END IF;
END $$;
NOTIFY pgrst, 'reload schema';
COMMIT;
