DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.rights_test_preservation b LEFT JOIN (
      SELECT 'proposals' AS kind,id,to_jsonb(p)-ARRAY['reply','legacy_upvotes_count','content_version','attribution_trusted'] AS original,reply FROM public.proposals p
      UNION ALL SELECT 'feedback',id,to_jsonb(f)-ARRAY['reply','content_version','attribution_trusted'],reply FROM public.feedback f
      UNION ALL SELECT 'proposal_comments',id,to_jsonb(c)-ARRAY['content_version','attribution_trusted'],NULL FROM public.proposal_comments c
      UNION ALL SELECT 'home_sections',id,to_jsonb(h)-'content_version',NULL FROM public.home_sections h
    ) a USING (kind,id) WHERE a.id IS NULL OR a.original IS DISTINCT FROM b.original OR a.reply IS DISTINCT FROM b.reply
  ) THEN RAISE EXCEPTION 'Legacy preservation failed'; END IF;
  IF EXISTS (SELECT 1 FROM public.proposals WHERE attribution_trusted OR legacy_upvotes_count<>upvotes_count)
    OR EXISTS (SELECT 1 FROM public.feedback WHERE attribution_trusted)
    OR EXISTS (SELECT 1 FROM public.proposal_comments WHERE attribution_trusted)
    OR EXISTS (SELECT 1 FROM rights_private.proposal_ballots) THEN RAISE EXCEPTION 'Cutover attribution or baseline failed'; END IF;
END $$;
DROP TABLE public.rights_test_preservation;
