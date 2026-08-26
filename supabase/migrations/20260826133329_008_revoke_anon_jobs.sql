/*
# Revoke anon access on jobs table

## Purpose
The jobs table was created with default PostgreSQL grants that include the `anon`
role. While RLS policies only allow `authenticated` users (no anon policies exist,
so anon gets zero rows), defense-in-depth requires explicitly revoking anon
table-level privileges — matching the security posture of the `profiles` table.

## Security
- Revokes SELECT, INSERT, UPDATE, DELETE from `anon` on the `jobs` table.
- RLS remains enabled; only authenticated users with valid ownership/admin/open
  policies can access rows.
- No changes to any policies, columns, or other tables.
*/

REVOKE ALL ON jobs FROM anon;
