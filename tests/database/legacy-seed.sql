INSERT INTO auth.users(id,email,email_confirmed_at) VALUES
 ('90000000-0000-4000-8000-000000000001','historical-synthetic@nehs.hc.edu.tw',now());
INSERT INTO public.proposals(id,user_id,title,content,status,upvotes_count,reply,author_name,author_email)
 VALUES ('90000000-0000-4000-8000-000000000002','90000000-0000-4000-8000-000000000001','legacy synthetic','preserve 🏫','historical-unknown',37,NULL,'Unverified legacy label','synthetic-legacy@example.invalid'),
 ('90000000-0000-4000-8000-000000000003',NULL,'legacy reply','preserve','pending',4,'  exact 🏫 reply  ',NULL,NULL);
INSERT INTO public.feedback(id,title,content,category,reply,author_name,is_anonymous)
 VALUES ('90000000-0000-4000-8000-000000000004','legacy feedback','preserve','historical-category',NULL,'Unverified legacy label',true);
INSERT INTO public.endorsements(user_id,target_id,target_type) VALUES
 ('90000000-0000-4000-8000-000000000001','90000000-0000-4000-8000-000000000002','proposal');
INSERT INTO public.proposal_comments(proposal_id,content,author_name,is_anonymous) VALUES
 ('90000000-0000-4000-8000-000000000002','legacy synthetic comment','Legacy synthetic label',true);
INSERT INTO public.home_sections(title,content) VALUES ('legacy synthetic announcement','preserve');
CREATE FUNCTION public.increment_endorsement(text,text) RETURNS void LANGUAGE sql AS $$ SELECT pg_catalog.pg_sleep(0) $$;
ALTER FUNCTION public.increment_endorsement(text,text) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.increment_endorsement(text,text) TO anon,authenticated;
