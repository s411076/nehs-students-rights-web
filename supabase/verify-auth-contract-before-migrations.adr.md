# Verify the Auth contract on production before migrations

Date: 2026-11-28
Source: user

Run the same read-only Auth contract in the local database gate and on production before applying future migrations. Supabase manages the Auth schema; local fixture success cannot establish that the production objects and privileges still match.
