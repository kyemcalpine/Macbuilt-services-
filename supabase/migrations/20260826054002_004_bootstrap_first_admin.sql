/*
# Create bootstrap_first_admin function

## Purpose
Provides a one-time, secure way to promote the first signed-in user to admin.
This function checks that no admin account exists yet, and if so, promotes the
calling user to admin. If an admin already exists, it returns false and does
nothing — preventing unauthorized privilege escalation.

## Security
- SECURITY DEFINER so it can write to the `role` column (which is revoked from
  direct user UPDATE).
- Checks `auth.uid()` for the caller identity — never trusts a parameter.
- Checks that zero admin profiles exist before promoting.
- Returns boolean: true if promoted, false if an admin already exists.
- EXECUTE revoked from anon/PUBLIC, granted to authenticated only.
*/

CREATE OR REPLACE FUNCTION bootstrap_first_admin()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  admin_count integer;
  caller_id uuid;
BEGIN
  caller_id := auth.uid();

  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Check if any admin already exists
  SELECT count(*) INTO admin_count FROM profiles WHERE role = 'admin';

  IF admin_count > 0 THEN
    RETURN false;
  END IF;

  -- Promote the caller to admin
  UPDATE profiles
  SET role = 'admin', verification_status = 'approved', updated_at = now()
  WHERE id = caller_id;

  RETURN true;
END;
$$;

REVOKE EXECUTE ON FUNCTION bootstrap_first_admin FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION bootstrap_first_admin FROM anon;
GRANT EXECUTE ON FUNCTION bootstrap_first_admin TO authenticated;
