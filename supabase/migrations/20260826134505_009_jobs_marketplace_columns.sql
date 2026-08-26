/*
# Add marketplace columns to jobs table

## Purpose
Adds two columns to the `jobs` table to support the Stage 2B marketplace:
- `assigned_tradie_id` — stores which tradie was assigned when a quote is accepted
- `quote_preference` — lets customers choose whether tradies submit quotes or express interest

## Changes to existing tables
- `jobs`: add `assigned_tradie_id` (uuid, nullable, references profiles ON DELETE SET NULL)
- `jobs`: add `quote_preference` (text, NOT NULL, default 'open_to_quotes', CHECK in 'open_to_quotes' | 'fixed_budget')

## Security
- `assigned_tradie_id` is added to the column-level INSERT grant so the
  `accept_quote` SECURITY DEFINER function can set it. It is NOT added to
  the UPDATE grant — clients cannot set it directly; only the secure function can.
- `quote_preference` is added to both INSERT and UPDATE column grants so
  customers can set and change it through the normal client.
- The existing `update_job_status` function is updated to clear
  `assigned_tradie_id` when a job is cancelled, and to enforce that
  `assigned_tradie_id` is set before allowing the 'assigned' status
  (the accept_quote function handles setting both atomically).

## Important Notes
1. `assigned_tradie_id` uses ON DELETE SET NULL so deleting a tradie's profile
   doesn't cascade-delete the job — the job just becomes unassigned.
2. `quote_preference` defaults to 'open_to_quotes' so existing jobs are
   treated as accepting quotes (backward compatible).
3. The updated `update_job_status` function retains all existing transition
   validation and adds a guard: transitioning to 'assigned' requires
   `assigned_tradie_id` to already be set on the job row.
*/

-- Add assigned_tradie_id column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'jobs' AND column_name = 'assigned_tradie_id'
  ) THEN
    ALTER TABLE jobs
      ADD COLUMN assigned_tradie_id uuid
        REFERENCES profiles(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Add quote_preference column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'jobs' AND column_name = 'quote_preference'
  ) THEN
    ALTER TABLE jobs
      ADD COLUMN quote_preference text NOT NULL DEFAULT 'open_to_quotes'
        CHECK (quote_preference IN ('open_to_quotes', 'fixed_budget'));
  END IF;
END $$;

-- Add index on assigned_tradie_id for quick lookup
CREATE INDEX IF NOT EXISTS jobs_assigned_tradie_id_idx ON jobs (assigned_tradie_id);

-- Update column-level INSERT grant to include assigned_tradie_id and quote_preference
-- (assigned_tradie_id needed by accept_quote SECURITY DEFINER function;
--  quote_preference needed by client inserts)
REVOKE INSERT ON jobs FROM authenticated;
GRANT INSERT (
  customer_id, title, description, trade_category, status, budget,
  scheduled_date, address_line1, address_line2, suburb, state, postcode,
  notes, assigned_tradie_id, quote_preference
) ON jobs TO authenticated;

-- Update column-level UPDATE grant to include quote_preference
-- (NOT assigned_tradie_id — that is only set by the accept_quote function)
REVOKE UPDATE ON jobs FROM authenticated;
GRANT UPDATE (
  title, description, trade_category, budget, scheduled_date,
  address_line1, address_line2, suburb, state, postcode, notes,
  quote_preference
) ON jobs TO authenticated;

-- Update the update_job_status function to:
-- 1. Guard 'assigned' transition: requires assigned_tradie_id to be set
-- 2. Clear assigned_tradie_id when transitioning to 'cancelled'
CREATE OR REPLACE FUNCTION update_job_status(p_job_id uuid, p_new_status text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_current_status text;
  v_owner_id uuid;
  v_assigned_tradie_id uuid;
BEGIN
  SELECT status, customer_id, assigned_tradie_id
  INTO v_current_status, v_owner_id, v_assigned_tradie_id
  FROM jobs WHERE id = p_job_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Job not found';
  END IF;

  IF v_owner_id <> auth.uid() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF NOT (
    (v_current_status = 'open'        AND p_new_status IN ('assigned', 'cancelled'))
    OR (v_current_status = 'assigned'   AND p_new_status IN ('in_progress', 'cancelled'))
    OR (v_current_status = 'in_progress' AND p_new_status IN ('completed', 'cancelled'))
  ) THEN
    RAISE EXCEPTION 'Invalid status transition from % to %', v_current_status, p_new_status;
  END IF;

  -- Guard: transitioning to 'assigned' requires assigned_tradie_id to be set
  IF p_new_status = 'assigned' AND v_assigned_tradie_id IS NULL THEN
    RAISE EXCEPTION 'Cannot assign job without an assigned tradie';
  END IF;

  -- Clear assigned_tradie_id when cancelling
  IF p_new_status = 'cancelled' THEN
    UPDATE jobs SET status = p_new_status, assigned_tradie_id = NULL, updated_at = now()
    WHERE id = p_job_id;
  ELSE
    UPDATE jobs SET status = p_new_status, updated_at = now()
    WHERE id = p_job_id;
  END IF;
END;
$$;
