/*
# Fix RLS recursion in profiles_select_admin policy

## Problem
The `profiles_select_admin` policy checks whether the current user is an admin by
running a subquery against the `profiles` table itself:
  EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
Because the policy is defined ON `profiles`, evaluating this subquery triggers RLS
on `profiles` again, which evaluates the policy again — infinite recursion.
PostgreSQL detects this and throws an error, which blocks ALL SELECT queries on
`profiles`, including the admin reading their own profile via `profiles_select_own`.

## Fix
1. Create a `SECURITY DEFINER` helper function `is_admin()` that checks whether
   `auth.uid()` has `role = 'admin'` in the `profiles` table. Because the function
   is `SECURITY DEFINER`, it runs with the owner's privileges and bypasses RLS —
   so the subquery inside it does NOT trigger policy evaluation and cannot recurse.
2. Update the `profiles_select_admin` policy to call `is_admin()` instead of the
   inline subquery.

## Security
- `is_admin()` is `SECURITY DEFINER SET search_path = public` — runs as the table
  owner, bypasses RLS, and has a fixed search path (no injection risk).
- EXECUTE is revoked from anon/PUBLIC and granted to authenticated only.
- No other policies, tables, columns, or functions are changed.
*/

CREATE OR REPLACE FUNCTION is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$;

REVOKE EXECUTE ON FUNCTION is_admin FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION is_admin FROM anon;
GRANT EXECUTE ON FUNCTION is_admin TO authenticated;

DROP POLICY IF EXISTS "profiles_select_admin" ON profiles;

CREATE POLICY "profiles_select_admin"
ON profiles FOR SELECT
TO authenticated
USING (is_admin());
