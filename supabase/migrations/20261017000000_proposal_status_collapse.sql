-- Proposal status collapse: 5 -> 3 (plus unchanged internal 被退回).
-- Local files only; never apply to prod/staging from this task.
-- Mapping (locked): 研議中->處理中, 通過->處理中, 已採納->已結案, 不採納->已結案.
-- New model: 待審核 (unpublished gate) / 處理中 (all live undecided) / 已結案
-- (decided; outcome lives in the official reply as 決議：採納／不採納＋理由
-- convention, no hard DB validation). 被退回 stays as the internal invisible
-- 4th state with identical handling. Unknown/legacy statuses stay untouched;
-- there is no global status CHECK to rewrite (historical invalid rows are
-- preserved by contract), so this migration rewrites only the RPC whitelists
-- plus the approve landing, then backfills existing rows.
BEGIN;
SET LOCAL lock_timeout = '10s';
SET LOCAL search_path = '';

-- Managed-principal execution: same transient pattern as the hardening
-- cutover. PG17 gives a CREATEROLE creator ADMIN only, not SET/INHERIT, so
-- construction needs this grant. It is revoked before commit (never the
-- reverse). No permanent grant, no BYPASSRLS change, no owner change.
DO $$
BEGIN
  IF NOT (SELECT rolsuper FROM pg_catalog.pg_roles WHERE rolname=current_user) THEN
    EXECUTE pg_catalog.format('GRANT rights_executor TO %I WITH SET TRUE, INHERIT TRUE',current_user);
  END IF;
END $$;

-- Backfill existing rows per the locked mapping. 待審核 / 被退回 / legacy
-- values are left untouched.
UPDATE public.proposals SET status =
  CASE status
    WHEN '研議中' THEN '處理中'
    WHEN '通過' THEN '處理中'
    WHEN '已採納' THEN '已結案'
    WHEN '不採納' THEN '已結案'
    ELSE status
  END
WHERE status IN ('研議中','通過','已採納','不採納');

-- Fail rather than leave a partially mapped status set behind.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.proposals WHERE status IN ('研議中','通過','已採納','不採納')) THEN
    RAISE EXCEPTION 'status collapse: legacy public status remains';
  END IF;
END $$;

-- Private RPCs live in rights_private (owner rights_executor, no CREATE for
-- postgres). Replace them as the owner via SET ROLE so no transient schema
-- grant is needed and ownership cannot drift to postgres.
SET ROLE rights_executor;
-- Public-list filter: proposal + per-proposal comment gating move to the
-- 2-status public set. Pending ('待審核') is unchanged.
CREATE OR REPLACE FUNCTION rights_private.page(p_kind text,p_limit integer,p_cursor jsonb,p_query text DEFAULT '',p_proposal_id uuid DEFAULT NULL) RETURNS jsonb
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
    WHEN 'proposal' THEN t:='proposals'; cond:='status IN (''處理中'',''已結案'')';
    WHEN 'pending' THEN PERFORM rights_private.actor(true); t:='proposals'; cond:='status=''待審核''';
    WHEN 'feedback' THEN t:='feedback'; cond:='true';
    WHEN 'admin_feedback' THEN PERFORM rights_private.actor(true); t:='feedback'; cond:='true';
    WHEN 'home' THEN t:='home_sections'; cond:='true';
    WHEN 'comment' THEN
      IF p_proposal_id IS NULL THEN RAISE SQLSTATE 'PT400' USING MESSAGE='Invalid id'; END IF;
      t:='proposal_comments'; direction:='ASC'; cmp:='>';
      cond:='proposal_id=$5 AND EXISTS (SELECT 1 FROM public.proposals p WHERE p.id=$5 AND p.status IN (''處理中'',''已結案''))';
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

-- Mutation gating: comment/vote availability, control whitelist, and the
-- approve landing (approve -> 處理中; reject -> 被退回 unchanged).
CREATE OR REPLACE FUNCTION rights_private.mutate(p_action text,p_args jsonb) RETURNS jsonb
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
      PERFORM 1 FROM public.proposals WHERE id=pid AND status IN ('處理中','已結案') FOR UPDATE;
      IF NOT FOUND THEN RAISE SQLSTATE 'PT409' USING MESSAGE='Proposal unavailable'; END IF;
      INSERT INTO public.proposal_comments(proposal_id,content,user_id,author_name,is_anonymous,attribution_trusted)
        VALUES(pid,body,u,name,(p_args->>'is_anonymous')::boolean,true) RETURNING id,content_version INTO ident,v;
    END IF;
    RETURN pg_catalog.jsonb_build_object('inserted',true,'id',ident,'version',v);
  END IF;
  IF p_action='set_vote' THEN
    IF pg_catalog.jsonb_typeof(p_args->'voted') IS DISTINCT FROM 'boolean' THEN RAISE SQLSTATE 'PT400' USING MESSAGE='Invalid boolean'; END IF;
    pid:=(p_args->>'proposal_id')::uuid; voted:=(p_args->>'voted')::boolean;
    SELECT legacy_upvotes_count INTO baseline FROM public.proposals WHERE id=pid AND status IN ('處理中','已結案') FOR UPDATE;
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
    IF p_args->>'status' NOT IN ('處理中','已結案') OR p_args->>'status' IS NULL THEN RAISE SQLSTATE 'PT400' USING MESSAGE='Invalid status'; END IF;
    v_reply:=rights_private.text_value(p_args->>'reply',5000,true);
    UPDATE public.proposals SET status=p_args->>'status',reply=v_reply WHERE id=ident RETURNING pg_catalog.to_jsonb(proposals.*) INTO result_row;
  ELSE
    UPDATE public.proposals SET status=CASE WHEN p_action='approve_proposal' THEN '處理中' ELSE '被退回' END WHERE id=ident RETURNING pg_catalog.to_jsonb(proposals.*) INTO result_row;
  END IF;
  RETURN pg_catalog.jsonb_build_object('id',ident,'version',result_row->'content_version');
END $$;
RESET ROLE;

-- Targeted public read: only the 2-status public set is visible. Pending,
-- rejected, and legacy-invalid rows return null (hidden, not changed).
-- Public schema CREATE belongs to postgres (DB owner); the transient
-- executor membership above authorizes replacing this executor-owned
-- function without a permanent schema grant.
CREATE OR REPLACE FUNCTION public.rights_get_public_item(p_kind text,p_id uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE j jsonb;
BEGIN
  IF p_kind IS NULL OR p_id IS NULL THEN RAISE SQLSTATE 'PT400' USING MESSAGE='Null argument'; END IF;
  IF p_kind='proposal' THEN SELECT pg_catalog.to_jsonb(p) INTO j FROM public.proposals p WHERE id=p_id AND status IN ('處理中','已結案');
  ELSIF p_kind='feedback' THEN SELECT pg_catalog.to_jsonb(f) INTO j FROM public.feedback f WHERE id=p_id;
  ELSE RAISE SQLSTATE 'PT400' USING MESSAGE='Invalid kind'; END IF;
  IF j IS NULL THEN RETURN NULL; END IF;
  RETURN rights_private.project(p_kind,j);
END $$;

-- Ownership must not drift to the migration principal. Re-asserting is
-- idempotent when the SET ROLE path above already preserved it.
ALTER FUNCTION rights_private.page(text,integer,jsonb,text,uuid) OWNER TO rights_executor;
ALTER FUNCTION rights_private.mutate(text,jsonb) OWNER TO rights_executor;
ALTER FUNCTION public.rights_get_public_item(text,uuid) OWNER TO rights_executor;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE p.oid IN ('rights_private.page(text,integer,jsonb,text,uuid)'::regprocedure,
      'rights_private.mutate(text,jsonb)'::regprocedure,
      'public.rights_get_public_item(text,uuid)'::regprocedure)
    AND p.proowner<>'rights_executor'::regrole) THEN
    RAISE EXCEPTION 'status collapse: function owner drifted';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc WHERE oid='rights_private.user_identity(uuid)'::regprocedure
    AND proowner<>'postgres'::regrole) THEN
    RAISE EXCEPTION 'status collapse: identity owner drifted';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='rights_executor'
    AND (rolsuper OR rolbypassrls)) THEN
    RAISE EXCEPTION 'status collapse: executor gained superuser or bypassrls';
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
