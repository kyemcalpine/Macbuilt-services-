/*
# Create jobs table with role-based access control

## Purpose
This migration creates the `jobs` table for the Macbuilt Services marketplace.
Customers can post jobs (e.g. plumbing, electrical, landscaping), and those
jobs flow through a status workflow: open -> assigned -> in_progress -> completed,
with cancellation possible from open/assigned/in_progress.

## New Tables
- `jobs`
  - `id` (uuid, primary key, default gen_random_uuid())
  - `customer_id` (uuid, not null, default auth.uid()) — references profiles(id) ON DELETE CASCADE
  - `title` (text, not null) — short job title
  - `description` (text, not null) — detailed job description
  - `trade_category` (text, not null) — one of the TRADE_CATEGORIES values
  - `status` (text, not null, default 'open') — one of 'open', 'assigned', 'in_progress', 'completed', 'cancelled'
  - `budget` (numeric(10,2), nullable) — customer's budget for the job
  - `scheduled_date` (timestamptz, nullable) — when the job is scheduled
  - `address_line1` (text, nullable) — street address line 1
  - `address_line2` (text, nullable) — street address line 2 (unit, etc.)
  - `suburb` (text, nullable) — suburb
  - `state` (text, nullable) — Australian state
  - `postcode` (text, nullable) — postcode
  - `notes` (text, nullable) — additional notes
  - `created_at` (timestamptz, default now())
  - `updated_at` (timestamptz, default now())

## Security
- Row Level Security is enabled on `jobs`.
- Customers can SELECT, INSERT, UPDATE, and DELETE only their own jobs
  (where customer_id = auth.uid()).
- Admins can SELECT all jobs (using the existing is_admin() helper function).
- Tradies can SELECT jobs with status = 'open' (marketplace visibility).
- The `status` column is protected: direct UPDATE of status via the client is
  prevented by column-level privileges. Status changes go through the
  `update_job_status` SECURITY DEFINER function which validates the transition.

## Functions
- `update_job_status(p_job_id uuid, p_new_status text)` — SECURITY DEFINER function
  that validates the caller is the job owner and that the status transition is
  allowed, then updates the job's status. Allowed transitions:
    open       -> assigned, cancelled
    assigned   -> in_progress, cancelled
    in_progress-> completed, cancelled
  (completed and cancelled are terminal — no further transitions allowed)

## Automation
- A trigger (`jobs_updated_at`) auto-updates `updated_at` on every row change,
  reusing the existing `update_updated_at()` trigger function.

## Important Notes
1. The `customer_id` column defaults to `auth.uid()` so frontend inserts that
   omit it still satisfy the INSERT policy's WITH CHECK.
2. Column-level UPDATE privileges exclude `status`, `customer_id`, and
   `created_at` — these cannot be changed directly by the client. Status goes
   through the `update_job_status` function; customer_id and created_at are
   immutable after creation.
3. DELETE is only allowed by the owner (enforced by RLS); the frontend further
   restricts deletion to jobs with status = 'open'.
*/

CREATE TABLE IF NOT EXISTS jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL DEFAULT auth.uid()
    REFERENCES profiles(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text NOT NULL,
  trade_category text NOT NULL,
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'assigned', 'in_progress', 'completed', 'cancelled')),
  budget numeric(10,2),
  scheduled_date timestamptz,
  address_line1 text,
  address_line2 text,
  suburb text,
  state text,
  postcode text,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;

-- SELECT: owners see their own jobs, admins see all, tradies see open jobs
DROP POLICY IF EXISTS "jobs_select_own" ON jobs;
CREATE POLICY "jobs_select_own"
  ON jobs FOR SELECT
  TO authenticated
  USING (auth.uid() = customer_id);

DROP POLICY IF EXISTS "jobs_select_admin" ON jobs;
CREATE POLICY "jobs_select_admin"
  ON jobs FOR SELECT
  TO authenticated
  USING (is_admin());

DROP POLICY IF EXISTS "jobs_select_open" ON jobs;
CREATE POLICY "jobs_select_open"
  ON jobs FOR SELECT
  TO authenticated
  USING (status = 'open');

-- INSERT: customers can create their own jobs
DROP POLICY IF EXISTS "jobs_insert_own" ON jobs;
CREATE POLICY "jobs_insert_own"
  ON jobs FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = customer_id);

-- UPDATE: owners can update their own jobs (column-level privileges narrow what they can change)
DROP POLICY IF EXISTS "jobs_update_own" ON jobs;
CREATE POLICY "jobs_update_own"
  ON jobs FOR UPDATE
  TO authenticated
  USING (auth.uid() = customer_id)
  WITH CHECK (auth.uid() = customer_id);

-- DELETE: owners can delete their own jobs
DROP POLICY IF EXISTS "jobs_delete_own" ON jobs;
CREATE POLICY "jobs_delete_own"
  ON jobs FOR DELETE
  TO authenticated
  USING (auth.uid() = customer_id);

-- Column-level privileges: revoke full UPDATE, grant only on editable columns
REVOKE UPDATE ON jobs FROM authenticated;
GRANT UPDATE (
  title, description, trade_category, budget, scheduled_date,
  address_line1, address_line2, suburb, state, postcode, notes
) ON jobs TO authenticated;

-- Grant SELECT and INSERT
GRANT SELECT ON jobs TO authenticated;
GRANT INSERT (
  customer_id, title, description, trade_category, status, budget,
  scheduled_date, address_line1, address_line2, suburb, state, postcode, notes
) ON jobs TO authenticated;

-- Reuse the existing update_updated_at() trigger function
DROP TRIGGER IF EXISTS jobs_updated_at ON jobs;
CREATE TRIGGER jobs_updated_at
  BEFORE UPDATE ON jobs
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- SECURITY DEFINER function: update job status (owner only, validated transitions)
CREATE OR REPLACE FUNCTION update_job_status(p_job_id uuid, p_new_status text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_current_status text;
  v_owner_id uuid;
BEGIN
  -- Fetch the job's current status and owner
  SELECT status, customer_id INTO v_current_status, v_owner_id
  FROM jobs WHERE id = p_job_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Job not found';
  END IF;

  -- Only the job owner can change the status
  IF v_owner_id <> auth.uid() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  -- Validate the transition
  IF NOT (
    (v_current_status = 'open'        AND p_new_status IN ('assigned', 'cancelled'))
    OR (v_current_status = 'assigned'   AND p_new_status IN ('in_progress', 'cancelled'))
    OR (v_current_status = 'in_progress' AND p_new_status IN ('completed', 'cancelled'))
  ) THEN
    RAISE EXCEPTION 'Invalid status transition from % to %', v_current_status, p_new_status;
  END IF;

  -- Apply the update
  UPDATE jobs SET status = p_new_status, updated_at = now()
  WHERE id = p_job_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION update_job_status FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION update_job_status FROM anon;
GRANT EXECUTE ON FUNCTION update_job_status TO authenticated;

-- Index for common queries: by customer, by status
CREATE INDEX IF NOT EXISTS jobs_customer_id_idx ON jobs (customer_id);
CREATE INDEX IF NOT EXISTS jobs_status_idx ON jobs (status);
