/*
# Fix mutable search_path on get_job_id_from_path

## Purpose
The security advisor flagged that get_job_id_from_path has a
mutable search_path. Add SET search_path = public to fix.

## Security
- No changes to logic, RLS, or grants.
*/

CREATE OR REPLACE FUNCTION get_job_id_from_path(path text)
RETURNS uuid
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT (regexp_match(path, '^jobs/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})'))[1]::uuid
$$;
