/*
# Tighten grants on job_notes and job_quotes

## Purpose
Defense-in-depth: revoke UPDATE and DELETE table-level privileges from
`authenticated` on `job_notes` and `job_quotes` that were inherited
during table creation. RLS already blocks these operations (no policies
exist for them), but explicit revocation ensures the principle of
least privilege.

## Security
- job_notes: revoke UPDATE, DELETE from authenticated (notes are immutable)
- job_quotes: revoke DELETE from authenticated (quotes are never deleted,
  only withdrawn via the withdraw_quote function)
*/

REVOKE UPDATE ON job_notes FROM authenticated;
REVOKE DELETE ON job_notes FROM authenticated;

REVOKE DELETE ON job_quotes FROM authenticated;
