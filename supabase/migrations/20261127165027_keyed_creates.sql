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

ALTER TABLE public.home_sections ADD COLUMN user_id uuid;
ALTER TABLE public.proposals ADD COLUMN client_key uuid, ADD COLUMN create_digest bytea;
CREATE UNIQUE INDEX proposals_caller_key ON public.proposals(user_id,client_key) WHERE client_key IS NOT NULL;
ALTER TABLE public.feedback ADD COLUMN client_key uuid, ADD COLUMN create_digest bytea;
CREATE UNIQUE INDEX feedback_caller_key ON public.feedback(user_id,client_key) WHERE client_key IS NOT NULL;
ALTER TABLE public.home_sections ADD COLUMN client_key uuid, ADD COLUMN create_digest bytea;
CREATE UNIQUE INDEX home_sections_caller_key ON public.home_sections(user_id,client_key) WHERE client_key IS NOT NULL;
ALTER TABLE public.proposal_comments ADD COLUMN client_key uuid, ADD COLUMN create_digest bytea;
CREATE UNIQUE INDEX proposal_comments_caller_key ON public.proposal_comments(user_id,client_key) WHERE client_key IS NOT NULL;

GRANT CREATE ON SCHEMA public TO rights_executor;
SET ROLE rights_executor;
CREATE OR REPLACE FUNCTION rights_private.mutate(p_action text,p_args jsonb) RETURNS jsonb
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE u uuid; name text; title text; body text; category text; v_reply text; ident uuid; pid uuid; v bigint;
  k uuid; digest bytea; stored_digest bytea;
  t text; row_before jsonb; result_row jsonb; voted boolean; previously_voted boolean; baseline bigint;
BEGIN
  IF p_action IS NULL OR p_args IS NULL OR EXISTS (SELECT 1 FROM pg_catalog.jsonb_each(p_args) WHERE value='null'::jsonb) THEN
    RAISE SQLSTATE 'PT400' USING MESSAGE='Null argument';
  END IF;
  u:=rights_private.actor(p_action NOT IN ('create_proposal','create_feedback','add_comment','set_vote'));
  SELECT display_name INTO name FROM rights_private.user_identity(u);
  IF p_action IN ('create_proposal','create_feedback','create_home_section','add_comment') THEN
    k:=(p_args->>'client_key')::uuid;
    IF k IS NULL THEN RAISE SQLSTATE 'PT400' USING MESSAGE='Missing client key'; END IF;
    -- Compare original arguments: title formatting and feedback fallbacks can be lossy.
    digest:=pg_catalog.sha256(pg_catalog.convert_to((p_args-'client_key')::text,'UTF8'));
    body:=rights_private.text_value(p_args->>'content',CASE WHEN p_action='add_comment' THEN 1000 ELSE 5000 END);
    IF p_action<>'add_comment' THEN title:=rights_private.text_value(p_args->>'title',100,p_action='create_feedback'); END IF;
    IF p_action IN ('create_proposal','create_feedback') THEN
      category:=p_args->>'category';
      IF category IS NULL OR category NOT IN ('環境與設備','學聯與活動','課程與教學','其他') THEN RAISE SQLSTATE 'PT400' USING MESSAGE='Invalid category'; END IF;
    END IF;
    IF p_action='create_proposal' THEN
      IF pg_catalog.left(title,1)<>'[' THEN title:='['||category||'] '||title; END IF;
      title:=rights_private.text_value(title,120);
      t:='proposals';
      INSERT INTO public.proposals(client_key,create_digest,title,content,user_id,author_name,is_anonymous,status,attribution_trusted)
        VALUES(k,digest,title,body,u,name,false,'待審核',true)
        ON CONFLICT (user_id,client_key) WHERE client_key IS NOT NULL DO NOTHING
        RETURNING id,content_version INTO ident,v;
    ELSIF p_action='create_feedback' THEN
      IF pg_catalog.jsonb_typeof(p_args->'is_anonymous') IS DISTINCT FROM 'boolean' THEN RAISE SQLSTATE 'PT400' USING MESSAGE='Invalid boolean'; END IF;
      IF title='' THEN title:=pg_catalog.left(body,15)||CASE WHEN pg_catalog.char_length(body)>15 THEN '...' ELSE '' END; END IF;
      t:='feedback';
      INSERT INTO public.feedback(client_key,create_digest,title,content,category,user_id,author_name,is_anonymous,attribution_trusted)
        VALUES(k,digest,title,body,category,u,name,(p_args->>'is_anonymous')::boolean,true)
        ON CONFLICT (user_id,client_key) WHERE client_key IS NOT NULL DO NOTHING
        RETURNING id,content_version INTO ident,v;
    ELSIF p_action='create_home_section' THEN
      t:='home_sections';
      INSERT INTO public.home_sections(client_key,create_digest,user_id,title,content) VALUES(k,digest,u,title,body)
        ON CONFLICT (user_id,client_key) WHERE client_key IS NOT NULL DO NOTHING
        RETURNING id,content_version INTO ident,v;
    ELSE
      IF pg_catalog.jsonb_typeof(p_args->'is_anonymous') IS DISTINCT FROM 'boolean' THEN RAISE SQLSTATE 'PT400' USING MESSAGE='Invalid boolean'; END IF;
      pid:=(p_args->>'proposal_id')::uuid;
      -- Serialize against deletion/moderation, without changing proposal version.
      PERFORM 1 FROM public.proposals WHERE id=pid AND status IN ('處理中','已結案') FOR UPDATE;
      IF NOT FOUND THEN RAISE SQLSTATE 'PT409' USING MESSAGE='Proposal unavailable'; END IF;
      t:='proposal_comments';
      INSERT INTO public.proposal_comments(client_key,create_digest,proposal_id,content,user_id,author_name,is_anonymous,attribution_trusted)
        VALUES(k,digest,pid,body,u,name,(p_args->>'is_anonymous')::boolean,true)
        ON CONFLICT (user_id,client_key) WHERE client_key IS NOT NULL DO NOTHING
        RETURNING id,content_version INTO ident,v;
    END IF;
    IF ident IS NULL THEN
      EXECUTE pg_catalog.format('SELECT id,create_digest FROM public.%I WHERE user_id=$1 AND client_key=$2',t)
        INTO ident,stored_digest USING u,k;
      IF stored_digest IS DISTINCT FROM digest THEN RAISE SQLSTATE 'PT409' USING MESSAGE='Client key conflict'; END IF;
      v:=1; -- Replay the creation receipt, even if moderation advanced the current version.
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
DROP FUNCTION public.rights_create_proposal(text,text,text);
CREATE FUNCTION public.rights_create_proposal(p_client_key uuid,p_title text,p_content text,p_category text) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$ SELECT rights_private.mutate('create_proposal',pg_catalog.jsonb_build_object('client_key',p_client_key,'title',p_title,'content',p_content,'category',p_category)) $$;
REVOKE ALL ON FUNCTION public.rights_create_proposal(uuid,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.rights_create_proposal(uuid,text,text,text) TO authenticated;

DROP FUNCTION public.rights_create_feedback(text,text,text,boolean);
CREATE FUNCTION public.rights_create_feedback(p_client_key uuid,p_title text,p_content text,p_category text,p_is_anonymous boolean) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$ SELECT rights_private.mutate('create_feedback',pg_catalog.jsonb_build_object('client_key',p_client_key,'title',p_title,'content',p_content,'category',p_category,'is_anonymous',p_is_anonymous)) $$;
REVOKE ALL ON FUNCTION public.rights_create_feedback(uuid,text,text,text,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.rights_create_feedback(uuid,text,text,text,boolean) TO authenticated;

DROP FUNCTION public.rights_add_comment(uuid,text,boolean);
CREATE FUNCTION public.rights_add_comment(p_client_key uuid,p_proposal_id uuid,p_content text,p_is_anonymous boolean) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$ SELECT rights_private.mutate('add_comment',pg_catalog.jsonb_build_object('client_key',p_client_key,'proposal_id',p_proposal_id,'content',p_content,'is_anonymous',p_is_anonymous)) $$;
REVOKE ALL ON FUNCTION public.rights_add_comment(uuid,uuid,text,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.rights_add_comment(uuid,uuid,text,boolean) TO authenticated;

DROP FUNCTION public.rights_create_home_section(text,text);
CREATE FUNCTION public.rights_create_home_section(p_client_key uuid,p_title text,p_content text) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$ SELECT rights_private.mutate('create_home_section',pg_catalog.jsonb_build_object('client_key',p_client_key,'title',p_title,'content',p_content)) $$;
REVOKE ALL ON FUNCTION public.rights_create_home_section(uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.rights_create_home_section(uuid,text,text) TO authenticated;

RESET ROLE;
REVOKE CREATE ON SCHEMA public FROM rights_executor;
-- Remove only our own transient membership; PG17's bootstrap ADMIN-only row stays.
DO $$
BEGIN
  IF NOT (SELECT rolsuper FROM pg_catalog.pg_roles WHERE rolname=current_user) THEN
    EXECUTE pg_catalog.format('REVOKE rights_executor FROM %I GRANTED BY %I',current_user,current_user);
  END IF;
END $$;
NOTIFY pgrst, 'reload schema';
COMMIT;
