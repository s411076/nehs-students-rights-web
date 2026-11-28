# Managed Supabase postgres cannot create Auth policies

Date: 2026-11-28
Source: agent

## Need
Resolve caller identity when migrations run under the managed Supabase `postgres` principal.
## Tried
`CREATE POLICY` on `auth.users` under the recovered managed principal failed with “must be owner” (`42501`): `postgres` has `BYPASSRLS` and `SELECT WITH GRANT OPTION`, but does not own `auth.users` and cannot `SET ROLE supabase_auth_admin`.
## Decision
Read identity through narrow `postgres`-owned helpers `rights_private.user_identity` and `rights_private.live_session_user`; keep public RPCs owned by `rights_executor`.
`collapse-gate.mjs` applies as non-superuser `postgres`; a successful run as a local superuser does not establish managed compatibility.
## Revisit when
The managed principal's Auth ownership or role-switching permissions change.
