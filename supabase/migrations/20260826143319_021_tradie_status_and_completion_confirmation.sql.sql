/*
# Tradie job status actions and completion confirmation

## Purpose
Allows the assigned tradie to move a job from "assigned" to "in_progress"
and from "in_progress" to "completed". When the tradie marks the job
completed, it enters an "awaiting customer confirmation" state. The
customer then confirms completion, which finalises the job.

This does NOT add a new status value or change the existing status CHECK
constraint. The status column still uses: open, assigned, in_progress,
completed, cancelled. Two new timestamp columns distinguish
"awaiting confirmation" from "confirmed complete".

## New Columns (on existing `jobs` table)
- `tradie_completed_at` (timestamptz, nullable) — set when the tradie
  marks the job complete. NULL means the tradie has not yet marked it.
- `customer_confirmed_at` (timestamptz, nullable) — set when the customer
  confirms the tradie's completion. NULL means confirmation is pending
  (or the tradie hasn't marked complete yet).

## New Functions (SECURITY DEFINER)
1. `tradie_update_job_status(p_job_id, p_new_status)`
   - Verifies caller is the assigned tradie.
   - Allows only: assigned -> in_progress, in_progress -> completed.
   - When transitioning to completed, sets tradie_completed_at = now().
   - Execute: authenticated only (revoked from PUBLIC and anon).

2. `confirm_job_completion(p_job_id)`
   - Verifies caller is the job owner (customer).
   - Verifies job status = 'completed' and tradie_completed_at IS NOT NULL
     and customer_confirmed_at IS NULL.
   - Sets customer_confirmed_at = now().
   - Execute: authenticated only (revoked from PUBLIC and anon).

## New Notification Type
- 'job_completion_confirmed' — added to the notifications CHECK constraint.
  Fired when customer_confirmed_at changes from NULL to a value, notifying
  the assigned tradie that the customer confirmed completion.

## New Trigger
- `jobs_completion_confirmed_notify` — AFTER UPDATE on jobs, fires when
  customer_confirmed_at changes from NULL to a value.

## Security
- The two new columns are NOT added to the client UPDATE grant. They can
  only be set by the SECURITY DEFINER functions.
- No changes to existing RLS policies, functions, or triggers.
- No changes to existing column-level privileges.

## Important Notes
1. The existing `update_job_status` function remains completely unchanged.
   The customer retains all existing transition capabilities. The new
   `tradie_update_job_status` function is additive.
2. The existing `notify_job_status_changed` trigger still fires for status
   changes made by the tradie function, so the customer is notified when
   the tradie moves the job to in_progress or completed.
3. The new completion-confirmed trigger is separate and only fires for
   the customer_confirmed_at column change.
*/

-- Add completion confirmation columns to jobs
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'jobs' AND column_name = 'tradie_completed_at'
  ) THEN
    ALTER TABLE jobs ADD COLUMN tradie_completed_at timestamptz;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'jobs' AND column_name = 'customer_confirmed_at'
  ) THEN
    ALTER TABLE jobs ADD COLUMN customer_confirmed_at timestamptz;
  END IF;
END $$;

-- Function: tradie_update_job_status
-- Allows the assigned tradie to transition assigned -> in_progress
-- and in_progress -> completed. Sets tradie_completed_at on completion.
CREATE OR REPLACE FUNCTION tradie_update_job_status(
  p_job_id uuid,
  p_new_status text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_job jobs%ROWTYPE;
BEGIN
  SELECT * INTO v_job FROM jobs WHERE id = p_job_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Job not found.';
  END IF;

  -- Verify caller is the assigned tradie
  IF v_job.assigned_tradie_id IS NULL OR v_job.assigned_tradie_id != auth.uid() THEN
    RAISE EXCEPTION 'You are not authorized to update this job status.';
  END IF;

  -- Validate the transition
  IF v_job.status = 'assigned' AND p_new_status = 'in_progress' THEN
    -- Allowed: assigned -> in_progress
    NULL;
  ELSIF v_job.status = 'in_progress' AND p_new_status = 'completed' THEN
    -- Allowed: in_progress -> completed
    NULL;
  ELSE
    RAISE EXCEPTION 'Invalid status transition from % to %.', v_job.status, p_new_status;
  END IF;

  -- Apply the transition
  UPDATE jobs
    SET status = p_new_status,
        tradie_completed_at = CASE WHEN p_new_status = 'completed' THEN now() ELSE tradie_completed_at END
    WHERE id = p_job_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION tradie_update_job_status FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION tradie_update_job_status FROM anon;
GRANT EXECUTE ON FUNCTION tradie_update_job_status TO authenticated;

-- Function: confirm_job_completion
-- Allows the job owner (customer) to confirm the tradie's completion.
CREATE OR REPLACE FUNCTION confirm_job_completion(p_job_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_job jobs%ROWTYPE;
BEGIN
  SELECT * INTO v_job FROM jobs WHERE id = p_job_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Job not found.';
  END IF;

  -- Verify caller is the job owner
  IF v_job.customer_id != auth.uid() THEN
    RAISE EXCEPTION 'You are not authorized to confirm this job completion.';
  END IF;

  -- Verify job is completed and tradie has marked it complete
  IF v_job.status != 'completed' THEN
    RAISE EXCEPTION 'Job must be completed before confirming.';
  END IF;

  IF v_job.tradie_completed_at IS NULL THEN
    RAISE EXCEPTION 'The tradie must mark the job complete before you can confirm.';
  END IF;

  IF v_job.customer_confirmed_at IS NOT NULL THEN
    RAISE EXCEPTION 'This job completion has already been confirmed.';
  END IF;

  UPDATE jobs SET customer_confirmed_at = now() WHERE id = p_job_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION confirm_job_completion FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION confirm_job_completion FROM anon;
GRANT EXECUTE ON FUNCTION confirm_job_completion TO authenticated;

-- Add 'job_completion_confirmed' to the notifications CHECK constraint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'notifications_type_check'
      AND conrelid = 'notifications'::regclass
      AND pg_get_constraintdef(oid) LIKE '%job_completion_confirmed%'
  ) THEN
    ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
    ALTER TABLE notifications ADD CONSTRAINT notifications_type_check CHECK (type IN (
      'new_quote', 'new_interest', 'quote_accepted', 'quote_rejected',
      'job_assigned', 'new_message', 'job_status_changed', 'new_job_note',
      'job_completion_confirmed'
    ));
  END IF;
END $$;

-- Trigger function: notify_job_completion_confirmed
-- Fires when customer_confirmed_at changes from NULL to a value.
CREATE OR REPLACE FUNCTION notify_job_completion_confirmed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF OLD.customer_confirmed_at IS NULL AND NEW.customer_confirmed_at IS NOT NULL THEN
    IF NEW.assigned_tradie_id IS NOT NULL THEN
      PERFORM create_notification(
        NEW.assigned_tradie_id,
        'job_completion_confirmed',
        'Job completion confirmed',
        'The customer has confirmed completion of the job "' || NEW.title || '".',
        NEW.id
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION notify_job_completion_confirmed FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION notify_job_completion_confirmed FROM anon;

-- Attach trigger
DROP TRIGGER IF EXISTS jobs_completion_confirmed_notify ON jobs;
CREATE TRIGGER jobs_completion_confirmed_notify
  AFTER UPDATE ON jobs
  FOR EACH ROW
  WHEN (OLD.customer_confirmed_at IS NULL AND NEW.customer_confirmed_at IS NOT NULL)
  EXECUTE FUNCTION notify_job_completion_confirmed();