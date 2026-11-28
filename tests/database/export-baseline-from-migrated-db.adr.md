# The database baseline preserves the original unsafe permissions

Date: 2026-11-28
Source: agent

## Need
Show that the migration changes what the original grants and policies allowed.
## Tried
The restored baseline permitted raw public proposal reads before hardening.
## Decision
Keep `legacy-public-schema.sql` as a schema-only test fixture of the original unsafe grants and policies. Never apply it to a deployed project. Re-export only from an untouched disposable recovery clone, never a migrated database.
## Revisit when
The denial tests no longer need to prove a change from the original permissions.
