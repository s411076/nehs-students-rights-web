CREATE TABLE public.rights_test_preservation AS
SELECT 'proposals' AS kind,id,to_jsonb(p)-'reply' AS original,coalesce(reply,'') AS reply FROM public.proposals p
UNION ALL SELECT 'feedback',id,to_jsonb(f)-'reply',coalesce(reply,'') FROM public.feedback f
UNION ALL SELECT 'proposal_comments',id,to_jsonb(c),NULL FROM public.proposal_comments c
UNION ALL SELECT 'home_sections',id,to_jsonb(h),NULL FROM public.home_sections h;
REVOKE ALL ON public.rights_test_preservation FROM PUBLIC,anon,authenticated;
