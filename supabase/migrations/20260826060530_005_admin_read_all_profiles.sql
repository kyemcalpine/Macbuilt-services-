/*
# Allow admins to read all profiles

## Purpose
The admin panel needs to list all tradie profiles (pending, approved, rejected, suspended)
so the admin can verify and approve them. Currently the only SELECT policy on `profiles`
is `profiles_select_own` which restricts each authenticated user to their own row (`auth.uid() = id`).
This means an admin querying for all tradies sees only their own profile — every other row is
filtered out by RLS, so pending tradies never appear on the admin page.

## Changes
1. Adds a new SELECT policy `profiles_select_admin` that allows any authenticated user whose
   profile `role = 'admin'` to read ALL rows in the `profiles` table.
2. The existing `profiles_select_own` policy remains in place — non-admin users still only see
   their own profile row. RLS policies are additive (OR logic), so:
   - Admins match BOTH policies → see all rows.
   - Non-admins match only `profiles_select_own` → see only their own row.

## Security
- Only authenticated users with `role = 'admin'` in their profile row gain elevated read access.
- The admin role is set by the `set_user_role` SECURITY DEFINER function and cannot be self-assigned.
- No INSERT, UPDATE, or DELETE policies are changed — admins still cannot directly mutate other
  users' profiles via the client; approval/rejection goes through the `set_tradie_verification`
  SECURITY DEFINER function.
*/

DROP POLICY IF EXISTS "profiles_select_admin" ON profiles;

CREATE POLICY "profiles_select_admin"
ON profiles FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid()
    AND p.role = 'admin'
  )
);
