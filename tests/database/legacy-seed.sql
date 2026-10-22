INSERT INTO auth.users(id,email,email_confirmed_at) VALUES
 ('90000000-0000-4000-8000-000000000001','historical-synthetic@nehs.hc.edu.tw',now());
INSERT INTO public.proposals(id,user_id,title,content,status,upvotes_count,reply,author_name,author_email)
  VALUES ('90000000-0000-4000-8000-000000000002','90000000-0000-4000-8000-000000000001','legacy synthetic','preserve 🏫','historical-unknown',37,NULL,'Unverified legacy label','synthetic-legacy@example.invalid'),
  ('90000000-0000-4000-8000-000000000003',NULL,'legacy reply','preserve','pending',4,'  exact 🏫 reply  ',NULL,NULL),
  ('90000000-0000-4000-8000-000000000005','90000000-0000-4000-8000-000000000001','legacy yan-yi','preserve 研議中','研議中',5,NULL,'Unverified legacy label',NULL),
  ('90000000-0000-4000-8000-000000000006','90000000-0000-4000-8000-000000000001','legacy tong-guo','preserve 通過','通過',6,NULL,'Unverified legacy label',NULL),
  ('90000000-0000-4000-8000-000000000007','90000000-0000-4000-8000-000000000001','legacy adopted','preserve 已採納','已採納',7,NULL,'Unverified legacy label',NULL),
  ('90000000-0000-4000-8000-000000000008','90000000-0000-4000-8000-000000000001','legacy rejected-adopt','preserve 不採納','不採納',8,NULL,'Unverified legacy label',NULL),
  ('90000000-0000-4000-8000-000000000009','90000000-0000-4000-8000-000000000001','legacy pending','preserve 待審核','待審核',1,NULL,'Unverified legacy label',NULL),
  ('90000000-0000-4000-8000-000000000010','90000000-0000-4000-8000-000000000001','legacy returned','preserve 被退回','被退回',2,NULL,'Unverified legacy label',NULL);
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
