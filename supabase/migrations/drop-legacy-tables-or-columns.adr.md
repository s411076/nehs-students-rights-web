# Legacy tables and columns stay in place

Date: 2026-11-28
Source: user

Do not drop legacy tables or columns. Production still had `feedbacks`, `profiles`, `votes`, and `endorsements` on 2026-11-28.
Retained columns include `upvote_count`, `endorsement_count`, `endorsements_count`, `endorsed_by`, and `admin_response`.
`increment_endorsement`, `update_endorsement_count`, `update_proposal_endorsement_count`, and `update_proposal_upvote_count` remain with `EXECUTE` revoked from `anon` and `authenticated`.
