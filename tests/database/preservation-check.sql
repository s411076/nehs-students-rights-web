DO $$
DECLARE remaining text;
BEGIN
  SELECT string_agg(object_name, ', ' ORDER BY object_name) INTO remaining
  FROM (
    SELECT format('%I.%I', 'public', relname) AS object_name
    FROM pg_class WHERE relnamespace='public'::regnamespace
      AND relname IN ('feedbacks','endorsements','votes','profiles')
    UNION ALL
    SELECT oid::regprocedure::text FROM pg_proc WHERE pronamespace='public'::regnamespace
      AND proname IN ('increment_endorsement','update_endorsement_count','update_proposal_endorsement_count','update_proposal_upvote_count')
    UNION ALL
    SELECT format('%I.%I.%I', 'public', c.relname, a.attname)
    FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid
    WHERE c.relnamespace='public'::regnamespace AND a.attnum>0 AND NOT a.attisdropped AND (
      (c.relname='proposals' AND a.attname IN ('status_reason','upvote_count','endorsement_count','admin_response','responded_at','endorsements_count','endorsed_by'))
      OR (c.relname='feedback' AND a.attname IN ('admin_response','responded_at','endorsement_count'))
    )
  ) legacy;
  IF remaining IS NOT NULL THEN RAISE EXCEPTION 'Legacy objects remain: %',remaining; END IF;

  IF EXISTS (
    SELECT 1 FROM public.rights_test_preservation b FULL JOIN (
      SELECT 'proposals' AS kind,id,to_jsonb(p)-ARRAY['reply','legacy_upvotes_count','content_version','attribution_trusted'] AS original,reply FROM public.proposals p
      UNION ALL SELECT 'feedback',id,to_jsonb(f)-ARRAY['reply','content_version','attribution_trusted'],reply FROM public.feedback f
      UNION ALL SELECT 'proposal_comments',id,to_jsonb(c)-ARRAY['content_version','attribution_trusted'],NULL FROM public.proposal_comments c
      UNION ALL SELECT 'home_sections',id,to_jsonb(h)-'content_version',NULL FROM public.home_sections h
      UNION ALL SELECT 'admins',id,to_jsonb(d),NULL FROM public.admins d
    ) a USING (kind,id)
    WHERE a.id IS NULL OR b.id IS NULL
      OR (b.kind<>'proposals' AND (a.original IS DISTINCT FROM b.original OR a.reply IS DISTINCT FROM b.reply))
      OR (b.kind='proposals' AND (
        (a.original-'status') IS DISTINCT FROM (b.original-'status')
        OR a.reply IS DISTINCT FROM b.reply
        OR (a.original->>'status') IS DISTINCT FROM CASE b.original->>'status'
          WHEN '研議中' THEN '處理中'
          WHEN '通過' THEN '處理中'
          WHEN '已採納' THEN '已結案'
          WHEN '不採納' THEN '已結案'
          ELSE b.original->>'status'
        END
      ))
  ) THEN RAISE EXCEPTION 'Retained row preservation failed'; END IF;
  IF EXISTS (SELECT 1 FROM public.proposals WHERE attribution_trusted OR legacy_upvotes_count<>upvotes_count)
    OR EXISTS (SELECT 1 FROM public.feedback WHERE attribution_trusted)
    OR EXISTS (SELECT 1 FROM public.proposal_comments WHERE attribution_trusted)
    OR EXISTS (SELECT 1 FROM rights_private.proposal_ballots) THEN RAISE EXCEPTION 'Cutover attribution or baseline failed'; END IF;
  -- Status collapse keeps its own guard too: only the exact four legacy
  -- public mappings may change; pending/returned/unknown stay byte-identical
  -- (checked above). Fail if any legacy source status survived.
  IF EXISTS (SELECT 1 FROM public.proposals WHERE status IN ('研議中','通過','已採納','不採納')) THEN
    RAISE EXCEPTION 'Legacy public status remains';
  END IF;
  -- content_version bumps from the backfill UPDATE trigger are legitimate
  -- concurrency-guard increments; preservation ignores that column by design
  -- and never resets it. Fail if any version left the safe-integer guard.
  IF EXISTS (SELECT 1 FROM public.proposals WHERE content_version NOT BETWEEN 1 AND 9007199254740991)
    OR EXISTS (SELECT 1 FROM public.feedback WHERE content_version NOT BETWEEN 1 AND 9007199254740991)
    OR EXISTS (SELECT 1 FROM public.proposal_comments WHERE content_version NOT BETWEEN 1 AND 9007199254740991)
    OR EXISTS (SELECT 1 FROM public.home_sections WHERE content_version NOT BETWEEN 1 AND 9007199254740991) THEN
    RAISE EXCEPTION 'Version guard out of range';
  END IF;
END $$;
DROP TABLE public.rights_test_preservation;
