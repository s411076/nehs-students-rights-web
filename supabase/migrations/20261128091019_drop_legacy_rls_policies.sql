BEGIN;
SET LOCAL lock_timeout = '10s';
SET LOCAL search_path = '';

DROP POLICY "Allow authenticated users to read admins" ON public.admins;

DROP POLICY "允許所有人讀取 feedback" ON public.feedback;
DROP POLICY "允許登入者新增 feedback" ON public.feedback;
DROP POLICY "允許登入者更新 feedback" ON public.feedback;
DROP POLICY "Allow all for feedback" ON public.feedback;

DROP POLICY "Allow public read home sections" ON public.home_sections;
DROP POLICY "Allow admins to manage home sections" ON public.home_sections;
DROP POLICY "Allow admins insert home sections" ON public.home_sections;
DROP POLICY "Allow admins delete home sections" ON public.home_sections;

DROP POLICY "允許所有人讀取 proposal_comments" ON public.proposal_comments;
DROP POLICY "允許登入者新增 proposal_comments" ON public.proposal_comments;
DROP POLICY "允許登入者刪除 proposal_comments" ON public.proposal_comments;
DROP POLICY "Allow admins delete proposal comments" ON public.proposal_comments;

DROP POLICY "允許登入者新增 proposals" ON public.proposals;
DROP POLICY "允許所有人讀取 proposals" ON public.proposals;
DROP POLICY "允許登入者更新 proposals" ON public.proposals;
DROP POLICY "Allow admins update proposals" ON public.proposals;
DROP POLICY "Allow admins delete proposals" ON public.proposals;
DROP POLICY "Allow all for proposals" ON public.proposals;

COMMIT;
