CREATE SCHEMA auth;
CREATE TABLE auth.users (
  id uuid PRIMARY KEY, email text, email_confirmed_at timestamptz,
  banned_until timestamptz, deleted_at timestamptz, is_anonymous boolean DEFAULT false,
  raw_user_meta_data jsonb DEFAULT '{}'
);
ALTER TABLE auth.users ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON auth.users TO postgres WITH GRANT OPTION;
GRANT REFERENCES ON auth.users TO postgres;
GRANT USAGE ON SCHEMA auth TO anon,authenticated;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT COALESCE(NULLIF(current_setting('request.jwt.claim.sub',true),''),
    (NULLIF(current_setting('request.jwt.claims',true),'')::jsonb->>'sub'))::uuid
$$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('request.jwt.claims',true),'')::jsonb->>'role'
$$;
CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('request.jwt.claims',true),'')::jsonb
$$;
