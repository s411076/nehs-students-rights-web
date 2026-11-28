# The schema baseline is for empty projects only

Date: 2026-11-28
Source: user

Generate `baseline.sql` from the locally migrated synthetic fixture. Keep it outside `supabase/migrations/` and use it only to bootstrap empty Supabase projects. Never apply it to production. The database gate compares a managed-principal baseline install with the migration-chain result.
