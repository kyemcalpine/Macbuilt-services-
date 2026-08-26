/*
# Tighten function security: revoke public execute, fix search paths

## Purpose
Fix security advisor warnings:
1. Revoke EXECUTE on all SECURITY DEFINER functions from `anon` and `PUBLIC`.
   - `handle_new_user` is a trigger function — should never be called via RPC.
   - `set_tradie_verification` and `set_user_role` check `auth.uid()` internally,
     but should still not be callable by anon.
2. Add `SET search_path = public` to `update_updated_at` to fix the mutable
   search_path warning.

## Changes
1. REVOKE EXECUTE on `handle_new_user` FROM PUBLIC, anon, authenticated.
   (Trigger functions don't need direct EXECUTE — they run via the trigger.)
2. REVOKE EXECUTE on `set_tradie_verification` FROM PUBLIC, anon.
   GRANT EXECUTE to authenticated only.
3. REVOKE EXECUTE on `set_user_role` FROM PUBLIC, anon.
   GRANT EXECUTE to authenticated only.
4. Recreate `update_updated_at` with `SET search_path = public`.
*/

-- Revoke all access to trigger function (only runs via trigger, not via RPC)
REVOKE EXECUTE ON FUNCTION handle_new_user FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION handle_new_user FROM anon;
REVOKE EXECUTE ON FUNCTION handle_new_user FROM authenticated;

-- Revoke anon/PUBLIC access to admin functions, keep authenticated
REVOKE EXECUTE ON FUNCTION set_tradie_verification FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION set_tradie_verification FROM anon;
GRANT EXECUTE ON FUNCTION set_tradie_verification TO authenticated;

REVOKE EXECUTE ON FUNCTION set_user_role FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION set_user_role FROM anon;
GRANT EXECUTE ON FUNCTION set_user_role TO authenticated;

-- Fix update_updated_at search_path
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;
