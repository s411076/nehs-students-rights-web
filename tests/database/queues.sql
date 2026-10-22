-- Filtered queue gates: accurate totals, snapshot counts, oldest-first
-- awaiting/pending, no private leakage, strict pending admin check, invalid
-- kind/filter/limit/cursor rejection, old read contract intact. Runs after
-- regression.sql in every local gate; reuses rights_test helpers.

-- 60 feedback rows: 30 awaiting (reply=''), 29 replied, 1 whitespace reply
-- (nonempty per contract, so replied). 56 proposal rows: 25 processing,
-- 25 closed, 6 pending. Tied microsecond timestamps exercise keyset ties.
INSERT INTO public.feedback(id,title,content,category,is_anonymous,author_name,reply,created_at)
SELECT ('70000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
  'queue-probe-feedback '||n,'queue-probe-feedback body','其他',true,'DO NOT LEAK queue probe',
  CASE WHEN n<=30 THEN '' WHEN n<60 THEN 'queue reviewed' ELSE '   ' END,
  '2026-03-02T00:00:00.123456Z'::timestamptz + CASE WHEN n%2=0 THEN interval '1 microsecond' ELSE interval '0' END
FROM generate_series(1,60) n;
INSERT INTO public.proposals(id,title,content,status,author_name,is_anonymous,upvotes_count,legacy_upvotes_count,created_at)
SELECT ('71000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
  'queue-probe-proposal '||n,'queue-probe-proposal body',
  CASE WHEN n<=25 THEN '處理中' WHEN n<=50 THEN '已結案' ELSE '待審核' END,
  'Synthetic',false,0,0,
  '2026-03-01T00:00:00.123456Z'::timestamptz + CASE WHEN n%2=0 THEN interval '1 microsecond' ELSE interval '0' END
FROM generate_series(1,56) n;

SET ROLE anon;
DO $$
DECLARE page jsonb; cursor jsonb:=NULL; ids uuid[]:='{}'; j jsonb; loops integer:=0; seen integer:=0;
  prev_t timestamptz:=NULL; prev_i uuid:=NULL;
BEGIN
  page:=public.rights_queue_page('feedback','all',50,NULL,'queue-probe-feedback');
  PERFORM rights_test.assert((page->>'total')::bigint=60,'queue feedback all total over 50 rows');
  PERFORM rights_test.assert((page->'counts'->>'all')::bigint=60 AND (page->'counts'->>'awaiting')::bigint=30
    AND (page->'counts'->>'replied')::bigint=30,'queue feedback counts');
  PERFORM rights_test.assert(jsonb_array_length(page->'items')=50 AND page->'nextCursor' IS NOT NULL
    AND (page->'nextCursor')<>'null'::jsonb,'queue feedback bounded page');
  PERFORM rights_test.assert(NOT page::text LIKE '%DO NOT LEAK%','queue feedback anonymous redaction');
  LOOP
    page:=public.rights_queue_page('feedback','awaiting',7,cursor,'queue-probe-feedback');
    PERFORM rights_test.assert((page->>'total')::bigint=30 AND (page->'counts'->>'awaiting')::bigint=30
      AND (page->'counts'->>'all')::bigint=60,'queue awaiting counts independent of cursor');
    FOR j IN SELECT value FROM jsonb_array_elements(page->'items') LOOP
      IF prev_t IS NOT NULL THEN
        PERFORM rights_test.assert(((j->>'created_at')::timestamptz,(j->>'id')::uuid)>(prev_t,prev_i),'queue awaiting oldest-first with tied timestamps');
      END IF;
      prev_t:=(j->>'created_at')::timestamptz; prev_i:=(j->>'id')::uuid;
      PERFORM rights_test.assert(NOT (j->>'id')::uuid=ANY(ids),'queue awaiting no duplicate rows');
      PERFORM rights_test.assert(j->>'reply'='','queue awaiting only empty replies');
      ids:=array_append(ids,(j->>'id')::uuid); seen:=seen+1;
    END LOOP;
    cursor:=NULLIF(page->'nextCursor','null'::jsonb); loops:=loops+1;
    EXIT WHEN cursor IS NULL;
    PERFORM rights_test.assert(loops<20,'queue awaiting cursor termination');
    PERFORM rights_test.assert((cursor->>'created_at') ~ '\.12345[67]','queue awaiting microsecond cursor');
  END LOOP;
  PERFORM rights_test.assert(seen=30,'queue awaiting all filtered rows beyond a limited page');
  page:=public.rights_queue_page('feedback','awaiting',7,
    jsonb_build_object('created_at',prev_t,'id',prev_i),'queue-probe-feedback');
  PERFORM rights_test.assert(jsonb_array_length(page->'items')=0 AND (page->>'total')::bigint=30
    AND (page->'counts'->>'awaiting')::bigint=30,'queue empty page keeps accurate totals');
  page:=public.rights_queue_page('feedback','all',50,NULL,'queue-probe-feedback-zzz-no-match');
  PERFORM rights_test.assert(jsonb_array_length(page->'items')=0 AND (page->>'total')::bigint=0
    AND (page->'counts'->>'all')::bigint=0,'queue counts are query-matched');
END $$;

DO $$
DECLARE page jsonb; cursor jsonb:=NULL; ids uuid[]:='{}'; j jsonb; loops integer:=0; seen integer:=0;
  prev_t timestamptz:=NULL; prev_i uuid:=NULL;
BEGIN
  page:=public.rights_queue_page('proposal','all',50,NULL,'queue-probe-proposal');
  PERFORM rights_test.assert((page->>'total')::bigint=50,'queue proposal all total excludes pending');
  PERFORM rights_test.assert((page->'counts'->>'all')::bigint=50 AND (page->'counts'->>'processing')::bigint=25
    AND (page->'counts'->>'closed')::bigint=25,'queue proposal counts hide private rows');
  LOOP
    page:=public.rights_queue_page('proposal','processing',7,cursor,'queue-probe-proposal');
    PERFORM rights_test.assert((page->>'total')::bigint=25 AND (page->'counts'->>'processing')::bigint=25
      AND (page->'counts'->>'all')::bigint=50,'queue processing counts independent of cursor');
    FOR j IN SELECT value FROM jsonb_array_elements(page->'items') LOOP
      IF prev_t IS NOT NULL THEN
        PERFORM rights_test.assert(((j->>'created_at')::timestamptz,(j->>'id')::uuid)<(prev_t,prev_i),'queue proposal newest-first');
      END IF;
      prev_t:=(j->>'created_at')::timestamptz; prev_i:=(j->>'id')::uuid;
      PERFORM rights_test.assert(NOT (j->>'id')::uuid=ANY(ids),'queue processing no duplicate rows');
      PERFORM rights_test.assert(j->>'status'='處理中','queue processing only live undecided rows');
      ids:=array_append(ids,(j->>'id')::uuid); seen:=seen+1;
    END LOOP;
    cursor:=NULLIF(page->'nextCursor','null'::jsonb); loops:=loops+1;
    EXIT WHEN cursor IS NULL;
    PERFORM rights_test.assert(loops<20,'queue processing cursor termination');
  END LOOP;
  PERFORM rights_test.assert(seen=25,'queue processing all filtered rows beyond a limited page');
  page:=public.rights_queue_page('proposal','closed',50,NULL,'queue-probe-proposal');
  PERFORM rights_test.assert((page->>'total')::bigint=25 AND jsonb_array_length(page->'items')=25,'queue closed total');
END $$;
RESET ROLE;

-- Pending queue: anon and non-admin authenticated callers learn no counts.
SET ROLE anon;
SELECT rights_test.throws($q$SELECT public.rights_queue_page('pending','pending',20,NULL,'queue-probe-proposal')$q$,'PT401');
RESET ROLE;
SET ROLE authenticated;
SET request.jwt.claim.sub='10000000-0000-4000-8000-000000000001';
SELECT rights_test.throws($q$SELECT public.rights_queue_page('pending','pending',20,NULL,'queue-probe-proposal')$q$,'PT403');
SET request.jwt.claim.sub='10000000-0000-4000-8000-000000000010';
SELECT rights_test.throws($q$SELECT public.rights_queue_page('pending','all',20,NULL,'queue-probe-proposal')$q$,'PT400');
DO $$
DECLARE page jsonb; cursor jsonb:=NULL; ids uuid[]:='{}'; j jsonb; loops integer:=0; seen integer:=0;
  prev_t timestamptz:=NULL; prev_i uuid:=NULL;
BEGIN
  LOOP
    page:=public.rights_queue_page('pending','pending',7,cursor,'queue-probe-proposal');
    PERFORM rights_test.assert((page->>'total')::bigint=6 AND (page->'counts'->>'pending')::bigint=6,'queue pending counts');
    FOR j IN SELECT value FROM jsonb_array_elements(page->'items') LOOP
      IF prev_t IS NOT NULL THEN
        PERFORM rights_test.assert(((j->>'created_at')::timestamptz,(j->>'id')::uuid)>(prev_t,prev_i),'queue pending oldest-first');
      END IF;
      prev_t:=(j->>'created_at')::timestamptz; prev_i:=(j->>'id')::uuid;
      PERFORM rights_test.assert(NOT (j->>'id')::uuid=ANY(ids),'queue pending no duplicate rows');
      PERFORM rights_test.assert(j->>'status'='待審核','queue pending only unpublished rows');
      ids:=array_append(ids,(j->>'id')::uuid); seen:=seen+1;
    END LOOP;
    cursor:=NULLIF(page->'nextCursor','null'::jsonb); loops:=loops+1;
    EXIT WHEN cursor IS NULL;
    PERFORM rights_test.assert(loops<20,'queue pending cursor termination');
  END LOOP;
  PERFORM rights_test.assert(seen=6,'queue pending all filtered rows beyond a limited page');
END $$;
RESET ROLE;

-- Invalid kind/filter/limit/cursor and explicit NULL boundaries.
SET ROLE anon;
DO $$
DECLARE statements text[]:=ARRAY[
  $q$SELECT public.rights_queue_page('unknown','all')$q$,
  $q$SELECT public.rights_queue_page('feedback','processing')$q$,
  $q$SELECT public.rights_queue_page('proposal','awaiting')$q$,
  $q$SELECT public.rights_queue_page('feedback','all',0)$q$,
  $q$SELECT public.rights_queue_page('feedback','all',51)$q$,
  $q$SELECT public.rights_queue_page('feedback','all',20,'{}')$q$,
  $q$SELECT public.rights_queue_page('feedback','all',20,'{"id":"bad","created_at":"2026-01-01T00:00:00.123456Z"}')$q$,
  $q$SELECT public.rights_queue_page('feedback','all',20,'{"id":"70000000-0000-4000-8000-000000000001","created_at":"infinity"}')$q$,
  $q$SELECT public.rights_queue_page('feedback','all',20,'[]')$q$,
  $q$SELECT public.rights_queue_page('feedback','all',20,NULL,repeat('x',101))$q$,
  $q$SELECT public.rights_queue_page(NULL,'all')$q$,
  $q$SELECT public.rights_queue_page('feedback',NULL)$q$,
  $q$SELECT public.rights_queue_page('feedback','all',NULL)$q$,
  $q$SELECT public.rights_queue_page('feedback','all',20,NULL,NULL)$q$
];
DECLARE expression text;
BEGIN
  FOREACH expression IN ARRAY statements LOOP PERFORM rights_test.throws(expression,'PT400'); END LOOP;
END $$;
RESET ROLE;

-- Old read contract still works beside the new queue RPC.
SET ROLE anon;
SELECT rights_test.assert(jsonb_array_length(public.rights_list_public_feedback()->'items')=20,'old feedback read default page intact');
SELECT rights_test.assert(jsonb_array_length(public.rights_list_public_proposals(50,NULL,'queue-probe-proposal')->'items')=50,'old proposal read intact');
SELECT rights_test.assert(public.rights_get_public_item('proposal','71000000-0000-4000-8000-000000000051') IS NULL,'old targeted read still hides pending');
RESET ROLE;

-- Ownership, grants, index: executor-owned definer, explicit JWT execute grants,
-- no private EXECUTE leakage, partial awaiting index present.
SELECT rights_test.assert((SELECT proowner='rights_executor'::regrole FROM pg_proc WHERE oid='public.rights_queue_page(text,text,integer,jsonb,text)'::regprocedure),'queue wrapper executor-owned');
SELECT rights_test.assert((SELECT proowner='rights_executor'::regrole FROM pg_proc WHERE oid='rights_private.queue_page(text,text,integer,jsonb,text)'::regprocedure),'queue private executor-owned');
SELECT rights_test.assert((SELECT prosecdef FROM pg_proc WHERE oid='public.rights_queue_page(text,text,integer,jsonb,text)'::regprocedure),'queue wrapper definer');
SELECT rights_test.assert(has_function_privilege('anon','public.rights_queue_page(text,text,integer,jsonb,text)'::regprocedure,'EXECUTE'),'queue anon execute granted');
SELECT rights_test.assert(has_function_privilege('authenticated','public.rights_queue_page(text,text,integer,jsonb,text)'::regprocedure,'EXECUTE'),'queue authenticated execute granted');
SELECT rights_test.assert(NOT has_function_privilege('anon','rights_private.queue_page(text,text,integer,jsonb,text)'::regprocedure,'EXECUTE'),'queue private denied to anon');
SELECT rights_test.assert(NOT has_function_privilege('authenticated','rights_private.queue_page(text,text,integer,jsonb,text)'::regprocedure,'EXECUTE'),'queue private denied to authenticated');
SELECT rights_test.assert(EXISTS(SELECT 1 FROM pg_indexes WHERE indexname='rights_feedback_awaiting_order'),'queue awaiting partial index present');
