-- NEHS Student Rights schema for an empty Supabase project. Never apply to production.
-- Includes through 20261128033732_drop_legacy_rights_objects.sql
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

--
-- PostgreSQL database dump
--


-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.6

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: pg_database_owner
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: rights_private; Type: SCHEMA; Schema: -; Owner: rights_executor
--

CREATE SCHEMA rights_private;


ALTER SCHEMA rights_private OWNER TO rights_executor;

--
-- Name: rights_add_comment(uuid, uuid, text, boolean); Type: FUNCTION; Schema: public; Owner: rights_executor
--

CREATE FUNCTION public.rights_add_comment(p_client_key uuid, p_proposal_id uuid, p_content text, p_is_anonymous boolean) RETURNS jsonb
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO ''
    AS $$ SELECT rights_private.mutate('add_comment',pg_catalog.jsonb_build_object('client_key',p_client_key,'proposal_id',p_proposal_id,'content',p_content,'is_anonymous',p_is_anonymous)) $$;


ALTER FUNCTION public.rights_add_comment(p_client_key uuid, p_proposal_id uuid, p_content text, p_is_anonymous boolean) OWNER TO rights_executor;

--
-- Name: rights_admin_author(text, uuid); Type: FUNCTION; Schema: public; Owner: rights_executor
--

CREATE FUNCTION public.rights_admin_author(p_kind text, p_id uuid) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $_$
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
END $_$;


ALTER FUNCTION public.rights_admin_author(p_kind text, p_id uuid) OWNER TO rights_executor;

--
-- Name: rights_approve_proposal(uuid, bigint); Type: FUNCTION; Schema: public; Owner: rights_executor
--

CREATE FUNCTION public.rights_approve_proposal(p_id uuid, p_expected_version bigint) RETURNS jsonb
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO ''
    AS $$ SELECT rights_private.mutate('approve_proposal',pg_catalog.jsonb_build_object('id',p_id,'expected_version',p_expected_version)) $$;


ALTER FUNCTION public.rights_approve_proposal(p_id uuid, p_expected_version bigint) OWNER TO rights_executor;

--
-- Name: rights_create_feedback(uuid, text, text, text, boolean); Type: FUNCTION; Schema: public; Owner: rights_executor
--

CREATE FUNCTION public.rights_create_feedback(p_client_key uuid, p_title text, p_content text, p_category text, p_is_anonymous boolean) RETURNS jsonb
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO ''
    AS $$ SELECT rights_private.mutate('create_feedback',pg_catalog.jsonb_build_object('client_key',p_client_key,'title',p_title,'content',p_content,'category',p_category,'is_anonymous',p_is_anonymous)) $$;


ALTER FUNCTION public.rights_create_feedback(p_client_key uuid, p_title text, p_content text, p_category text, p_is_anonymous boolean) OWNER TO rights_executor;

--
-- Name: rights_create_home_section(uuid, text, text); Type: FUNCTION; Schema: public; Owner: rights_executor
--

CREATE FUNCTION public.rights_create_home_section(p_client_key uuid, p_title text, p_content text) RETURNS jsonb
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO ''
    AS $$ SELECT rights_private.mutate('create_home_section',pg_catalog.jsonb_build_object('client_key',p_client_key,'title',p_title,'content',p_content)) $$;


ALTER FUNCTION public.rights_create_home_section(p_client_key uuid, p_title text, p_content text) OWNER TO rights_executor;

--
-- Name: rights_create_proposal(uuid, text, text, text); Type: FUNCTION; Schema: public; Owner: rights_executor
--

CREATE FUNCTION public.rights_create_proposal(p_client_key uuid, p_title text, p_content text, p_category text) RETURNS jsonb
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO ''
    AS $$ SELECT rights_private.mutate('create_proposal',pg_catalog.jsonb_build_object('client_key',p_client_key,'title',p_title,'content',p_content,'category',p_category)) $$;


ALTER FUNCTION public.rights_create_proposal(p_client_key uuid, p_title text, p_content text, p_category text) OWNER TO rights_executor;

--
-- Name: rights_delete_comment(uuid, uuid, bigint); Type: FUNCTION; Schema: public; Owner: rights_executor
--

CREATE FUNCTION public.rights_delete_comment(p_id uuid, p_proposal_id uuid, p_expected_version bigint) RETURNS jsonb
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO ''
    AS $$ SELECT rights_private.mutate('delete_comment',pg_catalog.jsonb_build_object('id',p_id,'proposal_id',p_proposal_id,'expected_version',p_expected_version)) $$;


ALTER FUNCTION public.rights_delete_comment(p_id uuid, p_proposal_id uuid, p_expected_version bigint) OWNER TO rights_executor;

--
-- Name: rights_delete_feedback(uuid, bigint); Type: FUNCTION; Schema: public; Owner: rights_executor
--

CREATE FUNCTION public.rights_delete_feedback(p_id uuid, p_expected_version bigint) RETURNS jsonb
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO ''
    AS $$ SELECT rights_private.mutate('delete_feedback',pg_catalog.jsonb_build_object('id',p_id,'expected_version',p_expected_version)) $$;


ALTER FUNCTION public.rights_delete_feedback(p_id uuid, p_expected_version bigint) OWNER TO rights_executor;

--
-- Name: rights_delete_home_section(uuid, bigint); Type: FUNCTION; Schema: public; Owner: rights_executor
--

CREATE FUNCTION public.rights_delete_home_section(p_id uuid, p_expected_version bigint) RETURNS jsonb
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO ''
    AS $$ SELECT rights_private.mutate('delete_home_section',pg_catalog.jsonb_build_object('id',p_id,'expected_version',p_expected_version)) $$;


ALTER FUNCTION public.rights_delete_home_section(p_id uuid, p_expected_version bigint) OWNER TO rights_executor;

--
-- Name: rights_delete_proposal(uuid, bigint); Type: FUNCTION; Schema: public; Owner: rights_executor
--

CREATE FUNCTION public.rights_delete_proposal(p_id uuid, p_expected_version bigint) RETURNS jsonb
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO ''
    AS $$ SELECT rights_private.mutate('delete_proposal',pg_catalog.jsonb_build_object('id',p_id,'expected_version',p_expected_version)) $$;


ALTER FUNCTION public.rights_delete_proposal(p_id uuid, p_expected_version bigint) OWNER TO rights_executor;

--
-- Name: rights_get_public_item(text, uuid); Type: FUNCTION; Schema: public; Owner: rights_executor
--

CREATE FUNCTION public.rights_get_public_item(p_kind text, p_id uuid) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE j jsonb;
BEGIN
  IF p_kind IS NULL OR p_id IS NULL THEN RAISE SQLSTATE 'PT400' USING MESSAGE='Null argument'; END IF;
  IF p_kind='proposal' THEN SELECT pg_catalog.to_jsonb(p) INTO j FROM public.proposals p WHERE id=p_id AND status IN ('處理中','已結案');
  ELSIF p_kind='feedback' THEN SELECT pg_catalog.to_jsonb(f) INTO j FROM public.feedback f WHERE id=p_id;
  ELSE RAISE SQLSTATE 'PT400' USING MESSAGE='Invalid kind'; END IF;
  IF j IS NULL THEN RETURN NULL; END IF;
  RETURN rights_private.project(p_kind,j);
END $$;


ALTER FUNCTION public.rights_get_public_item(p_kind text, p_id uuid) OWNER TO rights_executor;

--
-- Name: rights_is_admin(); Type: FUNCTION; Schema: public; Owner: rights_executor
--

CREATE FUNCTION public.rights_is_admin() RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
  PERFORM rights_private.actor(true); RETURN true;
EXCEPTION WHEN SQLSTATE 'PT401' OR SQLSTATE 'PT403' THEN RETURN false;
END $$;


ALTER FUNCTION public.rights_is_admin() OWNER TO rights_executor;

--
-- Name: rights_list_admin_feedback(integer, jsonb); Type: FUNCTION; Schema: public; Owner: rights_executor
--

CREATE FUNCTION public.rights_list_admin_feedback(p_limit integer DEFAULT 20, p_cursor jsonb DEFAULT NULL::jsonb) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$ SELECT rights_private.page('admin_feedback',p_limit,p_cursor) $$;


ALTER FUNCTION public.rights_list_admin_feedback(p_limit integer, p_cursor jsonb) OWNER TO rights_executor;

--
-- Name: rights_list_home_sections(integer, jsonb); Type: FUNCTION; Schema: public; Owner: rights_executor
--

CREATE FUNCTION public.rights_list_home_sections(p_limit integer DEFAULT 20, p_cursor jsonb DEFAULT NULL::jsonb) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$ SELECT rights_private.page('home',p_limit,p_cursor) $$;


ALTER FUNCTION public.rights_list_home_sections(p_limit integer, p_cursor jsonb) OWNER TO rights_executor;

--
-- Name: rights_list_pending_proposals(integer, jsonb); Type: FUNCTION; Schema: public; Owner: rights_executor
--

CREATE FUNCTION public.rights_list_pending_proposals(p_limit integer DEFAULT 20, p_cursor jsonb DEFAULT NULL::jsonb) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$ SELECT rights_private.page('pending',p_limit,p_cursor) $$;


ALTER FUNCTION public.rights_list_pending_proposals(p_limit integer, p_cursor jsonb) OWNER TO rights_executor;

--
-- Name: rights_list_public_comments(uuid, integer, jsonb); Type: FUNCTION; Schema: public; Owner: rights_executor
--

CREATE FUNCTION public.rights_list_public_comments(p_proposal_id uuid, p_limit integer DEFAULT 20, p_cursor jsonb DEFAULT NULL::jsonb) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$ SELECT rights_private.page('comment',p_limit,p_cursor,'',p_proposal_id) $$;


ALTER FUNCTION public.rights_list_public_comments(p_proposal_id uuid, p_limit integer, p_cursor jsonb) OWNER TO rights_executor;

--
-- Name: rights_list_public_feedback(integer, jsonb, text); Type: FUNCTION; Schema: public; Owner: rights_executor
--

CREATE FUNCTION public.rights_list_public_feedback(p_limit integer DEFAULT 20, p_cursor jsonb DEFAULT NULL::jsonb, p_query text DEFAULT ''::text) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$ SELECT rights_private.page('feedback',p_limit,p_cursor,p_query) $$;


ALTER FUNCTION public.rights_list_public_feedback(p_limit integer, p_cursor jsonb, p_query text) OWNER TO rights_executor;

--
-- Name: rights_list_public_proposals(integer, jsonb, text); Type: FUNCTION; Schema: public; Owner: rights_executor
--

CREATE FUNCTION public.rights_list_public_proposals(p_limit integer DEFAULT 20, p_cursor jsonb DEFAULT NULL::jsonb, p_query text DEFAULT ''::text) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$ SELECT rights_private.page('proposal',p_limit,p_cursor,p_query) $$;


ALTER FUNCTION public.rights_list_public_proposals(p_limit integer, p_cursor jsonb, p_query text) OWNER TO rights_executor;

--
-- Name: rights_queue_page(text, text, integer, jsonb, text); Type: FUNCTION; Schema: public; Owner: rights_executor
--

CREATE FUNCTION public.rights_queue_page(p_kind text, p_filter text, p_limit integer DEFAULT 20, p_cursor jsonb DEFAULT NULL::jsonb, p_query text DEFAULT ''::text) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$ SELECT rights_private.queue_page(p_kind,p_filter,p_limit,p_cursor,p_query) $$;


ALTER FUNCTION public.rights_queue_page(p_kind text, p_filter text, p_limit integer, p_cursor jsonb, p_query text) OWNER TO rights_executor;

--
-- Name: rights_reject_proposal(uuid, bigint); Type: FUNCTION; Schema: public; Owner: rights_executor
--

CREATE FUNCTION public.rights_reject_proposal(p_id uuid, p_expected_version bigint) RETURNS jsonb
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO ''
    AS $$ SELECT rights_private.mutate('reject_proposal',pg_catalog.jsonb_build_object('id',p_id,'expected_version',p_expected_version)) $$;


ALTER FUNCTION public.rights_reject_proposal(p_id uuid, p_expected_version bigint) OWNER TO rights_executor;

--
-- Name: rights_save_feedback_reply(uuid, text, bigint); Type: FUNCTION; Schema: public; Owner: rights_executor
--

CREATE FUNCTION public.rights_save_feedback_reply(p_id uuid, p_reply text, p_expected_version bigint) RETURNS jsonb
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO ''
    AS $$ SELECT rights_private.mutate('save_feedback_reply',pg_catalog.jsonb_build_object('id',p_id,'reply',p_reply,'expected_version',p_expected_version)) $$;


ALTER FUNCTION public.rights_save_feedback_reply(p_id uuid, p_reply text, p_expected_version bigint) OWNER TO rights_executor;

--
-- Name: rights_set_vote(uuid, boolean); Type: FUNCTION; Schema: public; Owner: rights_executor
--

CREATE FUNCTION public.rights_set_vote(p_proposal_id uuid, p_voted boolean) RETURNS jsonb
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO ''
    AS $$ SELECT rights_private.mutate('set_vote',pg_catalog.jsonb_build_object('proposal_id',p_proposal_id,'voted',p_voted)) $$;


ALTER FUNCTION public.rights_set_vote(p_proposal_id uuid, p_voted boolean) OWNER TO rights_executor;

--
-- Name: rights_update_proposal_control(uuid, text, text, bigint); Type: FUNCTION; Schema: public; Owner: rights_executor
--

CREATE FUNCTION public.rights_update_proposal_control(p_id uuid, p_status text, p_reply text, p_expected_version bigint) RETURNS jsonb
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO ''
    AS $$ SELECT rights_private.mutate('update_proposal_control',pg_catalog.jsonb_build_object('id',p_id,'status',p_status,'reply',p_reply,'expected_version',p_expected_version)) $$;


ALTER FUNCTION public.rights_update_proposal_control(p_id uuid, p_status text, p_reply text, p_expected_version bigint) OWNER TO rights_executor;

--
-- Name: actor(boolean); Type: FUNCTION; Schema: rights_private; Owner: rights_executor
--

CREATE FUNCTION rights_private.actor(p_admin boolean DEFAULT false) RETURNS uuid
    LANGUAGE plpgsql STABLE
    SET search_path TO ''
    AS $_$
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
END $_$;


ALTER FUNCTION rights_private.actor(p_admin boolean) OWNER TO rights_executor;

--
-- Name: audit(); Type: FUNCTION; Schema: rights_private; Owner: rights_executor
--

CREATE FUNCTION rights_private.audit() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
  INSERT INTO rights_private.mutation_history(relation_name,target_id,operation,actor_id,before_row,after_row)
  VALUES (TG_TABLE_NAME,COALESCE(NEW.id,OLD.id),TG_OP,
    COALESCE(NULLIF(pg_catalog.current_setting('request.jwt.claim.sub',true),''),NULLIF(pg_catalog.current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid,
    CASE WHEN TG_OP<>'INSERT' THEN pg_catalog.to_jsonb(OLD) END,
    CASE WHEN TG_OP<>'DELETE' THEN pg_catalog.to_jsonb(NEW) END);
  RETURN NULL;
END $$;


ALTER FUNCTION rights_private.audit() OWNER TO rights_executor;

--
-- Name: live_session_user(); Type: FUNCTION; Schema: rights_private; Owner: postgres
--

CREATE FUNCTION rights_private.live_session_user() RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
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

--
-- Name: mutate(text, jsonb); Type: FUNCTION; Schema: rights_private; Owner: rights_executor
--

CREATE FUNCTION rights_private.mutate(p_action text, p_args jsonb) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $_$
DECLARE u uuid; name text; title text; body text; category text; v_reply text; ident uuid; pid uuid; v bigint;
  k uuid; digest bytea; stored_digest bytea; create_receipt jsonb;
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
    -- The unique key makes concurrent resends wait for the first transaction.
    -- A failed create rolls back the reservation; a successful one fills its receipt before commit.
    INSERT INTO rights_private.create_receipts(caller_id,action,client_key,create_digest)
      VALUES(u,p_action,k,digest) ON CONFLICT (caller_id,action,client_key) DO NOTHING;
    IF NOT FOUND THEN
      SELECT create_digest,receipt INTO stored_digest,create_receipt
        FROM rights_private.create_receipts WHERE caller_id=u AND action=p_action AND client_key=k;
      IF stored_digest IS DISTINCT FROM digest THEN RAISE SQLSTATE 'PT409' USING MESSAGE='Client key conflict'; END IF;
      RETURN create_receipt;
    END IF;
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
        VALUES(title,body,u,name,false,'待審核',true)
        RETURNING id,content_version INTO ident,v;
    ELSIF p_action='create_feedback' THEN
      IF pg_catalog.jsonb_typeof(p_args->'is_anonymous') IS DISTINCT FROM 'boolean' THEN RAISE SQLSTATE 'PT400' USING MESSAGE='Invalid boolean'; END IF;
      IF title='' THEN title:=pg_catalog.left(body,15)||CASE WHEN pg_catalog.char_length(body)>15 THEN '...' ELSE '' END; END IF;
      INSERT INTO public.feedback(title,content,category,user_id,author_name,is_anonymous,attribution_trusted)
        VALUES(title,body,category,u,name,(p_args->>'is_anonymous')::boolean,true)
        RETURNING id,content_version INTO ident,v;
    ELSIF p_action='create_home_section' THEN
      INSERT INTO public.home_sections(title,content) VALUES(title,body)
        RETURNING id,content_version INTO ident,v;
    ELSE
      IF pg_catalog.jsonb_typeof(p_args->'is_anonymous') IS DISTINCT FROM 'boolean' THEN RAISE SQLSTATE 'PT400' USING MESSAGE='Invalid boolean'; END IF;
      pid:=(p_args->>'proposal_id')::uuid;
      -- Serialize against deletion/moderation, without changing proposal version.
      PERFORM 1 FROM public.proposals WHERE id=pid AND status IN ('處理中','已結案') FOR UPDATE;
      IF NOT FOUND THEN RAISE SQLSTATE 'PT409' USING MESSAGE='Proposal unavailable'; END IF;
      INSERT INTO public.proposal_comments(proposal_id,content,user_id,author_name,is_anonymous,attribution_trusted)
        VALUES(pid,body,u,name,(p_args->>'is_anonymous')::boolean,true)
        RETURNING id,content_version INTO ident,v;
    END IF;
    create_receipt:=pg_catalog.jsonb_build_object('inserted',true,'id',ident,'version',v);
    UPDATE rights_private.create_receipts SET receipt=create_receipt WHERE caller_id=u AND action=p_action AND client_key=k;
    RETURN create_receipt;
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
END $_$;


ALTER FUNCTION rights_private.mutate(p_action text, p_args jsonb) OWNER TO rights_executor;

--
-- Name: page(text, integer, jsonb, text, uuid); Type: FUNCTION; Schema: rights_private; Owner: rights_executor
--

CREATE FUNCTION rights_private.page(p_kind text, p_limit integer, p_cursor jsonb, p_query text DEFAULT ''::text, p_proposal_id uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE plpgsql STABLE
    SET search_path TO ''
    AS $_$
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
END $_$;


ALTER FUNCTION rights_private.page(p_kind text, p_limit integer, p_cursor jsonb, p_query text, p_proposal_id uuid) OWNER TO rights_executor;

--
-- Name: project(text, jsonb); Type: FUNCTION; Schema: rights_private; Owner: rights_executor
--

CREATE FUNCTION rights_private.project(p_kind text, p_row jsonb) RETURNS jsonb
    LANGUAGE plpgsql STABLE
    SET search_path TO ''
    AS $$
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


ALTER FUNCTION rights_private.project(p_kind text, p_row jsonb) OWNER TO rights_executor;

--
-- Name: queue_page(text, text, integer, jsonb, text); Type: FUNCTION; Schema: rights_private; Owner: rights_executor
--

CREATE FUNCTION rights_private.queue_page(p_kind text, p_filter text, p_limit integer, p_cursor jsonb, p_query text) RETURNS jsonb
    LANGUAGE plpgsql STABLE
    SET search_path TO ''
    AS $_$
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
END $_$;


ALTER FUNCTION rights_private.queue_page(p_kind text, p_filter text, p_limit integer, p_cursor jsonb, p_query text) OWNER TO rights_executor;

--
-- Name: text_value(text, integer, boolean); Type: FUNCTION; Schema: rights_private; Owner: rights_executor
--

CREATE FUNCTION rights_private.text_value(p_value text, p_max integer, p_empty boolean DEFAULT false) RETURNS text
    LANGUAGE plpgsql IMMUTABLE
    SET search_path TO ''
    AS $$
DECLARE v text;
BEGIN
  -- ECMAScript trim whitespace, including NBSP/ideographic space, Unicode codepoints.
  v := pg_catalog.btrim(p_value, E' \t\n\r\v\f' || U&'\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF');
  IF v IS NULL OR (NOT p_empty AND v='') OR pg_catalog.char_length(v)>p_max THEN
    RAISE SQLSTATE 'PT400' USING MESSAGE='Invalid text';
  END IF;
  RETURN v;
END $$;


ALTER FUNCTION rights_private.text_value(p_value text, p_max integer, p_empty boolean) OWNER TO rights_executor;

--
-- Name: total(uuid, bigint); Type: FUNCTION; Schema: rights_private; Owner: rights_executor
--

CREATE FUNCTION rights_private.total(p_id uuid, p_baseline bigint) RETURNS bigint
    LANGUAGE plpgsql STABLE
    SET search_path TO ''
    AS $$
DECLARE n bigint;
BEGIN
  SELECT p_baseline+count(*) INTO n FROM rights_private.proposal_ballots WHERE proposal_id=p_id;
  IF n NOT BETWEEN 0 AND 9007199254740991 THEN RAISE SQLSTATE 'PT409' USING MESSAGE='Count out of range'; END IF;
  RETURN n;
END $$;


ALTER FUNCTION rights_private.total(p_id uuid, p_baseline bigint) OWNER TO rights_executor;

--
-- Name: user_identity(uuid); Type: FUNCTION; Schema: rights_private; Owner: postgres
--

CREATE FUNCTION rights_private.user_identity(p_id uuid) RETURNS TABLE(email text, email_confirmed_at timestamp with time zone, banned_until timestamp with time zone, deleted_at timestamp with time zone, is_anonymous boolean, display_name text)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT u.email::text,u.email_confirmed_at,u.banned_until,u.deleted_at,u.is_anonymous,
    pg_catalog.left(COALESCE(NULLIF(u.raw_user_meta_data->>'full_name',''),NULLIF(u.raw_user_meta_data->>'name',''),'學生'),200)
  FROM auth.users AS u WHERE u.id=p_id LIMIT 1
$$;


ALTER FUNCTION rights_private.user_identity(p_id uuid) OWNER TO postgres;

--
-- Name: version_row(); Type: FUNCTION; Schema: rights_private; Owner: rights_executor
--

CREATE FUNCTION rights_private.version_row() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
BEGIN
  IF TG_TABLE_NAME='proposals' THEN
    IF NEW.legacy_upvotes_count IS DISTINCT FROM OLD.legacy_upvotes_count THEN
      RAISE SQLSTATE 'PT409' USING MESSAGE='Immutable baseline';
    END IF;
  END IF;
  NEW.content_version := OLD.content_version+1;
  RETURN NEW;
END $$;


ALTER FUNCTION rights_private.version_row() OWNER TO rights_executor;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: admins; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.admins (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email text NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.admins OWNER TO postgres;

--
-- Name: feedback; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.feedback (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    category text NOT NULL,
    title text NOT NULL,
    content text NOT NULL,
    is_anonymous boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    reply text DEFAULT ''::text NOT NULL,
    author_email text,
    author_name text,
    replied_at timestamp with time zone,
    content_version bigint DEFAULT 1 NOT NULL,
    attribution_trusted boolean DEFAULT false NOT NULL,
    CONSTRAINT feedback_content_version_check CHECK (((content_version >= 1) AND (content_version <= '9007199254740991'::bigint)))
);


ALTER TABLE public.feedback OWNER TO postgres;

--
-- Name: COLUMN feedback.attribution_trusted; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.feedback.attribution_trusted IS 'False for all historical attribution, including existing user_id/email/name. Only verified RPC inserts set true.';


--
-- Name: home_sections; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.home_sections (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text NOT NULL,
    content text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    content_version bigint DEFAULT 1 NOT NULL,
    CONSTRAINT home_sections_content_version_check CHECK (((content_version >= 1) AND (content_version <= '9007199254740991'::bigint)))
);


ALTER TABLE public.home_sections OWNER TO postgres;

--
-- Name: proposal_comments; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.proposal_comments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    proposal_id uuid,
    user_id uuid,
    content text NOT NULL,
    is_anonymous boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    author_name text,
    user_email text,
    author_email text,
    content_version bigint DEFAULT 1 NOT NULL,
    attribution_trusted boolean DEFAULT false NOT NULL,
    CONSTRAINT proposal_comments_content_version_check CHECK (((content_version >= 1) AND (content_version <= '9007199254740991'::bigint)))
);


ALTER TABLE public.proposal_comments OWNER TO postgres;

--
-- Name: COLUMN proposal_comments.attribution_trusted; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.proposal_comments.attribution_trusted IS 'False for all historical attribution, including existing user_id/email/name. Only verified RPC inserts set true.';


--
-- Name: proposals; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.proposals (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    title text NOT NULL,
    content text NOT NULL,
    is_anonymous boolean DEFAULT false,
    status text DEFAULT '待審核'::text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    author_name text,
    author_email text,
    reply text DEFAULT ''::text NOT NULL,
    upvotes_count bigint DEFAULT 0 NOT NULL,
    legacy_upvotes_count bigint DEFAULT 0 NOT NULL,
    content_version bigint DEFAULT 1 NOT NULL,
    attribution_trusted boolean DEFAULT false NOT NULL,
    CONSTRAINT proposals_content_version_check CHECK (((content_version >= 1) AND (content_version <= '9007199254740991'::bigint)))
);


ALTER TABLE public.proposals OWNER TO postgres;

--
-- Name: COLUMN proposals.legacy_upvotes_count; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.proposals.legacy_upvotes_count IS 'Immutable displayed upvotes_count at cutover; old ledgers are never recounted.';


--
-- Name: COLUMN proposals.attribution_trusted; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.proposals.attribution_trusted IS 'False for all historical attribution, including existing user_id/email/name. Only verified RPC inserts set true.';


--
-- Name: create_receipts; Type: TABLE; Schema: rights_private; Owner: rights_executor
--

CREATE TABLE rights_private.create_receipts (
    caller_id uuid NOT NULL,
    action text NOT NULL,
    client_key uuid NOT NULL,
    create_digest bytea NOT NULL,
    receipt jsonb
);


ALTER TABLE rights_private.create_receipts OWNER TO rights_executor;

--
-- Name: mutation_history; Type: TABLE; Schema: rights_private; Owner: rights_executor
--

CREATE TABLE rights_private.mutation_history (
    id bigint NOT NULL,
    relation_name text NOT NULL,
    target_id uuid NOT NULL,
    operation text NOT NULL,
    actor_id uuid,
    occurred_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    before_row jsonb,
    after_row jsonb
);


ALTER TABLE rights_private.mutation_history OWNER TO rights_executor;

--
-- Name: mutation_history_id_seq; Type: SEQUENCE; Schema: rights_private; Owner: rights_executor
--

ALTER TABLE rights_private.mutation_history ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME rights_private.mutation_history_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: proposal_ballots; Type: TABLE; Schema: rights_private; Owner: rights_executor
--

CREATE TABLE rights_private.proposal_ballots (
    proposal_id uuid NOT NULL,
    user_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE rights_private.proposal_ballots OWNER TO rights_executor;

--
-- Name: admins admins_email_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.admins
    ADD CONSTRAINT admins_email_key UNIQUE (email);


--
-- Name: admins admins_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.admins
    ADD CONSTRAINT admins_pkey PRIMARY KEY (id);


--
-- Name: feedback feedback_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.feedback
    ADD CONSTRAINT feedback_pkey PRIMARY KEY (id);


--
-- Name: home_sections home_sections_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.home_sections
    ADD CONSTRAINT home_sections_pkey PRIMARY KEY (id);


--
-- Name: proposal_comments proposal_comments_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.proposal_comments
    ADD CONSTRAINT proposal_comments_pkey PRIMARY KEY (id);


--
-- Name: proposals proposals_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.proposals
    ADD CONSTRAINT proposals_pkey PRIMARY KEY (id);


--
-- Name: create_receipts create_receipts_pkey; Type: CONSTRAINT; Schema: rights_private; Owner: rights_executor
--

ALTER TABLE ONLY rights_private.create_receipts
    ADD CONSTRAINT create_receipts_pkey PRIMARY KEY (caller_id, action, client_key);


--
-- Name: mutation_history mutation_history_pkey; Type: CONSTRAINT; Schema: rights_private; Owner: rights_executor
--

ALTER TABLE ONLY rights_private.mutation_history
    ADD CONSTRAINT mutation_history_pkey PRIMARY KEY (id);


--
-- Name: proposal_ballots proposal_ballots_pkey; Type: CONSTRAINT; Schema: rights_private; Owner: rights_executor
--

ALTER TABLE ONLY rights_private.proposal_ballots
    ADD CONSTRAINT proposal_ballots_pkey PRIMARY KEY (proposal_id, user_id);


--
-- Name: rights_comments_proposal_order; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX rights_comments_proposal_order ON public.proposal_comments USING btree (proposal_id, created_at, id);


--
-- Name: rights_comments_user; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX rights_comments_user ON public.proposal_comments USING btree (user_id);


--
-- Name: rights_feedback_awaiting_order; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX rights_feedback_awaiting_order ON public.feedback USING btree (created_at, id) WHERE (reply = ''::text);


--
-- Name: rights_feedback_order; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX rights_feedback_order ON public.feedback USING btree (created_at DESC, id DESC);


--
-- Name: rights_feedback_user; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX rights_feedback_user ON public.feedback USING btree (user_id);


--
-- Name: rights_home_order; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX rights_home_order ON public.home_sections USING btree (created_at DESC, id DESC);


--
-- Name: rights_proposals_order; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX rights_proposals_order ON public.proposals USING btree (created_at DESC, id DESC);


--
-- Name: rights_proposals_status_order; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX rights_proposals_status_order ON public.proposals USING btree (status, created_at DESC, id DESC);


--
-- Name: rights_proposals_user; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX rights_proposals_user ON public.proposals USING btree (user_id);


--
-- Name: rights_ballots_user; Type: INDEX; Schema: rights_private; Owner: rights_executor
--

CREATE INDEX rights_ballots_user ON rights_private.proposal_ballots USING btree (user_id);


--
-- Name: feedback rights_history; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER rights_history AFTER INSERT OR DELETE OR UPDATE ON public.feedback FOR EACH ROW EXECUTE FUNCTION rights_private.audit();


--
-- Name: home_sections rights_history; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER rights_history AFTER INSERT OR DELETE OR UPDATE ON public.home_sections FOR EACH ROW EXECUTE FUNCTION rights_private.audit();


--
-- Name: proposal_comments rights_history; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER rights_history AFTER INSERT OR DELETE OR UPDATE ON public.proposal_comments FOR EACH ROW EXECUTE FUNCTION rights_private.audit();


--
-- Name: proposals rights_history; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER rights_history AFTER INSERT OR DELETE OR UPDATE ON public.proposals FOR EACH ROW EXECUTE FUNCTION rights_private.audit();


--
-- Name: feedback rights_version; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER rights_version BEFORE UPDATE ON public.feedback FOR EACH ROW EXECUTE FUNCTION rights_private.version_row();


--
-- Name: home_sections rights_version; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER rights_version BEFORE UPDATE ON public.home_sections FOR EACH ROW EXECUTE FUNCTION rights_private.version_row();


--
-- Name: proposal_comments rights_version; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER rights_version BEFORE UPDATE ON public.proposal_comments FOR EACH ROW EXECUTE FUNCTION rights_private.version_row();


--
-- Name: proposals rights_version; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER rights_version BEFORE UPDATE ON public.proposals FOR EACH ROW EXECUTE FUNCTION rights_private.version_row();


--
-- Name: feedback feedback_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.feedback
    ADD CONSTRAINT feedback_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: proposal_comments proposal_comments_proposal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.proposal_comments
    ADD CONSTRAINT proposal_comments_proposal_id_fkey FOREIGN KEY (proposal_id) REFERENCES public.proposals(id) ON DELETE CASCADE;


--
-- Name: proposal_comments proposal_comments_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.proposal_comments
    ADD CONSTRAINT proposal_comments_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: proposals proposals_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.proposals
    ADD CONSTRAINT proposals_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: proposal_ballots proposal_ballots_proposal_id_fkey; Type: FK CONSTRAINT; Schema: rights_private; Owner: rights_executor
--

ALTER TABLE ONLY rights_private.proposal_ballots
    ADD CONSTRAINT proposal_ballots_proposal_id_fkey FOREIGN KEY (proposal_id) REFERENCES public.proposals(id) ON DELETE CASCADE;


--
-- Name: proposal_ballots proposal_ballots_user_id_fkey; Type: FK CONSTRAINT; Schema: rights_private; Owner: rights_executor
--

ALTER TABLE ONLY rights_private.proposal_ballots
    ADD CONSTRAINT proposal_ballots_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: home_sections Allow admins delete home sections; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Allow admins delete home sections" ON public.home_sections FOR DELETE USING (((auth.jwt() ->> 'email'::text) IN ( SELECT admins.email
   FROM public.admins)));


--
-- Name: proposal_comments Allow admins delete proposal comments; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Allow admins delete proposal comments" ON public.proposal_comments FOR DELETE USING (((auth.jwt() ->> 'email'::text) IN ( SELECT admins.email
   FROM public.admins)));


--
-- Name: proposals Allow admins delete proposals; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Allow admins delete proposals" ON public.proposals FOR DELETE USING (((auth.jwt() ->> 'email'::text) IN ( SELECT admins.email
   FROM public.admins)));


--
-- Name: home_sections Allow admins insert home sections; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Allow admins insert home sections" ON public.home_sections FOR INSERT WITH CHECK (((auth.jwt() ->> 'email'::text) IN ( SELECT admins.email
   FROM public.admins)));


--
-- Name: home_sections Allow admins to manage home sections; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Allow admins to manage home sections" ON public.home_sections USING (((auth.jwt() ->> 'email'::text) IN ( SELECT admins.email
   FROM public.admins)));


--
-- Name: proposals Allow admins update proposals; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Allow admins update proposals" ON public.proposals FOR UPDATE USING (((auth.jwt() ->> 'email'::text) IN ( SELECT admins.email
   FROM public.admins)));


--
-- Name: feedback Allow all for feedback; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Allow all for feedback" ON public.feedback USING (true);


--
-- Name: proposals Allow all for proposals; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Allow all for proposals" ON public.proposals USING (true);


--
-- Name: admins Allow authenticated users to read admins; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Allow authenticated users to read admins" ON public.admins FOR SELECT TO authenticated USING (true);


--
-- Name: home_sections Allow public read home sections; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Allow public read home sections" ON public.home_sections FOR SELECT USING (true);


--
-- Name: admins; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.admins ENABLE ROW LEVEL SECURITY;

--
-- Name: feedback; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.feedback ENABLE ROW LEVEL SECURITY;

--
-- Name: home_sections; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.home_sections ENABLE ROW LEVEL SECURITY;

--
-- Name: proposal_comments; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.proposal_comments ENABLE ROW LEVEL SECURITY;

--
-- Name: proposals; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.proposals ENABLE ROW LEVEL SECURITY;

--
-- Name: admins rights_executor_admin_lookup; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY rights_executor_admin_lookup ON public.admins FOR SELECT TO rights_executor USING (true);


--
-- Name: feedback rights_executor_delete; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY rights_executor_delete ON public.feedback FOR DELETE TO rights_executor USING (true);


--
-- Name: home_sections rights_executor_delete; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY rights_executor_delete ON public.home_sections FOR DELETE TO rights_executor USING (true);


--
-- Name: proposal_comments rights_executor_delete; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY rights_executor_delete ON public.proposal_comments FOR DELETE TO rights_executor USING (true);


--
-- Name: proposals rights_executor_delete; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY rights_executor_delete ON public.proposals FOR DELETE TO rights_executor USING (true);


--
-- Name: feedback rights_executor_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY rights_executor_insert ON public.feedback FOR INSERT TO rights_executor WITH CHECK (true);


--
-- Name: home_sections rights_executor_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY rights_executor_insert ON public.home_sections FOR INSERT TO rights_executor WITH CHECK (true);


--
-- Name: proposal_comments rights_executor_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY rights_executor_insert ON public.proposal_comments FOR INSERT TO rights_executor WITH CHECK (true);


--
-- Name: proposals rights_executor_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY rights_executor_insert ON public.proposals FOR INSERT TO rights_executor WITH CHECK (true);


--
-- Name: feedback rights_executor_read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY rights_executor_read ON public.feedback FOR SELECT TO rights_executor USING (true);


--
-- Name: home_sections rights_executor_read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY rights_executor_read ON public.home_sections FOR SELECT TO rights_executor USING (true);


--
-- Name: proposal_comments rights_executor_read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY rights_executor_read ON public.proposal_comments FOR SELECT TO rights_executor USING (true);


--
-- Name: proposals rights_executor_read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY rights_executor_read ON public.proposals FOR SELECT TO rights_executor USING (true);


--
-- Name: feedback rights_executor_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY rights_executor_update ON public.feedback FOR UPDATE TO rights_executor USING (true) WITH CHECK (true);


--
-- Name: home_sections rights_executor_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY rights_executor_update ON public.home_sections FOR UPDATE TO rights_executor USING (true) WITH CHECK (true);


--
-- Name: proposal_comments rights_executor_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY rights_executor_update ON public.proposal_comments FOR UPDATE TO rights_executor USING (true) WITH CHECK (true);


--
-- Name: proposals rights_executor_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY rights_executor_update ON public.proposals FOR UPDATE TO rights_executor USING (true) WITH CHECK (true);


--
-- Name: feedback 允許所有人讀取 feedback; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "允許所有人讀取 feedback" ON public.feedback FOR SELECT USING (true);


--
-- Name: proposal_comments 允許所有人讀取 proposal_comments; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "允許所有人讀取 proposal_comments" ON public.proposal_comments FOR SELECT USING (true);


--
-- Name: proposals 允許所有人讀取 proposals; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "允許所有人讀取 proposals" ON public.proposals FOR SELECT USING (true);


--
-- Name: proposal_comments 允許登入者刪除 proposal_comments; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "允許登入者刪除 proposal_comments" ON public.proposal_comments FOR DELETE USING ((auth.role() = 'authenticated'::text));


--
-- Name: feedback 允許登入者新增 feedback; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "允許登入者新增 feedback" ON public.feedback FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: proposal_comments 允許登入者新增 proposal_comments; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "允許登入者新增 proposal_comments" ON public.proposal_comments FOR INSERT WITH CHECK ((auth.role() = 'authenticated'::text));


--
-- Name: proposals 允許登入者新增 proposals; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "允許登入者新增 proposals" ON public.proposals FOR INSERT WITH CHECK ((auth.role() = 'authenticated'::text));


--
-- Name: feedback 允許登入者更新 feedback; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "允許登入者更新 feedback" ON public.feedback FOR UPDATE USING ((auth.role() = 'authenticated'::text));


--
-- Name: proposals 允許登入者更新 proposals; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "允許登入者更新 proposals" ON public.proposals FOR UPDATE USING ((auth.role() = 'authenticated'::text));


--
-- Name: create_receipts; Type: ROW SECURITY; Schema: rights_private; Owner: rights_executor
--

ALTER TABLE rights_private.create_receipts ENABLE ROW LEVEL SECURITY;

--
-- Name: mutation_history; Type: ROW SECURITY; Schema: rights_private; Owner: rights_executor
--

ALTER TABLE rights_private.mutation_history ENABLE ROW LEVEL SECURITY;

--
-- Name: proposal_ballots; Type: ROW SECURITY; Schema: rights_private; Owner: rights_executor
--

ALTER TABLE rights_private.proposal_ballots ENABLE ROW LEVEL SECURITY;

-- Drop grants inherited from the host's default privileges before replaying
-- the dump's explicit grants. The guard ensures these are all app objects.
REVOKE ALL ON ALL TABLES IN SCHEMA public, rights_private FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public, rights_private FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON ALL ROUTINES IN SCHEMA public, rights_private FROM PUBLIC, anon, authenticated, service_role;

--
-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: pg_database_owner
--

GRANT USAGE ON SCHEMA public TO postgres;
GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO service_role;
GRANT USAGE ON SCHEMA public TO rights_executor;


--
-- Name: SCHEMA rights_private; Type: ACL; Schema: -; Owner: rights_executor
--

GRANT USAGE ON SCHEMA rights_private TO postgres;


--
-- Name: FUNCTION rights_add_comment(p_client_key uuid, p_proposal_id uuid, p_content text, p_is_anonymous boolean); Type: ACL; Schema: public; Owner: rights_executor
--

REVOKE ALL ON FUNCTION public.rights_add_comment(p_client_key uuid, p_proposal_id uuid, p_content text, p_is_anonymous boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION public.rights_add_comment(p_client_key uuid, p_proposal_id uuid, p_content text, p_is_anonymous boolean) TO authenticated;


--
-- Name: FUNCTION rights_admin_author(p_kind text, p_id uuid); Type: ACL; Schema: public; Owner: rights_executor
--

REVOKE ALL ON FUNCTION public.rights_admin_author(p_kind text, p_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.rights_admin_author(p_kind text, p_id uuid) TO service_role;
GRANT ALL ON FUNCTION public.rights_admin_author(p_kind text, p_id uuid) TO authenticated;


--
-- Name: FUNCTION rights_approve_proposal(p_id uuid, p_expected_version bigint); Type: ACL; Schema: public; Owner: rights_executor
--

REVOKE ALL ON FUNCTION public.rights_approve_proposal(p_id uuid, p_expected_version bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION public.rights_approve_proposal(p_id uuid, p_expected_version bigint) TO service_role;
GRANT ALL ON FUNCTION public.rights_approve_proposal(p_id uuid, p_expected_version bigint) TO authenticated;


--
-- Name: FUNCTION rights_create_feedback(p_client_key uuid, p_title text, p_content text, p_category text, p_is_anonymous boolean); Type: ACL; Schema: public; Owner: rights_executor
--

REVOKE ALL ON FUNCTION public.rights_create_feedback(p_client_key uuid, p_title text, p_content text, p_category text, p_is_anonymous boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION public.rights_create_feedback(p_client_key uuid, p_title text, p_content text, p_category text, p_is_anonymous boolean) TO authenticated;


--
-- Name: FUNCTION rights_create_home_section(p_client_key uuid, p_title text, p_content text); Type: ACL; Schema: public; Owner: rights_executor
--

REVOKE ALL ON FUNCTION public.rights_create_home_section(p_client_key uuid, p_title text, p_content text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.rights_create_home_section(p_client_key uuid, p_title text, p_content text) TO authenticated;


--
-- Name: FUNCTION rights_create_proposal(p_client_key uuid, p_title text, p_content text, p_category text); Type: ACL; Schema: public; Owner: rights_executor
--

REVOKE ALL ON FUNCTION public.rights_create_proposal(p_client_key uuid, p_title text, p_content text, p_category text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.rights_create_proposal(p_client_key uuid, p_title text, p_content text, p_category text) TO authenticated;


--
-- Name: FUNCTION rights_delete_comment(p_id uuid, p_proposal_id uuid, p_expected_version bigint); Type: ACL; Schema: public; Owner: rights_executor
--

REVOKE ALL ON FUNCTION public.rights_delete_comment(p_id uuid, p_proposal_id uuid, p_expected_version bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION public.rights_delete_comment(p_id uuid, p_proposal_id uuid, p_expected_version bigint) TO service_role;
GRANT ALL ON FUNCTION public.rights_delete_comment(p_id uuid, p_proposal_id uuid, p_expected_version bigint) TO authenticated;


--
-- Name: FUNCTION rights_delete_feedback(p_id uuid, p_expected_version bigint); Type: ACL; Schema: public; Owner: rights_executor
--

REVOKE ALL ON FUNCTION public.rights_delete_feedback(p_id uuid, p_expected_version bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION public.rights_delete_feedback(p_id uuid, p_expected_version bigint) TO service_role;
GRANT ALL ON FUNCTION public.rights_delete_feedback(p_id uuid, p_expected_version bigint) TO authenticated;


--
-- Name: FUNCTION rights_delete_home_section(p_id uuid, p_expected_version bigint); Type: ACL; Schema: public; Owner: rights_executor
--

REVOKE ALL ON FUNCTION public.rights_delete_home_section(p_id uuid, p_expected_version bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION public.rights_delete_home_section(p_id uuid, p_expected_version bigint) TO service_role;
GRANT ALL ON FUNCTION public.rights_delete_home_section(p_id uuid, p_expected_version bigint) TO authenticated;


--
-- Name: FUNCTION rights_delete_proposal(p_id uuid, p_expected_version bigint); Type: ACL; Schema: public; Owner: rights_executor
--

REVOKE ALL ON FUNCTION public.rights_delete_proposal(p_id uuid, p_expected_version bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION public.rights_delete_proposal(p_id uuid, p_expected_version bigint) TO service_role;
GRANT ALL ON FUNCTION public.rights_delete_proposal(p_id uuid, p_expected_version bigint) TO authenticated;


--
-- Name: FUNCTION rights_get_public_item(p_kind text, p_id uuid); Type: ACL; Schema: public; Owner: rights_executor
--

REVOKE ALL ON FUNCTION public.rights_get_public_item(p_kind text, p_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.rights_get_public_item(p_kind text, p_id uuid) TO service_role;
GRANT ALL ON FUNCTION public.rights_get_public_item(p_kind text, p_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.rights_get_public_item(p_kind text, p_id uuid) TO anon;


--
-- Name: FUNCTION rights_is_admin(); Type: ACL; Schema: public; Owner: rights_executor
--

REVOKE ALL ON FUNCTION public.rights_is_admin() FROM PUBLIC;
GRANT ALL ON FUNCTION public.rights_is_admin() TO service_role;
GRANT ALL ON FUNCTION public.rights_is_admin() TO authenticated;
GRANT ALL ON FUNCTION public.rights_is_admin() TO anon;


--
-- Name: FUNCTION rights_list_admin_feedback(p_limit integer, p_cursor jsonb); Type: ACL; Schema: public; Owner: rights_executor
--

REVOKE ALL ON FUNCTION public.rights_list_admin_feedback(p_limit integer, p_cursor jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.rights_list_admin_feedback(p_limit integer, p_cursor jsonb) TO service_role;
GRANT ALL ON FUNCTION public.rights_list_admin_feedback(p_limit integer, p_cursor jsonb) TO authenticated;


--
-- Name: FUNCTION rights_list_home_sections(p_limit integer, p_cursor jsonb); Type: ACL; Schema: public; Owner: rights_executor
--

REVOKE ALL ON FUNCTION public.rights_list_home_sections(p_limit integer, p_cursor jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.rights_list_home_sections(p_limit integer, p_cursor jsonb) TO service_role;
GRANT ALL ON FUNCTION public.rights_list_home_sections(p_limit integer, p_cursor jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.rights_list_home_sections(p_limit integer, p_cursor jsonb) TO anon;


--
-- Name: FUNCTION rights_list_pending_proposals(p_limit integer, p_cursor jsonb); Type: ACL; Schema: public; Owner: rights_executor
--

REVOKE ALL ON FUNCTION public.rights_list_pending_proposals(p_limit integer, p_cursor jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.rights_list_pending_proposals(p_limit integer, p_cursor jsonb) TO service_role;
GRANT ALL ON FUNCTION public.rights_list_pending_proposals(p_limit integer, p_cursor jsonb) TO authenticated;


--
-- Name: FUNCTION rights_list_public_comments(p_proposal_id uuid, p_limit integer, p_cursor jsonb); Type: ACL; Schema: public; Owner: rights_executor
--

REVOKE ALL ON FUNCTION public.rights_list_public_comments(p_proposal_id uuid, p_limit integer, p_cursor jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.rights_list_public_comments(p_proposal_id uuid, p_limit integer, p_cursor jsonb) TO service_role;
GRANT ALL ON FUNCTION public.rights_list_public_comments(p_proposal_id uuid, p_limit integer, p_cursor jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.rights_list_public_comments(p_proposal_id uuid, p_limit integer, p_cursor jsonb) TO anon;


--
-- Name: FUNCTION rights_list_public_feedback(p_limit integer, p_cursor jsonb, p_query text); Type: ACL; Schema: public; Owner: rights_executor
--

REVOKE ALL ON FUNCTION public.rights_list_public_feedback(p_limit integer, p_cursor jsonb, p_query text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.rights_list_public_feedback(p_limit integer, p_cursor jsonb, p_query text) TO service_role;
GRANT ALL ON FUNCTION public.rights_list_public_feedback(p_limit integer, p_cursor jsonb, p_query text) TO authenticated;
GRANT ALL ON FUNCTION public.rights_list_public_feedback(p_limit integer, p_cursor jsonb, p_query text) TO anon;


--
-- Name: FUNCTION rights_list_public_proposals(p_limit integer, p_cursor jsonb, p_query text); Type: ACL; Schema: public; Owner: rights_executor
--

REVOKE ALL ON FUNCTION public.rights_list_public_proposals(p_limit integer, p_cursor jsonb, p_query text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.rights_list_public_proposals(p_limit integer, p_cursor jsonb, p_query text) TO service_role;
GRANT ALL ON FUNCTION public.rights_list_public_proposals(p_limit integer, p_cursor jsonb, p_query text) TO authenticated;
GRANT ALL ON FUNCTION public.rights_list_public_proposals(p_limit integer, p_cursor jsonb, p_query text) TO anon;


--
-- Name: FUNCTION rights_queue_page(p_kind text, p_filter text, p_limit integer, p_cursor jsonb, p_query text); Type: ACL; Schema: public; Owner: rights_executor
--

REVOKE ALL ON FUNCTION public.rights_queue_page(p_kind text, p_filter text, p_limit integer, p_cursor jsonb, p_query text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.rights_queue_page(p_kind text, p_filter text, p_limit integer, p_cursor jsonb, p_query text) TO service_role;
GRANT ALL ON FUNCTION public.rights_queue_page(p_kind text, p_filter text, p_limit integer, p_cursor jsonb, p_query text) TO authenticated;
GRANT ALL ON FUNCTION public.rights_queue_page(p_kind text, p_filter text, p_limit integer, p_cursor jsonb, p_query text) TO anon;


--
-- Name: FUNCTION rights_reject_proposal(p_id uuid, p_expected_version bigint); Type: ACL; Schema: public; Owner: rights_executor
--

REVOKE ALL ON FUNCTION public.rights_reject_proposal(p_id uuid, p_expected_version bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION public.rights_reject_proposal(p_id uuid, p_expected_version bigint) TO service_role;
GRANT ALL ON FUNCTION public.rights_reject_proposal(p_id uuid, p_expected_version bigint) TO authenticated;


--
-- Name: FUNCTION rights_save_feedback_reply(p_id uuid, p_reply text, p_expected_version bigint); Type: ACL; Schema: public; Owner: rights_executor
--

REVOKE ALL ON FUNCTION public.rights_save_feedback_reply(p_id uuid, p_reply text, p_expected_version bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION public.rights_save_feedback_reply(p_id uuid, p_reply text, p_expected_version bigint) TO service_role;
GRANT ALL ON FUNCTION public.rights_save_feedback_reply(p_id uuid, p_reply text, p_expected_version bigint) TO authenticated;


--
-- Name: FUNCTION rights_set_vote(p_proposal_id uuid, p_voted boolean); Type: ACL; Schema: public; Owner: rights_executor
--

REVOKE ALL ON FUNCTION public.rights_set_vote(p_proposal_id uuid, p_voted boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION public.rights_set_vote(p_proposal_id uuid, p_voted boolean) TO service_role;
GRANT ALL ON FUNCTION public.rights_set_vote(p_proposal_id uuid, p_voted boolean) TO authenticated;


--
-- Name: FUNCTION rights_update_proposal_control(p_id uuid, p_status text, p_reply text, p_expected_version bigint); Type: ACL; Schema: public; Owner: rights_executor
--

REVOKE ALL ON FUNCTION public.rights_update_proposal_control(p_id uuid, p_status text, p_reply text, p_expected_version bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION public.rights_update_proposal_control(p_id uuid, p_status text, p_reply text, p_expected_version bigint) TO service_role;
GRANT ALL ON FUNCTION public.rights_update_proposal_control(p_id uuid, p_status text, p_reply text, p_expected_version bigint) TO authenticated;


--
-- Name: FUNCTION actor(p_admin boolean); Type: ACL; Schema: rights_private; Owner: rights_executor
--

REVOKE ALL ON FUNCTION rights_private.actor(p_admin boolean) FROM PUBLIC;


--
-- Name: FUNCTION audit(); Type: ACL; Schema: rights_private; Owner: rights_executor
--

REVOKE ALL ON FUNCTION rights_private.audit() FROM PUBLIC;


--
-- Name: FUNCTION live_session_user(); Type: ACL; Schema: rights_private; Owner: postgres
--

REVOKE ALL ON FUNCTION rights_private.live_session_user() FROM PUBLIC;
GRANT ALL ON FUNCTION rights_private.live_session_user() TO rights_executor;


--
-- Name: FUNCTION mutate(p_action text, p_args jsonb); Type: ACL; Schema: rights_private; Owner: rights_executor
--

REVOKE ALL ON FUNCTION rights_private.mutate(p_action text, p_args jsonb) FROM PUBLIC;


--
-- Name: FUNCTION page(p_kind text, p_limit integer, p_cursor jsonb, p_query text, p_proposal_id uuid); Type: ACL; Schema: rights_private; Owner: rights_executor
--

REVOKE ALL ON FUNCTION rights_private.page(p_kind text, p_limit integer, p_cursor jsonb, p_query text, p_proposal_id uuid) FROM PUBLIC;


--
-- Name: FUNCTION project(p_kind text, p_row jsonb); Type: ACL; Schema: rights_private; Owner: rights_executor
--

REVOKE ALL ON FUNCTION rights_private.project(p_kind text, p_row jsonb) FROM PUBLIC;


--
-- Name: FUNCTION queue_page(p_kind text, p_filter text, p_limit integer, p_cursor jsonb, p_query text); Type: ACL; Schema: rights_private; Owner: rights_executor
--

REVOKE ALL ON FUNCTION rights_private.queue_page(p_kind text, p_filter text, p_limit integer, p_cursor jsonb, p_query text) FROM PUBLIC;


--
-- Name: FUNCTION text_value(p_value text, p_max integer, p_empty boolean); Type: ACL; Schema: rights_private; Owner: rights_executor
--

REVOKE ALL ON FUNCTION rights_private.text_value(p_value text, p_max integer, p_empty boolean) FROM PUBLIC;


--
-- Name: FUNCTION total(p_id uuid, p_baseline bigint); Type: ACL; Schema: rights_private; Owner: rights_executor
--

REVOKE ALL ON FUNCTION rights_private.total(p_id uuid, p_baseline bigint) FROM PUBLIC;


--
-- Name: FUNCTION user_identity(p_id uuid); Type: ACL; Schema: rights_private; Owner: postgres
--

REVOKE ALL ON FUNCTION rights_private.user_identity(p_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION rights_private.user_identity(p_id uuid) TO rights_executor;


--
-- Name: FUNCTION version_row(); Type: ACL; Schema: rights_private; Owner: rights_executor
--

REVOKE ALL ON FUNCTION rights_private.version_row() FROM PUBLIC;


--
-- Name: TABLE admins; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.admins TO service_role;


--
-- Name: COLUMN admins.email; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT(email) ON TABLE public.admins TO rights_executor;


--
-- Name: TABLE feedback; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.feedback TO service_role;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.feedback TO rights_executor;


--
-- Name: TABLE home_sections; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.home_sections TO service_role;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.home_sections TO rights_executor;


--
-- Name: TABLE proposal_comments; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.proposal_comments TO service_role;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.proposal_comments TO rights_executor;


--
-- Name: TABLE proposals; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.proposals TO service_role;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.proposals TO rights_executor;


--
-- PostgreSQL database dump complete
--

REVOKE CREATE ON SCHEMA public FROM rights_executor;
REVOKE rights_executor FROM postgres GRANTED BY postgres;
NOTIFY pgrst, 'reload schema';
COMMIT;
