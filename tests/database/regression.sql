CREATE SCHEMA rights_test;
GRANT USAGE ON SCHEMA rights_test TO anon,authenticated;
CREATE FUNCTION rights_test.assert(p_ok boolean,p_label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF p_ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'Regression assertion: %',p_label; END IF; END $$;
CREATE FUNCTION rights_test.throws(p_sql text,p_state text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE caught text;
BEGIN
  BEGIN EXECUTE p_sql; EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS caught=RETURNED_SQLSTATE; END;
  IF caught IS DISTINCT FROM p_state THEN RAISE EXCEPTION 'Expected SQLSTATE %, got %',p_state,coalesce(caught,'success'); END IF;
END $$;

INSERT INTO auth.users(id,email,email_confirmed_at,raw_user_meta_data,banned_until)
SELECT ('10000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
  'student-'||n||'@nehs.hc.edu.tw',now(),'{"full_name":"Mutable synthetic label"}',NULL
FROM generate_series(1,6) n;
INSERT INTO auth.users(id,email,email_confirmed_at,raw_user_meta_data,banned_until,is_anonymous,deleted_at) VALUES
 ('10000000-0000-4000-8000-000000000010','admin-synthetic@nehs.hc.edu.tw',now(),'{"full_name":"Synthetic admin"}',NULL,false,NULL),
 ('10000000-0000-4000-8000-000000000011','outsider@example.invalid',now(),'{"email":"admin-synthetic@nehs.hc.edu.tw","role":"admin","full_name":"Forged"}',NULL,false,NULL),
 ('10000000-0000-4000-8000-000000000012','unconfirmed@nehs.hc.edu.tw',NULL,'{}',NULL,false,NULL),
 ('10000000-0000-4000-8000-000000000013','banned@nehs.hc.edu.tw',now(),'{}',now()+interval '1 day',false,NULL),
 ('10000000-0000-4000-8000-000000000014','expired-ban@nehs.hc.edu.tw',now(),'{}',now()-interval '1 day',false,NULL),
 ('10000000-0000-4000-8000-000000000015','anonymous@nehs.hc.edu.tw',now(),'{}',NULL,true,NULL),
 ('10000000-0000-4000-8000-000000000016','deleted@nehs.hc.edu.tw',now(),'{}',NULL,false,now()),
 ('10000000-0000-4000-8000-000000000017','spoof@nehs.hc.edu.tw.evil.invalid',now(),'{}',NULL,false,NULL);
INSERT INTO public.admins(email) VALUES ('admin-synthetic@nehs.hc.edu.tw');
INSERT INTO public.proposals(id,title,content,status,author_name,is_anonymous,upvotes_count,legacy_upvotes_count)
 VALUES ('20000000-0000-4000-8000-000000000001','synthetic concurrency','synthetic content','處理中','Legacy synthetic label',false,37,37),
 ('20000000-0000-4000-8000-000000000002','synthetic pending','synthetic content','待審核','Legacy synthetic label',false,0,0),
 ('20000000-0000-4000-8000-000000000003','synthetic legacy','synthetic content','legacy-invalid','Untrusted synthetic',true,0,0);
INSERT INTO public.endorsements(user_id,target_id,target_type) VALUES
 ('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','proposal');

DO $$
DECLARE t text; r text; f record; c record;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon','authenticated'] LOOP
    FOREACH t IN ARRAY ARRAY['admins','endorsements','feedback','feedbacks','home_sections','profiles','proposal_comments','proposals','votes'] LOOP
      PERFORM rights_test.assert(NOT has_table_privilege(r,'public.'||t,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'), 'raw table grant revoked');
      PERFORM rights_test.assert((SELECT relrowsecurity FROM pg_class WHERE oid=('public.'||t)::regclass),'RLS enabled');
    END LOOP;
    FOR f IN SELECT oid FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN ('increment_endorsement','update_endorsement_count','update_proposal_endorsement_count','update_proposal_upvote_count') LOOP
      PERFORM rights_test.assert(NOT has_function_privilege(r,f.oid,'EXECUTE'),'unsafe RPC overload revoked');
    END LOOP;
  END LOOP;
  FOR f IN SELECT p.*,n.nspname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='rights_private' OR (n.nspname='public' AND p.proname LIKE 'rights\_%' ESCAPE '\') LOOP
    PERFORM rights_test.assert(f.proowner=CASE WHEN f.oid='rights_private.user_identity(uuid)'::regprocedure THEN 'postgres'::regrole ELSE 'rights_executor'::regrole END,'isolated function owner with exact identity exception');
    PERFORM rights_test.assert(f.proconfig @> ARRAY['search_path=""'],'empty search_path');
    PERFORM rights_test.assert(NOT EXISTS (SELECT 1 FROM aclexplode(f.proacl) WHERE grantee=0),'no PUBLIC execute');
  END LOOP;
  PERFORM rights_test.assert(NOT has_schema_privilege('authenticated','rights_private','USAGE'),'private schema denied');
  FOREACH r IN ARRAY ARRAY['anon','authenticated'] LOOP
    PERFORM rights_test.assert(NOT has_schema_privilege(r,'rights_private','USAGE,CREATE'),'JWT private schema denied');
    PERFORM rights_test.assert(NOT has_function_privilege(r,'rights_private.user_identity(uuid)','EXECUTE'),'JWT helper denied');
    PERFORM rights_test.assert(NOT pg_has_role(r,'rights_executor','SET'),'JWT cannot assume executor');
  END LOOP;
  PERFORM rights_test.assert(NOT has_any_column_privilege('rights_executor','auth.users','SELECT'),'executor has no direct Auth SELECT');
  PERFORM rights_test.assert(NOT has_schema_privilege('rights_executor','public','CREATE'),'temporary public CREATE removed');
  PERFORM rights_test.assert(NOT pg_has_role('rights_executor','postgres','SET'),'executor cannot assume postgres');
  PERFORM rights_test.assert(NOT (SELECT rolbypassrls FROM pg_roles WHERE rolname='rights_executor'),'executor cannot bypass RLS');
  PERFORM rights_test.assert(has_function_privilege('rights_executor','rights_private.user_identity(uuid)','EXECUTE'),'executor can call narrow helper');
  SELECT * INTO f FROM pg_proc WHERE oid='rights_private.user_identity(uuid)'::regprocedure;
  PERFORM rights_test.assert(f.prosecdef AND f.provolatile='s' AND f.proretset AND f.prorettype='record'::regtype
    AND f.proargnames=ARRAY['p_id','email','email_confirmed_at','banned_until','deleted_at','is_anonymous','display_name']
    AND f.proallargtypes=ARRAY['uuid'::regtype::oid,'text'::regtype::oid,'timestamptz'::regtype::oid,'timestamptz'::regtype::oid,'timestamptz'::regtype::oid,'boolean'::regtype::oid,'text'::regtype::oid], 'narrow stable identity contract');
  PERFORM rights_test.assert(NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public.endorsements'::regclass AND NOT tgisinternal),'only verified counters retired');
END $$;

GRANT USAGE ON SCHEMA rights_test TO rights_executor;
SET ROLE rights_executor;
SELECT rights_test.throws($q$SELECT email FROM auth.users$q$,'42501');
SELECT rights_test.throws($q$CREATE TABLE public.rights_executor_probe(id integer)$q$,'42501');
SELECT rights_test.assert((SELECT count(*) FROM rights_private.user_identity('10000000-0000-4000-8000-000000000001'))=1,'identity at most one row');
SELECT rights_test.assert((SELECT count(*) FROM rights_private.user_identity('ffffffff-ffff-4fff-8fff-ffffffffffff'))=0,'missing identity no row');
RESET ROLE;
REVOKE USAGE ON SCHEMA rights_test FROM rights_executor;

SET ROLE anon;
SELECT rights_test.throws($q$SELECT * FROM rights_private.user_identity('10000000-0000-4000-8000-000000000001')$q$,'42501');
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['admins','endorsements','feedback','feedbacks','home_sections','profiles','proposal_comments','proposals','votes'] LOOP
    PERFORM rights_test.throws(format('SELECT * FROM public.%I',t),'42501');
    PERFORM rights_test.throws(format('DELETE FROM public.%I',t),'42501');
  END LOOP;
END $$;
SELECT rights_test.assert(NOT public.rights_is_admin(),'anon is not admin');
SELECT rights_test.throws($q$ SELECT public.rights_admin_author('proposal','20000000-0000-4000-8000-000000000001') $q$,'42501');
SELECT rights_test.throws($q$ SELECT public.rights_create_proposal('x','body','其他') $q$,'42501');
SELECT rights_test.throws($q$ SELECT public.increment_endorsement('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001') $q$,'42501');
RESET ROLE;

SET ROLE authenticated;
SELECT rights_test.throws($q$SELECT * FROM rights_private.user_identity('10000000-0000-4000-8000-000000000001')$q$,'42501');
DO $$
DECLARE t text; n integer;
BEGIN
  FOREACH t IN ARRAY ARRAY['admins','endorsements','feedback','feedbacks','home_sections','profiles','proposal_comments','proposals','votes'] LOOP
    PERFORM rights_test.throws(format('SELECT * FROM public.%I',t),'42501');
    PERFORM rights_test.throws(format('DELETE FROM public.%I',t),'42501');
  END LOOP;
  PERFORM set_config('request.jwt.claim.sub','',false);
  PERFORM rights_test.throws($q$SELECT public.rights_create_proposal('x','body','其他')$q$,'PT401');
  FOREACH n IN ARRAY ARRAY[11,12,13,15,16,17] LOOP
    PERFORM set_config('request.jwt.claim.sub','10000000-0000-4000-8000-'||lpad(n::text,12,'0'),false);
    PERFORM set_config('request.jwt.claims','{"email":"admin-synthetic@nehs.hc.edu.tw","user_metadata":{"role":"admin","email_verified":true}}',false);
    PERFORM rights_test.assert(NOT public.rights_is_admin(),'ineligible admin denied');
    PERFORM rights_test.throws($q$SELECT public.rights_create_proposal('x','body','其他')$q$,'PT403');
    PERFORM rights_test.throws($q$SELECT public.rights_set_vote('20000000-0000-4000-8000-000000000001',true)$q$,'PT403');
    PERFORM rights_test.throws($q$SELECT public.rights_create_home_section('x','body')$q$,'PT403');
  END LOOP;
  PERFORM set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000014',false);
  PERFORM rights_test.assert((public.rights_create_proposal('expired ban','body','其他')->>'inserted')::boolean,'expired ban permits mutation');
END $$;
SET request.jwt.claim.sub='10000000-0000-4000-8000-000000000001';
SELECT rights_test.assert(NOT public.rights_is_admin(),'student not admin despite forged claims');
SELECT rights_test.throws($q$SELECT public.rights_admin_author('proposal','20000000-0000-4000-8000-000000000001')$q$,'PT403');
SELECT rights_test.throws($q$SELECT public.rights_list_pending_proposals()$q$,'PT403');
SELECT rights_test.throws($q$SELECT public.rights_list_admin_feedback()$q$,'PT403');
SELECT rights_test.throws($q$SELECT public.increment_endorsement('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002')$q$,'42501');
SELECT rights_test.throws($q$INSERT INTO public.admins(email) VALUES ('student-1@nehs.hc.edu.tw')$q$,'42501');
SELECT rights_test.throws($q$UPDATE public.proposals SET upvotes_count=999 WHERE id='20000000-0000-4000-8000-000000000001'$q$,'42501');
SELECT rights_test.throws($q$SELECT rights_private.actor(true)$q$,'42501');

DO $$
DECLARE j jsonb; c uuid; f uuid; p uuid;
BEGIN
  j:=public.rights_create_proposal(repeat('🏫',100),repeat('🏫',5000),'其他'); p:=(j->>'id')::uuid;
  PERFORM rights_test.assert(j->>'version'='1','create version');
  j:=public.rights_create_feedback('',repeat('🏫',16),'其他',true); f:=(j->>'id')::uuid;
  PERFORM set_config('rights_test.feedback_id',f::text,false);
  j:=public.rights_get_public_item('feedback',f);
  PERFORM rights_test.assert(j->>'title'=repeat('🏫',15)||'...' AND NOT j ? 'author_name','unicode feedback fallback and anonymity');
  PERFORM rights_test.assert(NOT (j ?| ARRAY['user_id','email','author_email','user_email','attribution_trusted']),'no identity fields');
  j:=public.rights_add_comment('20000000-0000-4000-8000-000000000001','anonymous synthetic comment',true); c:=(j->>'id')::uuid;
  j:=public.rights_list_public_comments('20000000-0000-4000-8000-000000000001');
  PERFORM rights_test.assert(EXISTS(SELECT 1 FROM jsonb_array_elements(j->'items') x WHERE x->>'id'=c::text AND x->>'author_name'='匿名學生' AND NOT x ? 'user_id'),'anonymous comment redaction');
  PERFORM rights_test.assert(public.rights_set_vote('20000000-0000-4000-8000-000000000001',true)->>'upvotes_count'='38','baseline plus new vote not legacy ledger');
  PERFORM rights_test.assert(public.rights_set_vote('20000000-0000-4000-8000-000000000001',true)->>'upvotes_count'='38','desired state idempotent');
  j:=public.rights_get_public_item('proposal','20000000-0000-4000-8000-000000000001');
  PERFORM rights_test.assert(j->>'version'='1' AND j->>'viewer_voted'='true' AND j->>'legacy_upvotes_count'='37','vote/comment no version bump');
  PERFORM rights_test.assert(public.rights_set_vote('20000000-0000-4000-8000-000000000001',false)->>'upvotes_count'='37','cancel baseline floor');
  PERFORM rights_test.assert(public.rights_set_vote('20000000-0000-4000-8000-000000000001',false)->>'upvotes_count'='37','repeat cancel baseline floor');
  PERFORM rights_test.throws($q$SELECT public.rights_add_comment('20000000-0000-4000-8000-000000000002','pending',false)$q$,'PT409');
  PERFORM rights_test.throws($q$SELECT public.rights_set_vote('20000000-0000-4000-8000-000000000003',true)$q$,'PT409');
END $$;

DO $$
DECLARE f record; i integer; args text[]; expression text; statements text[];
BEGIN
  -- Each non-nullable exposed parameter is independently tested as explicit SQL NULL.
  FOR f IN SELECT p.* FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND p.proname LIKE 'rights\_%' ESCAPE '\' AND p.pronargs>0 LOOP
    args:='{}';
    FOR i IN 1..f.pronargs LOOP
      expression:=CASE f.proargnames[i]
        WHEN 'p_limit' THEN '20' WHEN 'p_cursor' THEN 'NULL::jsonb'
        WHEN 'p_query' THEN quote_literal('') WHEN 'p_kind' THEN quote_literal('proposal')
        WHEN 'p_expected_version' THEN '1::bigint' WHEN 'p_voted' THEN 'true' WHEN 'p_is_anonymous' THEN 'false'
        WHEN 'p_category' THEN quote_literal('其他') WHEN 'p_status' THEN quote_literal('處理中')
        WHEN 'p_id' THEN quote_literal('20000000-0000-4000-8000-000000000001')||'::uuid'
        WHEN 'p_proposal_id' THEN quote_literal('20000000-0000-4000-8000-000000000001')||'::uuid'
        ELSE quote_literal('synthetic') END;
      args:=array_append(args,expression);
    END LOOP;
    FOR i IN 1..f.pronargs LOOP
      IF f.proargnames[i]='p_cursor' THEN CONTINUE; END IF;
      DECLARE tmp text[]:=args;
      BEGIN
        tmp[i]:='NULL::'||format_type(f.proargtypes[i-1],NULL);
        PERFORM set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000010',false);
        PERFORM rights_test.throws(format('SELECT public.%I(%s)',f.proname,array_to_string(tmp,',')),'PT400');
      END;
    END LOOP;
  END LOOP;
  statements:=ARRAY[
    $q$SELECT public.rights_create_proposal(repeat('🏫',101),'body','其他')$q$,
    $q$SELECT public.rights_create_proposal('x',repeat('🏫',5001),'其他')$q$,
    $q$SELECT public.rights_create_proposal('　','body','其他')$q$,
    $q$SELECT public.rights_create_proposal('x','body','invalid')$q$,
    $q$SELECT public.rights_create_feedback('x','body','其他',NULL)$q$,
    $q$SELECT public.rights_add_comment('20000000-0000-4000-8000-000000000001',repeat('🏫',1001),false)$q$,
    $q$SELECT public.rights_list_public_proposals(0)$q$,
    $q$SELECT public.rights_list_public_proposals(51)$q$,
    $q$SELECT public.rights_list_public_proposals(20,'{}')$q$,
    $q$SELECT public.rights_list_public_proposals(20,'{"id":"bad","created_at":"2026-01-01T00:00:00.123456Z"}')$q$,
    $q$SELECT public.rights_list_public_proposals(20,'{"id":"20000000-0000-4000-8000-000000000001","created_at":"infinity"}')$q$,
    $q$SELECT public.rights_list_public_proposals(20,'[]')$q$,
    $q$SELECT public.rights_list_public_proposals(20,NULL,repeat('🏫',101))$q$,
    $q$SELECT public.rights_get_public_item('comment','20000000-0000-4000-8000-000000000001')$q$
  ];
  FOREACH expression IN ARRAY statements LOOP PERFORM rights_test.throws(expression,'PT400'); END LOOP;
  PERFORM rights_test.throws($q$SELECT public.rights_set_vote('20000000-0000-4000-8000-000000000001','not-a-boolean')$q$,'22P02');
  PERFORM rights_test.throws($q$SELECT public.rights_get_public_item('proposal','not-a-uuid')$q$,'22P02');
  PERFORM rights_test.throws($q$SELECT public.rights_create_proposal(123,'body','其他')$q$,'42883');
END $$;

SET request.jwt.claim.sub='10000000-0000-4000-8000-000000000010';
DO $$
DECLARE j jsonb; p uuid; f uuid; c uuid; h uuid;
BEGIN
  PERFORM rights_test.assert(public.rights_is_admin(),'caller-only verified admin');
  j:=public.rights_admin_author('feedback',current_setting('rights_test.feedback_id')::uuid);
  PERFORM rights_test.assert(j->>'attribution'='known' AND j->>'user_id'='10000000-0000-4000-8000-000000000001' AND j->>'email'='student-1@nehs.hc.edu.tw','admin identifies another verified anonymous author only through lookup');
  j:=public.rights_admin_author('proposal','20000000-0000-4000-8000-000000000003');
  PERFORM rights_test.assert(j= jsonb_build_object('attribution','legacy_unverified','user_id',NULL,'email',NULL,'display_name',NULL),'legacy never trusted');
  j:=public.rights_create_feedback('private attribution','synthetic secret content','其他',true); f:=(j->>'id')::uuid;
  j:=public.rights_get_public_item('feedback',f);
  PERFORM rights_test.assert(NOT j ? 'author_name','public DTO redacted even for admin');
  j:=public.rights_admin_author('feedback',f);
  PERFORM rights_test.assert(j->>'attribution'='known' AND j->>'user_id'='10000000-0000-4000-8000-000000000010' AND j->>'email'='admin-synthetic@nehs.hc.edu.tw','trusted new UUID attribution');
  PERFORM rights_test.assert(public.rights_save_feedback_reply(f,'🏫 reply',1)->>'version'='2','feedback reply version');
  PERFORM rights_test.throws(format('SELECT public.rights_save_feedback_reply(%L,''stale draft'',1)',f),'PT409');
  PERFORM public.rights_delete_feedback(f,2);
  j:=public.rights_create_proposal('moderation','synthetic content','其他'); p:=(j->>'id')::uuid;
  PERFORM rights_test.assert(public.rights_approve_proposal(p,1)->>'version'='2','approve increments version');
  PERFORM rights_test.throws(format('SELECT public.rights_reject_proposal(%L,1)',p),'PT409');
  PERFORM rights_test.throws(format('SELECT public.rights_reject_proposal(%L,2)',p),'PT409');
  PERFORM rights_test.throws(format('SELECT public.rights_update_proposal_control(%L,''待審核'','''',2)',p),'PT400');
  PERFORM rights_test.throws(format('SELECT public.rights_update_proposal_control(%L,''處理中'',repeat(''🏫'',5001),2)',p),'PT400');
  PERFORM rights_test.assert(public.rights_update_proposal_control(p,'處理中','final',2)->>'version'='3','control version');
  PERFORM rights_test.throws(format('SELECT public.rights_update_proposal_control(%L,''處理中'',''stale draft'',2)',p),'PT409');
  j:=public.rights_add_comment(p,'delete synthetic comment',false); c:=(j->>'id')::uuid;
  PERFORM rights_test.throws(format('SELECT public.rights_delete_comment(%L,''20000000-0000-4000-8000-000000000001'',1)',c),'PT409');
  PERFORM rights_test.assert(public.rights_delete_comment(c,p,1)->>'deleted'='true','delete comment');
  j:=public.rights_add_comment(p,'cascade synthetic content',true);
  PERFORM rights_test.throws(format('SELECT public.rights_delete_proposal(%L,2)',p),'PT409');
  PERFORM rights_test.assert(public.rights_delete_proposal(p,3)->>'deleted'='true','delete proposal');
  j:=public.rights_create_proposal('reject','body','其他'); p:=(j->>'id')::uuid;
  PERFORM rights_test.assert(public.rights_reject_proposal(p,1)->>'version'='2','reject version');
  PERFORM rights_test.throws(format('SELECT public.rights_approve_proposal(%L,2)',p),'PT409');
  j:=public.rights_create_home_section('synthetic announcement','synthetic body'); h:=(j->>'id')::uuid;
  PERFORM rights_test.assert(j->>'version'='1','home version');
  PERFORM rights_test.throws(format('SELECT public.rights_delete_home_section(%L,2)',h),'PT409');
  PERFORM rights_test.assert(public.rights_delete_home_section(h,1)->>'deleted'='true','home delete');
END $$;
RESET ROLE;

UPDATE auth.users SET banned_until=now()+interval '1 day' WHERE id='10000000-0000-4000-8000-000000000001';
UPDATE auth.users SET email=U&'\3000' || E'\tADMIN-SYNTHETIC@NEHS.HC.EDU.TW\r\n' || U&'\00A0' WHERE id='10000000-0000-4000-8000-000000000010';
SET ROLE authenticated;
SET request.jwt.claim.sub='10000000-0000-4000-8000-000000000010';
SELECT rights_test.assert(public.rights_is_admin(),'admin membership uses lower ECMAScript-trimmed full-domain caller email');
SELECT rights_test.assert(public.rights_admin_author('feedback',current_setting('rights_test.feedback_id')::uuid)->>'email'='student-1@nehs.hc.edu.tw','later banned target author remains identifiable');
SET request.jwt.claim.sub='10000000-0000-4000-8000-000000000001';
SELECT rights_test.throws($q$SELECT public.rights_create_proposal('banned after attribution','body','其他')$q$,'PT403');
RESET ROLE;
UPDATE auth.users SET banned_until=NULL,raw_user_meta_data=jsonb_build_object('full_name',repeat('🏫',201),'private_secret','never return metadata') WHERE id='10000000-0000-4000-8000-000000000001';
UPDATE auth.users SET email='admin-synthetic@nehs.hc.edu.tw' WHERE id='10000000-0000-4000-8000-000000000010';
SELECT rights_test.assert((SELECT char_length(display_name)=200 FROM rights_private.user_identity('10000000-0000-4000-8000-000000000001')),'helper bounds mutable display label');

SELECT rights_test.assert(EXISTS(SELECT 1 FROM rights_private.mutation_history WHERE relation_name='feedback' AND operation='DELETE' AND before_row->>'content'='synthetic secret content' AND actor_id='10000000-0000-4000-8000-000000000010' AND after_row IS NULL),'deletion preserves full audit');
SELECT rights_test.assert(EXISTS(SELECT 1 FROM rights_private.mutation_history WHERE relation_name='proposal_comments' AND operation='DELETE' AND before_row->>'content'='cascade synthetic content'),'cascade deletion audit survives');
SELECT rights_test.assert(EXISTS(SELECT 1 FROM rights_private.mutation_history WHERE operation='UPDATE' AND before_row->>'content_version'='1' AND after_row->>'content_version'='2' AND after_row->>'reply'='🏫 reply'),'before/after version audit');
SELECT rights_test.assert(NOT EXISTS(SELECT 1 FROM rights_private.mutation_history WHERE after_row->>'reply'='stale draft'),'conflicts leave no partial audit or write');
SELECT rights_test.assert((SELECT count(*) FROM public.proposals WHERE id='20000000-0000-4000-8000-000000000003' AND status='legacy-invalid')=1,'historical invalid status preserved');
SELECT rights_test.throws($q$UPDATE public.proposals SET legacy_upvotes_count=0 WHERE id='20000000-0000-4000-8000-000000000001'$q$,'PT409');
SELECT rights_test.throws($q$UPDATE public.proposals SET reply=NULL WHERE id='20000000-0000-4000-8000-000000000001'$q$,'23502');
SELECT rights_test.throws($q$INSERT INTO public.feedback(title,content,category,reply) VALUES ('synthetic','body','其他',NULL)$q$,'23502');

INSERT INTO public.proposals(id,title,content,status,created_at,author_name)
SELECT ('30000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
 CASE WHEN n%11=0 THEN 'synthetic-filter-needle' ELSE 'synthetic-pagination' END,
 'synthetic body',CASE WHEN n%17=0 THEN '待審核' ELSE '處理中' END,
 '2026-01-01T00:00:00.123456Z'::timestamptz + CASE WHEN n%3=0 THEN interval '1 microsecond' ELSE interval '0' END,'Synthetic'
FROM generate_series(1,1107) n;
INSERT INTO public.feedback(id,title,content,category,is_anonymous,author_name,created_at)
SELECT ('40000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'synthetic-pagination','synthetic body','其他',true,'DO NOT LEAK synthetic',
 '2026-01-01T00:00:00.123456Z' FROM generate_series(1,1107) n;
INSERT INTO public.proposal_comments(id,proposal_id,content,is_anonymous,author_name,created_at)
SELECT ('50000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'20000000-0000-4000-8000-000000000001','synthetic-pagination',true,'DO NOT LEAK synthetic',
 '2026-01-01T00:00:00.123456Z'::timestamptz + CASE WHEN n%3=0 THEN interval '1 microsecond' ELSE interval '0' END FROM generate_series(1,1107) n;
INSERT INTO public.home_sections(id,title,content,created_at)
SELECT ('60000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'synthetic-pagination','synthetic body','2026-01-01T00:00:00.123456Z' FROM generate_series(1,1107) n;

SET ROLE anon;
DO $$
DECLARE page jsonb; cursor jsonb; ids uuid[]; j jsonb; kind text; expected integer; count_synthetic integer; loops integer;
  previous_time timestamptz; previous_id uuid;
BEGIN
  FOREACH kind IN ARRAY ARRAY['proposal','feedback','comment','home','filter'] LOOP
    ids:='{}'; cursor:=NULL; count_synthetic:=0; loops:=0; previous_time:=NULL; previous_id:=NULL;
    LOOP
      CASE kind
        WHEN 'proposal' THEN page:=public.rights_list_public_proposals(37,cursor,'synthetic-pagination');
        WHEN 'feedback' THEN page:=public.rights_list_public_feedback(37,cursor,'synthetic-pagination');
        WHEN 'comment' THEN page:=public.rights_list_public_comments('20000000-0000-4000-8000-000000000001',37,cursor);
        WHEN 'home' THEN page:=public.rights_list_home_sections(37,cursor);
        ELSE page:=public.rights_list_public_proposals(3,cursor,'synthetic-filter-needle');
      END CASE;
      PERFORM rights_test.assert(jsonb_array_length(page->'items')<=37,'bounded pages');
      FOR j IN SELECT value FROM jsonb_array_elements(page->'items') LOOP
        IF previous_time IS NOT NULL THEN
          IF kind='comment' THEN
            PERFORM rights_test.assert(((j->>'created_at')::timestamptz,(j->>'id')::uuid)>(previous_time,previous_id),'ascending comment order');
          ELSE
            PERFORM rights_test.assert(((j->>'created_at')::timestamptz,(j->>'id')::uuid)<(previous_time,previous_id),'descending list order');
          END IF;
        END IF;
        previous_time:=(j->>'created_at')::timestamptz; previous_id:=(j->>'id')::uuid;
        IF j->>'title'='synthetic-pagination' OR j->>'content'='synthetic-pagination' OR j->>'title'='synthetic-filter-needle' THEN
          PERFORM rights_test.assert(NOT (j->>'id')::uuid=ANY(ids),'no duplicate cursor rows');
          ids:=array_append(ids,(j->>'id')::uuid); count_synthetic:=count_synthetic+1;
          IF kind IN ('feedback','comment') THEN PERFORM rights_test.assert(NOT j::text LIKE '%DO NOT LEAK%','no anonymous identity leak'); END IF;
        END IF;
        PERFORM rights_test.assert(NOT (j ?| ARRAY['user_id','email','author_email','user_email']),'no raw identity');
      END LOOP;
      cursor:=NULLIF(page->'nextCursor','null'::jsonb); loops:=loops+1;
      EXIT WHEN cursor IS NULL;
      PERFORM rights_test.assert(loops<300,'cursor termination');
      IF kind<>'home' OR (cursor->>'created_at') LIKE '2026-01-01%' THEN
        IF (cursor->>'created_at') LIKE '2026-01-01%' THEN PERFORM rights_test.assert((cursor->>'created_at') ~ '\.12345[67]','native microsecond cursor'); END IF;
      END IF;
    END LOOP;
    expected:=CASE kind WHEN 'proposal' THEN 1107-100-65+5 WHEN 'filter' THEN 100-5 ELSE 1107 END;
    -- 1107 inputs, 100 query matches, 65 pending; their intersections are 5.
    PERFORM rights_test.assert(count_synthetic=expected,'all filtered synthetic rows beyond cap: '||kind);
  END LOOP;
  PERFORM rights_test.assert(public.rights_get_public_item('proposal','20000000-0000-4000-8000-000000000002') IS NULL,'pending hidden');
  PERFORM rights_test.assert(public.rights_get_public_item('proposal','20000000-0000-4000-8000-000000000003') IS NULL,'invalid legacy status hidden, not changed');
  PERFORM rights_test.assert(jsonb_array_length(public.rights_list_public_feedback()->'items')=20,'default page size');
  PERFORM rights_test.assert(jsonb_array_length(public.rights_list_public_feedback(50)->'items')=50,'maximum page size');
END $$;
RESET ROLE;
SET ROLE authenticated;
SET request.jwt.claim.sub='10000000-0000-4000-8000-000000000010';
SELECT rights_test.assert(jsonb_array_length(public.rights_list_pending_proposals()->'items')=20,'admin pending page size');
SELECT rights_test.assert(jsonb_array_length(public.rights_list_admin_feedback()->'items')=20,'admin feedback page size');
RESET ROLE;
