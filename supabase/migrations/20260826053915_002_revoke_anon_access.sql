/*
# Tighten profiles security: revoke anon access

## Purpose
This migration removes all direct access from the `anon` role to the `profiles`
table and its SECURITY DEFINER functions. Macbuilt Services requires
authentication for all access — there are no public reads or writes.

## Changes
1. Revoke all privileges (SELECT, INSERT, UPDATE, DELETE) on `profiles` from `anon`.
2. Revoke EXECUTE on `set_tradie_verification` and `set_user_role` from `anon`
   (already done in migration 001 but re-applied here for idempotency).

## Security
- After this migration, only `authenticated` users can interact with `profiles`.
- The SECURITY DEFINER functions check `auth.uid()` internally, so even though
  `authenticated` can execute them, only admins will succeed.
*/

-- Revoke all table privileges from anon
REVOKE ALL ON profiles FROM anon;

-- Revoke function execution from anon (idempotent)
REVOKE EXECUTE ON FUNCTION set_tradie_verification FROM anon;
REVOKE EXECUTE ON FUNCTION set_user_role FROM anon;
