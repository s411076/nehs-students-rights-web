CREATE TABLE public.rights_test_preservation AS
SELECT 'proposals' AS kind,id,
  to_jsonb(p)-ARRAY['reply','status_reason','upvote_count','endorsement_count','admin_response','responded_at','endorsements_count','endorsed_by'] AS original,
  coalesce(reply,'') AS reply FROM public.proposals p
UNION ALL SELECT 'feedback',id,
  to_jsonb(f)-ARRAY['reply','admin_response','responded_at','endorsement_count'],coalesce(reply,'') FROM public.feedback f
UNION ALL SELECT 'proposal_comments',id,to_jsonb(c),NULL FROM public.proposal_comments c
UNION ALL SELECT 'home_sections',id,to_jsonb(h),NULL FROM public.home_sections h
UNION ALL SELECT 'admins',id,to_jsonb(d),NULL FROM public.admins d;
REVOKE ALL ON public.rights_test_preservation FROM PUBLIC,anon,authenticated;
