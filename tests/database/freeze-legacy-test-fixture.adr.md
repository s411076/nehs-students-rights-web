# Freeze the legacy test fixture with its original unsafe permissions

Date: 2026-11-28
Source: user

Keep `legacy-public-schema.sql` frozen as a schema-only test fixture of the original unsafe grants and policies. Never apply it to a deployed project. The recovery-clone re-export path is retired.
