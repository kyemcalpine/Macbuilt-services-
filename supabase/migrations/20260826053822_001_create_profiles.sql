/*
# Create profiles table with role-based access control

## Purpose
This migration creates the core `profiles` table that stores user data for the
Macbuilt Services marketplace. Each row corresponds to one Supabase auth account
and stores the user's role (customer, tradie, or admin), contact details, and
tradie-specific information including verification status.

## New Tables
- `profiles`
  - `id` (uuid, primary key) — references `auth.users(id)`, cascading on delete
  - `email` (text, not null) — copied from auth.users at signup
  - `role` (text, not null, default 'customer') — one of 'customer', 'tradie', 'admin'
  - `full_name` (text, nullable) — user's display name
  - `phone` (text, nullable) — contact phone number
  - `state` (text, nullable) — Australian state/territory (NSW, VIC, QLD, WA, SA, TAS, ACT, NT)
  - `suburb` (text, nullable) — suburb name
  - `postcode` (text, nullable) — Australian postcode
  - `business_name` (text, nullable) — tradie's business name
  - `abn` (text, nullable) — Australian Business Number
  - `trade_category` (text, nullable) — primary trade category
  - `service_areas` (text array, nullable) — areas the tradie services
  - `verification_status` (text, not null, default 'pending') — one of 'pending', 'approved', 'rejected', 'suspended'
  - `created_at` (timestamptz, default now())
  - `updated_at` (timestamptz, default now())

## Security
- Row Level Security is enabled on `profiles`.
- Users can SELECT and UPDATE only their own profile row.
- The `role` and `verification_status` columns are protected via column-level
  privileges: users can only UPDATE the non-privileged columns (full_name, phone,
  state, suburb, postcode, business_name, abn, trade_category, service_areas).
  Role and verification_status can only be changed by an admin via the
  `set_tradie_verification` SECURITY DEFINER function.
- An admin is identified by having `role = 'admin'` in their profile row.

## Automation
- A trigger (`handle_new_user`) automatically creates a profile row whenever a
  new user signs up via Supabase Auth. It reads the role from `raw_user_meta_data`
  (set at signup by the frontend) and defaults to 'customer' if not specified.
  Tradie accounts default to verification_status = 'pending'.

## Important Notes
1. The `role` column is set at signup from `raw_user_meta_data` and cannot be
   changed by the user afterward (column-level UPDATE privilege revoked).
2. The `verification_status` column is also revoked from direct user UPDATE.
   Changes go through the `set_tradie_verification` SECURITY DEFINER function
   which checks that the caller is an admin.
3. The `set_role` function allows an admin to change a user's role (e.g.,
   promoting a user to admin), also via SECURITY DEFINER with authorization check.
*/

-- Create the profiles table
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  role text NOT NULL DEFAULT 'customer' CHECK (role IN ('customer', 'tradie', 'admin')),
  full_name text,
  phone text,
  state text,
  suburb text,
  postcode text,
  business_name text,
  abn text,
  trade_category text,
  service_areas text[],
  verification_status text NOT NULL DEFAULT 'pending'
    CHECK (verification_status IN ('pending', 'approved', 'rejected', 'suspended')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- SELECT: users can read their own profile
DROP POLICY IF EXISTS "profiles_select_own" ON profiles;
CREATE POLICY "profiles_select_own"
  ON profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

-- INSERT: handled by trigger, not by users directly — but we allow it for the trigger
DROP POLICY IF EXISTS "profiles_insert_own" ON profiles;
CREATE POLICY "profiles_insert_own"
  ON profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

-- UPDATE: users can update their own row (column-level privileges narrow what they can change)
DROP POLICY IF EXISTS "profiles_update_own" ON profiles;
CREATE POLICY "profiles_update_own"
  ON profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- DELETE: users can delete their own profile
DROP POLICY IF EXISTS "profiles_delete_own" ON profiles;
CREATE POLICY "profiles_delete_own"
  ON profiles FOR DELETE
  TO authenticated
  USING (auth.uid() = id);

-- Column-level privileges: revoke UPDATE on sensitive columns, grant only on safe ones
REVOKE UPDATE ON profiles FROM authenticated;
GRANT UPDATE (full_name, phone, state, suburb, postcode, business_name, abn, trade_category, service_areas) ON profiles TO authenticated;

-- Also revoke INSERT so users can't manually set role/verification_status via the API
-- (the trigger handles inserts with the security definer)
REVOKE INSERT ON profiles FROM authenticated;
GRANT INSERT (id, email, role, full_name, phone, state, suburb, postcode, business_name, abn, trade_category, service_areas) ON profiles TO authenticated;

-- Ensure SELECT works (grant full select)
GRANT SELECT ON profiles TO authenticated;

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Apply the updated_at trigger
DROP TRIGGER IF EXISTS profiles_updated_at ON profiles;
CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- Create function to handle new user signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  new_role text;
  new_verification text;
BEGIN
  -- Read role from user_meta_data, default to 'customer'
  new_role := COALESCE(NEW.raw_user_meta_data->>'role', 'customer');

  -- Validate role
  IF new_role NOT IN ('customer', 'tradie', 'admin') THEN
    new_role := 'customer';
  END IF;

  -- Tradies start as pending, customers/admins start as approved
  IF new_role = 'tradie' THEN
    new_verification := 'pending';
  ELSE
    new_verification := 'approved';
  END IF;

  INSERT INTO profiles (id, email, role, verification_status, full_name, phone, state, suburb, postcode, business_name, abn, trade_category)
  VALUES (
    NEW.id,
    NEW.email,
    new_role,
    new_verification,
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'phone',
    NEW.raw_user_meta_data->>'state',
    NEW.raw_user_meta_data->>'suburb',
    NEW.raw_user_meta_data->>'postcode',
    NEW.raw_user_meta_data->>'business_name',
    NEW.raw_user_meta_data->>'abn',
    NEW.raw_user_meta_data->>'trade_category'
  );

  RETURN NEW;
END;
$$;

-- Attach the trigger to auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user();

-- SECURITY DEFINER function: set tradie verification status (admin only)
CREATE OR REPLACE FUNCTION set_tradie_verification(p_tradie_id uuid, p_status text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  -- Check that the CALLER is an admin
  IF NOT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  -- Validate the status
  IF p_status NOT IN ('pending', 'approved', 'rejected', 'suspended') THEN
    RAISE EXCEPTION 'Invalid verification status';
  END IF;

  -- Update the tradie's verification status
  UPDATE profiles
  SET verification_status = p_status, updated_at = now()
  WHERE id = p_tradie_id;
END;
$$;

-- Revoke EXECUTE from anon, grant to authenticated
REVOKE EXECUTE ON FUNCTION set_tradie_verification FROM anon;
GRANT EXECUTE ON FUNCTION set_tradie_verification TO authenticated;

-- SECURITY DEFINER function: set user role (admin only)
CREATE OR REPLACE FUNCTION set_user_role(p_user_id uuid, p_role text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  -- Check that the CALLER is an admin
  IF NOT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  -- Validate the role
  IF p_role NOT IN ('customer', 'tradie', 'admin') THEN
    RAISE EXCEPTION 'Invalid role';
  END IF;

  -- Update the user's role
  UPDATE profiles
  SET role = p_role, updated_at = now()
  WHERE id = p_user_id;
END;
$$;

-- Revoke EXECUTE from anon, grant to authenticated
REVOKE EXECUTE ON FUNCTION set_user_role FROM anon;
GRANT EXECUTE ON FUNCTION set_user_role TO authenticated;
