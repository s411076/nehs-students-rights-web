BEGIN;
SET LOCAL lock_timeout = '10s';
SET LOCAL search_path = '';

-- The legacy tables may reference each other; RESTRICT rejects outside dependencies.
DROP TABLE public.feedbacks, public.endorsements, public.votes, public.profiles RESTRICT;

DO $$
DECLARE f regprocedure;
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure
    FROM pg_catalog.pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace
      AND p.prokind = 'f'
      AND p.proname IN ('increment_endorsement', 'update_endorsement_count',
        'update_proposal_endorsement_count', 'update_proposal_upvote_count')
  LOOP
    EXECUTE pg_catalog.format('DROP FUNCTION %s RESTRICT', f);
  END LOOP;
END $$;

ALTER TABLE public.proposals
  DROP COLUMN status_reason RESTRICT,
  DROP COLUMN upvote_count RESTRICT,
  DROP COLUMN endorsement_count RESTRICT,
  DROP COLUMN admin_response RESTRICT,
  DROP COLUMN responded_at RESTRICT,
  DROP COLUMN endorsements_count RESTRICT,
  DROP COLUMN endorsed_by RESTRICT;

ALTER TABLE public.feedback
  DROP COLUMN admin_response RESTRICT,
  DROP COLUMN responded_at RESTRICT,
  DROP COLUMN endorsement_count RESTRICT;

COMMIT;
