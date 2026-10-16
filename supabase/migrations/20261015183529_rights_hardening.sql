-- Existing-schema cutover, NOT an initial schema. See tests/database/README.md.
-- Run once under a privileged migration principal, during write maintenance.
BEGIN;
SET LOCAL lock_timeout = '10s';
SET LOCAL search_path = '';

-- Fail rather than invent repairs for historical data or silently reset a baseline.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['admins','endorsements','feedback','feedbacks','home_sections','profiles','proposal_comments','proposals','votes'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_attribute WHERE attrelid=pg_catalog.to_regclass('public.'||t) AND attname='id' AND atttypid='uuid'::regtype) THEN
      RAISE EXCEPTION 'hardening prerequisite: UUID id missing';
    END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM public.proposals WHERE upvotes_count IS NULL OR upvotes_count<0)
    OR EXISTS (SELECT 1 FROM public.proposals WHERE created_at IS NULL)
    OR EXISTS (SELECT 1 FROM public.feedback WHERE created_at IS NULL)
    OR EXISTS (SELECT 1 FROM public.proposal_comments WHERE created_at IS NULL)
    OR EXISTS (SELECT 1 FROM public.home_sections WHERE created_at IS NULL) THEN
    RAISE EXCEPTION 'hardening prerequisite: invalid legacy count or timestamp';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='rights_executor') THEN
    CREATE ROLE rights_executor NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  ELSIF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='rights_executor'
    AND (rolcanlogin OR rolinherit OR rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls))
    OR EXISTS (SELECT 1 FROM pg_catalog.pg_auth_members WHERE roleid='rights_executor'::regrole OR member='rights_executor'::regrole) THEN
    RAISE EXCEPTION 'hardening prerequisite: executor role is not isolated';
  END IF;
END $$;
-- PG17 gives a CREATEROLE creator ADMIN only, not SET/INHERIT. Construction
-- requires both; this self-grant is removed before commit (never the reverse).
DO $$
BEGIN
  IF NOT (SELECT rolsuper FROM pg_catalog.pg_roles WHERE rolname=current_user) THEN
    EXECUTE pg_catalog.format('GRANT rights_executor TO %I WITH SET TRUE, INHERIT TRUE',current_user);
  END IF;
END $$;
CREATE SCHEMA rights_private AUTHORIZATION rights_executor;
REVOKE ALL ON SCHEMA rights_private FROM PUBLIC, anon, authenticated;
GRANT USAGE, CREATE ON SCHEMA rights_private TO postgres;
GRANT CREATE ON SCHEMA public TO rights_executor;
GRANT USAGE ON SCHEMA public TO rights_executor;
GRANT SELECT (email) ON public.admins TO rights_executor;
CREATE POLICY rights_executor_admin_lookup ON public.admins FOR SELECT TO rights_executor USING (true);

-- The managed migration principal can read Auth but does not own it. Do not
-- change Auth ACLs/policies or hand raw metadata to the executor. This is the
-- sole postgres-owned definer; eligibility belongs to actor(), not this lookup,
-- because an administrator must still identify a subsequently banned author.
CREATE FUNCTION rights_private.user_identity(p_id uuid)
RETURNS TABLE (email text,email_confirmed_at timestamptz,banned_until timestamptz,
  deleted_at timestamptz,is_anonymous boolean,display_name text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT u.email::text,u.email_confirmed_at,u.banned_until,u.deleted_at,u.is_anonymous,
    pg_catalog.left(COALESCE(NULLIF(u.raw_user_meta_data->>'full_name',''),NULLIF(u.raw_user_meta_data->>'name',''),'學生'),200)
  FROM auth.users AS u WHERE u.id=p_id LIMIT 1
$$;
ALTER FUNCTION rights_private.user_identity(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION rights_private.user_identity(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION rights_private.user_identity(uuid) TO rights_executor;

-- Freeze the nine inventoried raw surfaces, including any column-level grants.
DO $$
DECLARE t text; c record; f record;
BEGIN
  FOREACH t IN ARRAY ARRAY['admins','endorsements','feedback','feedbacks','home_sections','profiles','proposal_comments','proposals','votes'] LOOP
    EXECUTE pg_catalog.format('REVOKE ALL ON TABLE public.%I FROM PUBLIC, anon, authenticated',t);
    FOR c IN SELECT attname FROM pg_catalog.pg_attribute WHERE attrelid=pg_catalog.to_regclass('public.'||t) AND attnum>0 AND NOT attisdropped LOOP
      EXECUTE pg_catalog.format('REVOKE ALL (%I) ON public.%I FROM PUBLIC, anon, authenticated',c.attname,t);
    END LOOP;
    EXECUTE pg_catalog.format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  END LOOP;
  -- Every overload, not just the UUID signature inspected in the recovery.
  FOR f IN SELECT p.oid::regprocedure AS signature FROM pg_catalog.pg_proc p WHERE p.pronamespace='public'::regnamespace
    AND p.proname IN ('increment_endorsement','update_endorsement_count','update_proposal_endorsement_count','update_proposal_upvote_count') LOOP
    EXECUTE pg_catalog.format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated',f.signature);
  END LOOP;
END $$;
-- Verified AFTER endorsements INSERT/DELETE triggers only write obsolete counters.
-- Retain their functions and all legacy tables/columns/index constraints.
DROP TRIGGER on_endorsement_change ON public.endorsements;
DROP TRIGGER trigger_update_endorsement_count ON public.endorsements;
DROP TRIGGER trigger_update_upvote_count ON public.endorsements;

ALTER TABLE public.proposals ADD COLUMN legacy_upvotes_count bigint;
UPDATE public.proposals SET legacy_upvotes_count=upvotes_count;
ALTER TABLE public.proposals ALTER COLUMN legacy_upvotes_count SET DEFAULT 0,
  ALTER COLUMN legacy_upvotes_count SET NOT NULL,
  ALTER COLUMN upvotes_count TYPE bigint,
  ALTER COLUMN upvotes_count SET NOT NULL,
  ALTER COLUMN upvotes_count SET DEFAULT 0,
  ALTER COLUMN status SET DEFAULT '待審核';
COMMENT ON COLUMN public.proposals.legacy_upvotes_count IS 'Immutable displayed upvotes_count at cutover; old ledgers are never recounted.';

DO $$
DECLARE t text; before_digest text; after_digest text;
BEGIN
  FOREACH t IN ARRAY ARRAY['proposals','feedback'] LOOP
    -- Only NULL is normalized. Assert byte-for-byte substantive reply preservation.
    EXECUTE pg_catalog.format('SELECT md5(coalesce(string_agg(id::text||md5(reply),'''' ORDER BY id),'''')) FROM public.%I WHERE reply IS NOT NULL AND reply<>''''',t) INTO before_digest;
    EXECUTE pg_catalog.format('UPDATE public.%I SET reply='''' WHERE reply IS NULL',t);
    EXECUTE pg_catalog.format('SELECT md5(coalesce(string_agg(id::text||md5(reply),'''' ORDER BY id),'''')) FROM public.%I WHERE reply IS NOT NULL AND reply<>''''',t) INTO after_digest;
    IF before_digest IS DISTINCT FROM after_digest THEN RAISE EXCEPTION 'Substantive reply changed'; END IF;
    EXECUTE pg_catalog.format('ALTER TABLE public.%I ALTER COLUMN reply SET DEFAULT '''', ALTER COLUMN reply SET NOT NULL',t);
  END LOOP;
  FOREACH t IN ARRAY ARRAY['proposals','feedback','proposal_comments','home_sections'] LOOP
    EXECUTE pg_catalog.format('ALTER TABLE public.%I ADD COLUMN content_version bigint NOT NULL DEFAULT 1 CHECK (content_version BETWEEN 1 AND 9007199254740991), ALTER COLUMN created_at SET NOT NULL',t);
    IF t <> 'home_sections' THEN
      EXECUTE pg_catalog.format('ALTER TABLE public.%I ADD COLUMN attribution_trusted boolean NOT NULL DEFAULT false',t);
      EXECUTE pg_catalog.format('COMMENT ON COLUMN public.%I.attribution_trusted IS %L',t,'False for all historical attribution, including existing user_id/email/name. Only verified RPC inserts set true.');
    END IF;
    EXECUTE pg_catalog.format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO rights_executor',t);
    EXECUTE pg_catalog.format('CREATE POLICY rights_executor_read ON public.%I FOR SELECT TO rights_executor USING (true)',t);
    EXECUTE pg_catalog.format('CREATE POLICY rights_executor_insert ON public.%I FOR INSERT TO rights_executor WITH CHECK (true)',t);
    EXECUTE pg_catalog.format('CREATE POLICY rights_executor_update ON public.%I FOR UPDATE TO rights_executor USING (true) WITH CHECK (true)',t);
    EXECUTE pg_catalog.format('CREATE POLICY rights_executor_delete ON public.%I FOR DELETE TO rights_executor USING (true)',t);
  END LOOP;
END $$;

CREATE TABLE rights_private.proposal_ballots (
  proposal_id uuid NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  PRIMARY KEY (proposal_id,user_id)
);
-- Count is derived from baseline + this fresh ledger, not a mutable cached total.
-- The legacy upvotes_count column stays intact as a cutover artifact.
CREATE INDEX rights_ballots_user ON rights_private.proposal_ballots(user_id);
CREATE TABLE rights_private.mutation_history (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  relation_name text NOT NULL, target_id uuid NOT NULL,
  operation text NOT NULL, actor_id uuid,
  occurred_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  before_row jsonb, after_row jsonb
);
ALTER TABLE rights_private.proposal_ballots OWNER TO rights_executor;
ALTER TABLE rights_private.mutation_history OWNER TO rights_executor;
ALTER TABLE rights_private.proposal_ballots ENABLE ROW LEVEL SECURITY;
ALTER TABLE rights_private.mutation_history ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA rights_private FROM PUBLIC,anon,authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA rights_private FROM PUBLIC,anon,authenticated;

-- Missing order/FK indexes justified by bounded keyset lists and auth-user deletes.
CREATE INDEX rights_proposals_order ON public.proposals(created_at DESC,id DESC);
CREATE INDEX rights_proposals_status_order ON public.proposals(status,created_at DESC,id DESC);
CREATE INDEX rights_feedback_order ON public.feedback(created_at DESC,id DESC);
CREATE INDEX rights_home_order ON public.home_sections(created_at DESC,id DESC);
CREATE INDEX rights_comments_proposal_order ON public.proposal_comments(proposal_id,created_at,id);
CREATE INDEX rights_proposals_user ON public.proposals(user_id);
CREATE INDEX rights_feedback_user ON public.feedback(user_id);
CREATE INDEX rights_feedbacks_user ON public.feedbacks(user_id);
CREATE INDEX rights_comments_user ON public.proposal_comments(user_id);

CREATE FUNCTION rights_private.actor(p_admin boolean DEFAULT false) RETURNS uuid
LANGUAGE plpgsql STABLE SET search_path='' AS $$
-- Same claim expression as auth.uid(), without requiring Auth-schema privileges.
DECLARE u uuid := COALESCE(NULLIF(pg_catalog.current_setting('request.jwt.claim.sub',true),''),
  NULLIF(pg_catalog.current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid; e text;
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

CREATE FUNCTION rights_private.text_value(p_value text,p_max integer,p_empty boolean DEFAULT false) RETURNS text
LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE v text;
BEGIN
  -- ECMAScript trim whitespace, including NBSP/ideographic space, Unicode codepoints.
  v := pg_catalog.btrim(p_value, E' \t\n\r\v\f' || U&'\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF');
  IF v IS NULL OR (NOT p_empty AND v='') OR pg_catalog.char_length(v)>p_max THEN
    RAISE SQLSTATE 'PT400' USING MESSAGE='Invalid text';
  END IF;
  RETURN v;
END $$;

CREATE FUNCTION rights_private.audit() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  INSERT INTO rights_private.mutation_history(relation_name,target_id,operation,actor_id,before_row,after_row)
  VALUES (TG_TABLE_NAME,COALESCE(NEW.id,OLD.id),TG_OP,
    COALESCE(NULLIF(pg_catalog.current_setting('request.jwt.claim.sub',true),''),NULLIF(pg_catalog.current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid,
    CASE WHEN TG_OP<>'INSERT' THEN pg_catalog.to_jsonb(OLD) END,
    CASE WHEN TG_OP<>'DELETE' THEN pg_catalog.to_jsonb(NEW) END);
  RETURN NULL;
END $$;

CREATE FUNCTION rights_private.version_row() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF TG_TABLE_NAME='proposals' THEN
    IF NEW.legacy_upvotes_count IS DISTINCT FROM OLD.legacy_upvotes_count THEN
      RAISE SQLSTATE 'PT409' USING MESSAGE='Immutable baseline';
    END IF;
  END IF;
  NEW.content_version := OLD.content_version+1;
  RETURN NEW;
END $$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['proposals','feedback','proposal_comments','home_sections'] LOOP
    EXECUTE pg_catalog.format('CREATE TRIGGER rights_version BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION rights_private.version_row()',t);
    EXECUTE pg_catalog.format('CREATE TRIGGER rights_history AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION rights_private.audit()',t);
  END LOOP;
END $$;

CREATE FUNCTION rights_private.total(p_id uuid,p_baseline bigint) RETURNS bigint
LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE n bigint;
BEGIN
  SELECT p_baseline+count(*) INTO n FROM rights_private.proposal_ballots WHERE proposal_id=p_id;
  IF n NOT BETWEEN 0 AND 9007199254740991 THEN RAISE SQLSTATE 'PT409' USING MESSAGE='Count out of range'; END IF;
  RETURN n;
END $$;

CREATE FUNCTION rights_private.project(p_kind text,p_row jsonb) RETURNS jsonb
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
        AND user_id=COALESCE(NULLIF(pg_catalog.current_setting('request.jwt.claim.sub',true),''),NULLIF(pg_catalog.current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid));
END $$;

CREATE FUNCTION rights_private.page(p_kind text,p_limit integer,p_cursor jsonb,p_query text DEFAULT '',p_proposal_id uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE t text; cond text; direction text:='DESC'; cmp text:='<'; stamp timestamptz; ident uuid;
  r record; items jsonb:='[]'; next_cursor jsonb:=NULL; last_cursor jsonb; n integer:=0; q text;
BEGIN
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 50 THEN RAISE SQLSTATE 'PT400' USING MESSAGE='Invalid limit'; END IF;
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
    WHEN 'proposal' THEN t:='proposals'; cond:='status IN (''研議中'',''通過'',''已採納'',''不採納'')';
    WHEN 'pending' THEN PERFORM rights_private.actor(true); t:='proposals'; cond:='status=''待審核''';
    WHEN 'feedback' THEN t:='feedback'; cond:='true';
    WHEN 'admin_feedback' THEN PERFORM rights_private.actor(true); t:='feedback'; cond:='true';
    WHEN 'home' THEN t:='home_sections'; cond:='true';
    WHEN 'comment' THEN
      IF p_proposal_id IS NULL THEN RAISE SQLSTATE 'PT400' USING MESSAGE='Invalid id'; END IF;
      t:='proposal_comments'; direction:='ASC'; cmp:='>';
      cond:='proposal_id=$5 AND EXISTS (SELECT 1 FROM public.proposals p WHERE p.id=$5 AND p.status IN (''研議中'',''通過'',''已採納'',''不採納''))';
    ELSE RAISE SQLSTATE 'PT400' USING MESSAGE='Invalid kind';
  END CASE;
  IF p_kind<>'comment' THEN cond:=cond||' AND ($4='''' OR strpos(lower(title),lower($4))>0 OR strpos(lower(content),lower($4))>0)'; END IF;
  -- Filter BEFORE bounded keyset pagination; order and cursor use native precision.
  FOR r IN EXECUTE pg_catalog.format('SELECT to_jsonb(x) AS row FROM public.%I x WHERE (%s) AND ($1 IS NULL OR (created_at,id) %s ($1,$2)) ORDER BY created_at %s,id %s LIMIT $3',t,cond,cmp,direction,direction)
    USING stamp,ident,p_limit+1,q,p_proposal_id LOOP
    n:=n+1;
    IF n>p_limit THEN next_cursor:=last_cursor; EXIT; END IF;
    items:=items||pg_catalog.jsonb_build_array(rights_private.project(CASE WHEN p_kind='pending' THEN 'proposal' WHEN p_kind='admin_feedback' THEN 'feedback' ELSE p_kind END,r.row));
    last_cursor:=pg_catalog.jsonb_build_object('created_at',r.row->'created_at','id',r.row->'id');
  END LOOP;
  RETURN pg_catalog.jsonb_build_object('items',items,'nextCursor',next_cursor);
END $$;

CREATE FUNCTION rights_private.mutate(p_action text,p_args jsonb) RETURNS jsonb
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE u uuid; name text; title text; body text; category text; v_reply text; ident uuid; pid uuid; v bigint;
  t text; row_before jsonb; result_row jsonb; voted boolean; previously_voted boolean; baseline bigint;
BEGIN
  IF p_action IS NULL OR p_args IS NULL OR EXISTS (SELECT 1 FROM pg_catalog.jsonb_each(p_args) WHERE value='null'::jsonb) THEN
    RAISE SQLSTATE 'PT400' USING MESSAGE='Null argument';
  END IF;
  u:=rights_private.actor(p_action NOT IN ('create_proposal','create_feedback','add_comment','set_vote'));
  SELECT display_name INTO name FROM rights_private.user_identity(u);
  IF p_action IN ('create_proposal','create_feedback','create_home_section','add_comment') THEN
    body:=rights_private.text_value(p_args->>'content',CASE WHEN p_action='add_comment' THEN 1000 ELSE 5000 END);
    IF p_action<>'add_comment' THEN title:=rights_private.text_value(p_args->>'title',100,p_action='create_feedback'); END IF;
    IF p_action IN ('create_proposal','create_feedback') THEN
      category:=p_args->>'category';
      IF category IS NULL OR category NOT IN ('環境與設備','學聯與活動','課程與教學','其他') THEN RAISE SQLSTATE 'PT400' USING MESSAGE='Invalid category'; END IF;
    END IF;
    IF p_action='create_proposal' THEN
      IF pg_catalog.left(title,1)<>'[' THEN title:='['||category||'] '||title; END IF;
      title:=rights_private.text_value(title,120);
      INSERT INTO public.proposals(title,content,user_id,author_name,is_anonymous,status,attribution_trusted)
        VALUES(title,body,u,name,false,'待審核',true) RETURNING id,content_version INTO ident,v;
    ELSIF p_action='create_feedback' THEN
      IF pg_catalog.jsonb_typeof(p_args->'is_anonymous') IS DISTINCT FROM 'boolean' THEN RAISE SQLSTATE 'PT400' USING MESSAGE='Invalid boolean'; END IF;
      IF title='' THEN title:=pg_catalog.left(body,15)||CASE WHEN pg_catalog.char_length(body)>15 THEN '...' ELSE '' END; END IF;
      INSERT INTO public.feedback(title,content,category,user_id,author_name,is_anonymous,attribution_trusted)
        VALUES(title,body,category,u,name,(p_args->>'is_anonymous')::boolean,true) RETURNING id,content_version INTO ident,v;
    ELSIF p_action='create_home_section' THEN
      INSERT INTO public.home_sections(title,content) VALUES(title,body) RETURNING id,content_version INTO ident,v;
    ELSE
      IF pg_catalog.jsonb_typeof(p_args->'is_anonymous') IS DISTINCT FROM 'boolean' THEN RAISE SQLSTATE 'PT400' USING MESSAGE='Invalid boolean'; END IF;
      pid:=(p_args->>'proposal_id')::uuid;
      -- Serialize against deletion/moderation, without changing proposal version.
      PERFORM 1 FROM public.proposals WHERE id=pid AND status IN ('研議中','通過','已採納','不採納') FOR UPDATE;
      IF NOT FOUND THEN RAISE SQLSTATE 'PT409' USING MESSAGE='Proposal unavailable'; END IF;
      INSERT INTO public.proposal_comments(proposal_id,content,user_id,author_name,is_anonymous,attribution_trusted)
        VALUES(pid,body,u,name,(p_args->>'is_anonymous')::boolean,true) RETURNING id,content_version INTO ident,v;
    END IF;
    RETURN pg_catalog.jsonb_build_object('inserted',true,'id',ident,'version',v);
  END IF;
  IF p_action='set_vote' THEN
    IF pg_catalog.jsonb_typeof(p_args->'voted') IS DISTINCT FROM 'boolean' THEN RAISE SQLSTATE 'PT400' USING MESSAGE='Invalid boolean'; END IF;
    pid:=(p_args->>'proposal_id')::uuid; voted:=(p_args->>'voted')::boolean;
    SELECT legacy_upvotes_count INTO baseline FROM public.proposals WHERE id=pid AND status IN ('研議中','通過','已採納','不採納') FOR UPDATE;
    IF NOT FOUND THEN RAISE SQLSTATE 'PT409' USING MESSAGE='Proposal unavailable'; END IF;
    SELECT EXISTS (SELECT 1 FROM rights_private.proposal_ballots WHERE proposal_id=pid AND user_id=u) INTO previously_voted;
    IF voted THEN
      INSERT INTO rights_private.proposal_ballots(proposal_id,user_id) VALUES(pid,u) ON CONFLICT DO NOTHING;
    ELSE DELETE FROM rights_private.proposal_ballots WHERE proposal_id=pid AND user_id=u;
    END IF;
    INSERT INTO rights_private.mutation_history(relation_name,target_id,operation,actor_id,before_row,after_row)
      VALUES('proposal_ballots',pid,'SET_VOTE',u,pg_catalog.jsonb_build_object('voted',previously_voted),pg_catalog.jsonb_build_object('voted',voted));
    RETURN pg_catalog.jsonb_build_object('id',pid,'voted',voted,'upvotes_count',rights_private.total(pid,baseline));
  END IF;
  ident:=(p_args->>'id')::uuid;
  v:=(p_args->>'expected_version')::bigint;
  IF ident IS NULL OR v IS NULL OR v NOT BETWEEN 1 AND 9007199254740991 THEN RAISE SQLSTATE 'PT400' USING MESSAGE='Invalid version or id'; END IF;
  CASE p_action
    WHEN 'update_proposal_control','approve_proposal','reject_proposal','delete_proposal' THEN t:='proposals';
    WHEN 'save_feedback_reply','delete_feedback' THEN t:='feedback';
    WHEN 'delete_comment' THEN t:='proposal_comments';
    WHEN 'delete_home_section' THEN t:='home_sections';
    ELSE RAISE SQLSTATE 'PT400' USING MESSAGE='Invalid action';
  END CASE;
  EXECUTE pg_catalog.format('SELECT to_jsonb(x) FROM public.%I x WHERE id=$1 FOR UPDATE',t) INTO row_before USING ident;
  IF row_before IS NULL OR (row_before->>'content_version')::bigint<>v THEN RAISE SQLSTATE 'PT409' USING MESSAGE='Version conflict'; END IF;
  IF p_action IN ('approve_proposal','reject_proposal') AND (row_before->>'status') IS DISTINCT FROM '待審核' THEN RAISE SQLSTATE 'PT409' USING MESSAGE='Not pending'; END IF;
  IF p_action='delete_comment' AND (row_before->>'proposal_id')::uuid IS DISTINCT FROM (p_args->>'proposal_id')::uuid THEN RAISE SQLSTATE 'PT409' USING MESSAGE='Proposal mismatch'; END IF;
  IF p_action LIKE 'delete_%' THEN
    EXECUTE pg_catalog.format('DELETE FROM public.%I WHERE id=$1',t) USING ident;
    RETURN pg_catalog.jsonb_build_object('id',ident,'deleted',true);
  END IF;
  IF p_action='save_feedback_reply' THEN
    v_reply:=rights_private.text_value(p_args->>'reply',5000,true);
    UPDATE public.feedback SET reply=v_reply,replied_at=pg_catalog.now() WHERE id=ident RETURNING pg_catalog.to_jsonb(feedback.*) INTO result_row;
  ELSIF p_action='update_proposal_control' THEN
    IF p_args->>'status' NOT IN ('研議中','通過','已採納','不採納') OR p_args->>'status' IS NULL THEN RAISE SQLSTATE 'PT400' USING MESSAGE='Invalid status'; END IF;
    v_reply:=rights_private.text_value(p_args->>'reply',5000,true);
    UPDATE public.proposals SET status=p_args->>'status',reply=v_reply WHERE id=ident RETURNING pg_catalog.to_jsonb(proposals.*) INTO result_row;
  ELSE
    UPDATE public.proposals SET status=CASE WHEN p_action='approve_proposal' THEN '研議中' ELSE '被退回' END WHERE id=ident RETURNING pg_catalog.to_jsonb(proposals.*) INTO result_row;
  END IF;
  RETURN pg_catalog.jsonb_build_object('id',ident,'version',result_row->'content_version');
END $$;

-- Thin, typed exposed entrypoints. Only these are callable by JWT roles.
CREATE FUNCTION public.rights_list_public_proposals(p_limit integer DEFAULT 20,p_cursor jsonb DEFAULT NULL,p_query text DEFAULT '') RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$ SELECT rights_private.page('proposal',p_limit,p_cursor,p_query) $$;
CREATE FUNCTION public.rights_list_public_feedback(p_limit integer DEFAULT 20,p_cursor jsonb DEFAULT NULL,p_query text DEFAULT '') RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$ SELECT rights_private.page('feedback',p_limit,p_cursor,p_query) $$;
CREATE FUNCTION public.rights_list_public_comments(p_proposal_id uuid,p_limit integer DEFAULT 20,p_cursor jsonb DEFAULT NULL) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$ SELECT rights_private.page('comment',p_limit,p_cursor,'',p_proposal_id) $$;
CREATE FUNCTION public.rights_list_home_sections(p_limit integer DEFAULT 20,p_cursor jsonb DEFAULT NULL) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$ SELECT rights_private.page('home',p_limit,p_cursor) $$;
CREATE FUNCTION public.rights_list_pending_proposals(p_limit integer DEFAULT 20,p_cursor jsonb DEFAULT NULL) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$ SELECT rights_private.page('pending',p_limit,p_cursor) $$;
CREATE FUNCTION public.rights_list_admin_feedback(p_limit integer DEFAULT 20,p_cursor jsonb DEFAULT NULL) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$ SELECT rights_private.page('admin_feedback',p_limit,p_cursor) $$;

CREATE FUNCTION public.rights_is_admin() RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
  PERFORM rights_private.actor(true); RETURN true;
EXCEPTION WHEN SQLSTATE 'PT401' OR SQLSTATE 'PT403' THEN RETURN false;
END $$;

CREATE FUNCTION public.rights_get_public_item(p_kind text,p_id uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE j jsonb;
BEGIN
  IF p_kind IS NULL OR p_id IS NULL THEN RAISE SQLSTATE 'PT400' USING MESSAGE='Null argument'; END IF;
  IF p_kind='proposal' THEN SELECT pg_catalog.to_jsonb(p) INTO j FROM public.proposals p WHERE id=p_id AND status IN ('研議中','通過','已採納','不採納');
  ELSIF p_kind='feedback' THEN SELECT pg_catalog.to_jsonb(f) INTO j FROM public.feedback f WHERE id=p_id;
  ELSE RAISE SQLSTATE 'PT400' USING MESSAGE='Invalid kind'; END IF;
  IF j IS NULL THEN RETURN NULL; END IF;
  RETURN rights_private.project(p_kind,j);
END $$;

CREATE FUNCTION public.rights_admin_author(p_kind text,p_id uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE j jsonb; e text; t text;
BEGIN
  PERFORM rights_private.actor(true);
  IF p_kind IS NULL OR p_id IS NULL THEN RAISE SQLSTATE 'PT400' USING MESSAGE='Null argument'; END IF;
  CASE p_kind WHEN 'proposal' THEN t:='proposals'; WHEN 'feedback' THEN t:='feedback'; WHEN 'comment' THEN t:='proposal_comments';
    ELSE RAISE SQLSTATE 'PT400' USING MESSAGE='Invalid kind'; END CASE;
  EXECUTE pg_catalog.format('SELECT to_jsonb(x) FROM public.%I x WHERE id=$1',t) INTO j USING p_id;
  IF j IS NULL THEN RETURN NULL; END IF;
  IF (j->>'attribution_trusted')::boolean AND j->>'user_id' IS NOT NULL THEN
    SELECT email INTO e FROM rights_private.user_identity((j->>'user_id')::uuid);
    RETURN pg_catalog.jsonb_build_object('attribution','known','user_id',j->'user_id','email',e,'display_name',j->'author_name');
  END IF;
  -- Historical names/IDs are evidence of legacy data, NEVER ownership authority.
  RETURN pg_catalog.jsonb_build_object('attribution',CASE WHEN COALESCE(j->>'user_id',j->>'author_email',j->>'user_email',j->>'author_name') IS NOT NULL THEN 'legacy_unverified' ELSE 'unknown' END,
    'user_id',NULL,'email',NULL,'display_name',NULL);
END $$;

CREATE FUNCTION public.rights_create_proposal(p_title text,p_content text,p_category text) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$ SELECT rights_private.mutate('create_proposal',pg_catalog.jsonb_build_object('title',p_title,'content',p_content,'category',p_category)) $$;
CREATE FUNCTION public.rights_create_feedback(p_title text,p_content text,p_category text,p_is_anonymous boolean) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$ SELECT rights_private.mutate('create_feedback',pg_catalog.jsonb_build_object('title',p_title,'content',p_content,'category',p_category,'is_anonymous',p_is_anonymous)) $$;
CREATE FUNCTION public.rights_add_comment(p_proposal_id uuid,p_content text,p_is_anonymous boolean) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$ SELECT rights_private.mutate('add_comment',pg_catalog.jsonb_build_object('proposal_id',p_proposal_id,'content',p_content,'is_anonymous',p_is_anonymous)) $$;
CREATE FUNCTION public.rights_set_vote(p_proposal_id uuid,p_voted boolean) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$ SELECT rights_private.mutate('set_vote',pg_catalog.jsonb_build_object('proposal_id',p_proposal_id,'voted',p_voted)) $$;
CREATE FUNCTION public.rights_update_proposal_control(p_id uuid,p_status text,p_reply text,p_expected_version bigint) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$ SELECT rights_private.mutate('update_proposal_control',pg_catalog.jsonb_build_object('id',p_id,'status',p_status,'reply',p_reply,'expected_version',p_expected_version)) $$;
CREATE FUNCTION public.rights_approve_proposal(p_id uuid,p_expected_version bigint) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$ SELECT rights_private.mutate('approve_proposal',pg_catalog.jsonb_build_object('id',p_id,'expected_version',p_expected_version)) $$;
CREATE FUNCTION public.rights_reject_proposal(p_id uuid,p_expected_version bigint) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$ SELECT rights_private.mutate('reject_proposal',pg_catalog.jsonb_build_object('id',p_id,'expected_version',p_expected_version)) $$;
CREATE FUNCTION public.rights_delete_proposal(p_id uuid,p_expected_version bigint) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$ SELECT rights_private.mutate('delete_proposal',pg_catalog.jsonb_build_object('id',p_id,'expected_version',p_expected_version)) $$;
CREATE FUNCTION public.rights_delete_comment(p_id uuid,p_proposal_id uuid,p_expected_version bigint) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$ SELECT rights_private.mutate('delete_comment',pg_catalog.jsonb_build_object('id',p_id,'proposal_id',p_proposal_id,'expected_version',p_expected_version)) $$;
CREATE FUNCTION public.rights_save_feedback_reply(p_id uuid,p_reply text,p_expected_version bigint) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$ SELECT rights_private.mutate('save_feedback_reply',pg_catalog.jsonb_build_object('id',p_id,'reply',p_reply,'expected_version',p_expected_version)) $$;
CREATE FUNCTION public.rights_delete_feedback(p_id uuid,p_expected_version bigint) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$ SELECT rights_private.mutate('delete_feedback',pg_catalog.jsonb_build_object('id',p_id,'expected_version',p_expected_version)) $$;
CREATE FUNCTION public.rights_create_home_section(p_title text,p_content text) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$ SELECT rights_private.mutate('create_home_section',pg_catalog.jsonb_build_object('title',p_title,'content',p_content)) $$;
CREATE FUNCTION public.rights_delete_home_section(p_id uuid,p_expected_version bigint) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$ SELECT rights_private.mutate('delete_home_section',pg_catalog.jsonb_build_object('id',p_id,'expected_version',p_expected_version)) $$;

DO $$
DECLARE f record;
BEGIN
  FOR f IN SELECT p.oid::regprocedure AS signature,p.proname FROM pg_catalog.pg_proc p WHERE p.pronamespace IN ('rights_private'::regnamespace,'public'::regnamespace)
    AND (p.pronamespace='rights_private'::regnamespace OR p.proname LIKE 'rights\_%' ESCAPE '\') LOOP
    IF f.signature<>'rights_private.user_identity(uuid)'::regprocedure THEN
      EXECUTE pg_catalog.format('ALTER FUNCTION %s OWNER TO rights_executor',f.signature);
    END IF;
    EXECUTE pg_catalog.format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',f.signature);
    IF f.proname LIKE 'rights\_%' ESCAPE '\' THEN
      EXECUTE pg_catalog.format('GRANT EXECUTE ON FUNCTION %s TO authenticated',f.signature);
      IF f.proname IN ('rights_list_public_proposals','rights_list_public_feedback','rights_list_public_comments','rights_list_home_sections','rights_get_public_item','rights_is_admin') THEN
        EXECUTE pg_catalog.format('GRANT EXECUTE ON FUNCTION %s TO anon',f.signature);
      END IF;
    END IF;
  END LOOP;
END $$;
REVOKE CREATE ON SCHEMA public FROM rights_executor;
REVOKE CREATE ON SCHEMA rights_private FROM postgres;
DO $$
BEGIN
  IF NOT (SELECT rolsuper FROM pg_catalog.pg_roles WHERE rolname=current_user) THEN
    -- Removes only our own grant; PG17's bootstrap-granted ADMIN-only row stays.
    EXECUTE pg_catalog.format('REVOKE rights_executor FROM %I GRANTED BY %I',current_user,current_user);
  END IF;
END $$;
NOTIFY pgrst, 'reload schema';
COMMIT;
