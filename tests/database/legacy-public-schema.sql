--
-- PostgreSQL database dump
--

\restrict LfdzPQdO4euBDI9UoSHOS07ZgVhXAjvBnstWINc64MHplTWL639hqVeHxZ0YGUd

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

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: pg_database_owner
--

CREATE SCHEMA IF NOT EXISTS public;


ALTER SCHEMA public OWNER TO pg_database_owner;

--
-- Name: increment_endorsement(uuid, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.increment_endorsement(proposal_id_input uuid, user_id_input uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
    -- 嘗試插入連署紀錄，如果已存在（重複點擊）則直接忽略，不做任何事
    INSERT INTO endorsements (target_id, user_id, target_type)
    VALUES (proposal_id_input, user_id_input, 'proposal')
    ON CONFLICT (target_id, user_id) DO NOTHING;

    -- 強制將該提案的人數更新為「真實不重複連署筆數」
    UPDATE proposals
    SET upvote_count = (
        SELECT COUNT(*) FROM endorsements WHERE target_id = proposal_id_input
    )
    WHERE id = proposal_id_input;
END;
$$;


ALTER FUNCTION public.increment_endorsement(proposal_id_input uuid, user_id_input uuid) OWNER TO postgres;

--
-- Name: update_endorsement_count(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.update_endorsement_count() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  IF (TG_OP = 'INSERT') THEN
    IF (NEW.target_type = 'proposal') THEN
      UPDATE public.proposals SET endorsement_count = endorsement_count + 1 WHERE id = NEW.target_id;
    END IF;
  ELSIF (TG_OP = 'DELETE') THEN
    IF (OLD.target_type = 'proposal') THEN
      UPDATE public.proposals SET endorsement_count = endorsement_count - 1 WHERE id = OLD.target_id;
    END IF;
  END IF;
  RETURN NULL;
END;
$$;


ALTER FUNCTION public.update_endorsement_count() OWNER TO postgres;

--
-- Name: update_proposal_endorsement_count(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.update_proposal_endorsement_count() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
    IF (TG_OP = 'INSERT') THEN
        UPDATE proposals 
        SET endorsement_count = (
            SELECT COUNT(*) FROM endorsements WHERE target_id = NEW.target_id
        )
        WHERE id = NEW.target_id;
    ELSIF (TG_OP = 'DELETE') THEN
        UPDATE proposals 
        SET endorsement_count = (
            SELECT COUNT(*) FROM endorsements WHERE target_id = OLD.target_id
        )
        WHERE id = OLD.target_id;
    END IF;
    RETURN NULL;
END;
$$;


ALTER FUNCTION public.update_proposal_endorsement_count() OWNER TO postgres;

--
-- Name: update_proposal_upvote_count(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.update_proposal_upvote_count() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
    UPDATE proposals 
    SET upvote_count = (
        SELECT COUNT(*) FROM endorsements WHERE target_id = COALESCE(NEW.target_id, OLD.target_id)
    )
    WHERE id = COALESCE(NEW.target_id, OLD.target_id);
    RETURN NULL;
END;
$$;


ALTER FUNCTION public.update_proposal_upvote_count() OWNER TO postgres;

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
-- Name: endorsements; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.endorsements (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    target_type text NOT NULL,
    target_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT endorsements_target_type_check CHECK ((target_type = ANY (ARRAY['feedback'::text, 'proposal'::text])))
);


ALTER TABLE public.endorsements OWNER TO postgres;

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
    admin_response text,
    responded_at timestamp with time zone,
    endorsement_count integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    reply text DEFAULT ''::text,
    author_email text,
    author_name text,
    replied_at timestamp with time zone
);


ALTER TABLE public.feedback OWNER TO postgres;

--
-- Name: feedbacks; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.feedbacks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    category text NOT NULL,
    title text NOT NULL,
    content text NOT NULL,
    is_anonymous boolean DEFAULT false,
    status text DEFAULT '未回應'::text,
    admin_response text,
    admin_response_at timestamp with time zone,
    upvote_count integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    responded_at timestamp with time zone,
    author_name text,
    user_email text
);


ALTER TABLE public.feedbacks OWNER TO postgres;

--
-- Name: home_sections; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.home_sections (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text NOT NULL,
    content text NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.home_sections OWNER TO postgres;

--
-- Name: profiles; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.profiles (
    id uuid NOT NULL,
    email text NOT NULL,
    full_name text,
    role text DEFAULT 'student'::text,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT profiles_role_check CHECK ((role = ANY (ARRAY['student'::text, 'admin'::text])))
);


ALTER TABLE public.profiles OWNER TO postgres;

--
-- Name: proposal_comments; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.proposal_comments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    proposal_id uuid,
    user_id uuid,
    content text NOT NULL,
    is_anonymous boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    author_name text,
    user_email text,
    author_email text
);


ALTER TABLE public.proposal_comments OWNER TO postgres;

--
-- Name: proposals; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.proposals (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    title text NOT NULL,
    content text NOT NULL,
    is_anonymous boolean DEFAULT false,
    status text DEFAULT 'pending'::text,
    status_reason text,
    upvote_count integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    endorsement_count integer DEFAULT 0,
    admin_response text,
    responded_at timestamp with time zone,
    author_name text,
    author_email text,
    reply text DEFAULT ''::text,
    endorsements_count integer DEFAULT 0,
    endorsed_by text[] DEFAULT '{}'::text[],
    upvotes_count integer DEFAULT 0
);


ALTER TABLE public.proposals OWNER TO postgres;

--
-- Name: votes; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.votes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    target_type text NOT NULL,
    target_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT votes_target_type_check CHECK ((target_type = ANY (ARRAY['feedback'::text, 'proposal'::text])))
);


ALTER TABLE public.votes OWNER TO postgres;

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
-- Name: endorsements endorsements_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.endorsements
    ADD CONSTRAINT endorsements_pkey PRIMARY KEY (id);


--
-- Name: endorsements endorsements_user_id_target_type_target_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.endorsements
    ADD CONSTRAINT endorsements_user_id_target_type_target_id_key UNIQUE (user_id, target_type, target_id);


--
-- Name: feedback feedback_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.feedback
    ADD CONSTRAINT feedback_pkey PRIMARY KEY (id);


--
-- Name: feedbacks feedbacks_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.feedbacks
    ADD CONSTRAINT feedbacks_pkey PRIMARY KEY (id);


--
-- Name: home_sections home_sections_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.home_sections
    ADD CONSTRAINT home_sections_pkey PRIMARY KEY (id);


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


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
-- Name: endorsements unique_user_endorsement; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.endorsements
    ADD CONSTRAINT unique_user_endorsement UNIQUE (target_id, user_id);


--
-- Name: endorsements unique_user_target_endorsement; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.endorsements
    ADD CONSTRAINT unique_user_target_endorsement UNIQUE (target_id, user_id);


--
-- Name: votes votes_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.votes
    ADD CONSTRAINT votes_pkey PRIMARY KEY (id);


--
-- Name: votes votes_user_id_target_type_target_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.votes
    ADD CONSTRAINT votes_user_id_target_type_target_id_key UNIQUE (user_id, target_type, target_id);


--
-- Name: endorsements on_endorsement_change; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER on_endorsement_change AFTER INSERT OR DELETE ON public.endorsements FOR EACH ROW EXECUTE FUNCTION public.update_endorsement_count();


--
-- Name: endorsements trigger_update_endorsement_count; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trigger_update_endorsement_count AFTER INSERT OR DELETE ON public.endorsements FOR EACH ROW EXECUTE FUNCTION public.update_proposal_endorsement_count();


--
-- Name: endorsements trigger_update_upvote_count; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trigger_update_upvote_count AFTER INSERT OR DELETE ON public.endorsements FOR EACH ROW EXECUTE FUNCTION public.update_proposal_upvote_count();


--
-- Name: endorsements endorsements_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.endorsements
    ADD CONSTRAINT endorsements_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: feedback feedback_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.feedback
    ADD CONSTRAINT feedback_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: feedbacks feedbacks_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.feedbacks
    ADD CONSTRAINT feedbacks_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: profiles profiles_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;


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
-- Name: votes votes_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.votes
    ADD CONSTRAINT votes_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


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
-- Name: endorsements; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.endorsements ENABLE ROW LEVEL SECURITY;

--
-- Name: home_sections; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.home_sections ENABLE ROW LEVEL SECURITY;

--
-- Name: endorsements 允許所有人讀取 endorsements; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "允許所有人讀取 endorsements" ON public.endorsements FOR SELECT USING (true);


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
-- Name: feedbacks 允許登入者刪除 feedbacks; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "允許登入者刪除 feedbacks" ON public.feedbacks FOR DELETE USING ((auth.role() = 'authenticated'::text));


--
-- Name: proposal_comments 允許登入者刪除 proposal_comments; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "允許登入者刪除 proposal_comments" ON public.proposal_comments FOR DELETE USING ((auth.role() = 'authenticated'::text));


--
-- Name: endorsements 允許登入者刪除自己的 endorsements; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "允許登入者刪除自己的 endorsements" ON public.endorsements FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: endorsements 允許登入者新增 endorsements; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "允許登入者新增 endorsements" ON public.endorsements FOR INSERT WITH CHECK ((auth.uid() = user_id));


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
-- Name: endorsements 允許登入者新增/刪除 endorsements; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "允許登入者新增/刪除 endorsements" ON public.endorsements WITH CHECK ((auth.role() = 'authenticated'::text));


--
-- Name: feedback 允許登入者更新 feedback; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "允許登入者更新 feedback" ON public.feedback FOR UPDATE USING ((auth.role() = 'authenticated'::text));


--
-- Name: feedbacks 允許登入者更新 feedbacks; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "允許登入者更新 feedbacks" ON public.feedbacks FOR UPDATE USING ((auth.role() = 'authenticated'::text));


--
-- Name: proposals 允許登入者更新 proposals; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "允許登入者更新 proposals" ON public.proposals FOR UPDATE USING ((auth.role() = 'authenticated'::text));


--
-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: pg_database_owner
--

GRANT USAGE ON SCHEMA public TO postgres;
GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO service_role;


--
-- Name: FUNCTION increment_endorsement(proposal_id_input uuid, user_id_input uuid); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.increment_endorsement(proposal_id_input uuid, user_id_input uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.increment_endorsement(proposal_id_input uuid, user_id_input uuid) TO authenticated;
GRANT ALL ON FUNCTION public.increment_endorsement(proposal_id_input uuid, user_id_input uuid) TO service_role;


--
-- Name: FUNCTION update_endorsement_count(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.update_endorsement_count() TO anon;
GRANT ALL ON FUNCTION public.update_endorsement_count() TO authenticated;
GRANT ALL ON FUNCTION public.update_endorsement_count() TO service_role;


--
-- Name: FUNCTION update_proposal_endorsement_count(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.update_proposal_endorsement_count() TO anon;
GRANT ALL ON FUNCTION public.update_proposal_endorsement_count() TO authenticated;
GRANT ALL ON FUNCTION public.update_proposal_endorsement_count() TO service_role;


--
-- Name: FUNCTION update_proposal_upvote_count(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.update_proposal_upvote_count() TO anon;
GRANT ALL ON FUNCTION public.update_proposal_upvote_count() TO authenticated;
GRANT ALL ON FUNCTION public.update_proposal_upvote_count() TO service_role;


--
-- Name: TABLE admins; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.admins TO anon;
GRANT ALL ON TABLE public.admins TO authenticated;
GRANT ALL ON TABLE public.admins TO service_role;


--
-- Name: TABLE endorsements; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.endorsements TO anon;
GRANT ALL ON TABLE public.endorsements TO authenticated;
GRANT ALL ON TABLE public.endorsements TO service_role;


--
-- Name: TABLE feedback; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.feedback TO anon;
GRANT ALL ON TABLE public.feedback TO authenticated;
GRANT ALL ON TABLE public.feedback TO service_role;


--
-- Name: TABLE feedbacks; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.feedbacks TO anon;
GRANT ALL ON TABLE public.feedbacks TO authenticated;
GRANT ALL ON TABLE public.feedbacks TO service_role;


--
-- Name: TABLE home_sections; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.home_sections TO anon;
GRANT ALL ON TABLE public.home_sections TO authenticated;
GRANT ALL ON TABLE public.home_sections TO service_role;


--
-- Name: TABLE profiles; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.profiles TO anon;
GRANT ALL ON TABLE public.profiles TO authenticated;
GRANT ALL ON TABLE public.profiles TO service_role;


--
-- Name: TABLE proposal_comments; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.proposal_comments TO anon;
GRANT ALL ON TABLE public.proposal_comments TO authenticated;
GRANT ALL ON TABLE public.proposal_comments TO service_role;


--
-- Name: TABLE proposals; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.proposals TO anon;
GRANT ALL ON TABLE public.proposals TO authenticated;
GRANT ALL ON TABLE public.proposals TO service_role;


--
-- Name: TABLE votes; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.votes TO anon;
GRANT ALL ON TABLE public.votes TO authenticated;
GRANT ALL ON TABLE public.votes TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: supabase_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: supabase_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: supabase_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO service_role;


--
-- PostgreSQL database dump complete
--

\unrestrict LfdzPQdO4euBDI9UoSHOS07ZgVhXAjvBnstWINc64MHplTWL639hqVeHxZ0YGUd
