/*
# Job Lifecycle: Reopen cancelled jobs + Tradie cancellation

## Purpose
Completes the job lifecycle so that:
1. A cancelled job can be reopened back to 'open' (available on the marketplace).
2. The assigned tradie can cancel a job (assigned or in_progress), not just the customer.

## Changes to Existing Functions

### 1. update_job_status (customer-facing)
- Adds transition: cancelled -> open (reopen).
- On reopen: clears assigned_tradie_id, tradie_completed_at, customer_confirmed_at
  so the job starts fresh on the marketplace.
- All existing transitions remain unchanged.
- payment_status and agreed_quote_amount are NOT cleared on reopen — they
  reflect the financial history. If the job was paid and refunded, those
  fields stay as-is. A new quote acceptance will set a new agreed_quote_amount.

### 2. tradie_update_job_status (tradie-facing)
- Adds transitions: assigned -> cancelled, in_progress -> cancelled.
- On cancellation: calls cancel_job_with_payment_check (same as customer path)
  to handle refund/dispute payment state, then clears assigned_tradie_id.
- Existing transitions (assigned -> in_progress, in_progress -> completed)
  remain unchanged.

## Notification & Activity Types
- Adds 'job_reopened' to notifications CHECK constraint.
- Adds 'job_reopened' to job_activity CHECK constraint.

## Security
- No changes to RLS policies or column privileges.
- Both functions remain SECURITY DEFINER, execute granted to authenticated only.
- No new tables or columns.
*/

-- ============================================================
-- 1. Update update_job_status to add cancelled -> open (reopen)
-- ============================================================
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

  -- Validate the transition.
  -- cancelled -> open is the new reopen transition.
  IF NOT (
    (v_current_status = 'open'        AND p_new_status IN ('assigned', 'cancelled'))
    OR (v_current_status = 'assigned'   AND p_new_status IN ('in_progress', 'cancelled'))
    OR (v_current_status = 'in_progress' AND p_new_status IN ('cancelled'))
    OR (v_current_status = 'cancelled'  AND p_new_status IN ('open'))
  ) THEN
    RAISE EXCEPTION 'Invalid status transition from % to %', v_current_status, p_new_status;
  END IF;

  IF p_new_status = 'assigned' AND v_assigned_tradie_id IS NULL THEN
    RAISE EXCEPTION 'Cannot assign job without an assigned tradie';
  END IF;

  -- Handle payment-side state before changing status (cancellation only)
  IF p_new_status = 'cancelled' THEN
    PERFORM cancel_job_with_payment_check(p_job_id);
  END IF;

  -- Apply the status change
  IF p_new_status = 'cancelled' THEN
    UPDATE jobs SET status = p_new_status, assigned_tradie_id = NULL, updated_at = now()
    WHERE id = p_job_id;
  ELSIF p_new_status = 'open' AND v_current_status = 'cancelled' THEN
    -- Reopen: clear assignment and completion timestamps so the job starts fresh
    UPDATE jobs
      SET status = p_new_status,
          assigned_tradie_id = NULL,
          tradie_completed_at = NULL,
          customer_confirmed_at = NULL,
          updated_at = now()
      WHERE id = p_job_id;
  ELSE
    UPDATE jobs SET status = p_new_status, updated_at = now()
    WHERE id = p_job_id;
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION update_job_status FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION update_job_status FROM anon;
GRANT EXECUTE ON FUNCTION update_job_status TO authenticated;

-- ============================================================
-- 2. Update tradie_update_job_status to allow cancellation
-- ============================================================
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
    NULL; -- Allowed: assigned -> in_progress
  ELSIF v_job.status = 'in_progress' AND p_new_status = 'completed' THEN
    NULL; -- Allowed: in_progress -> completed
  ELSIF v_job.status = 'assigned' AND p_new_status = 'cancelled' THEN
    NULL; -- Allowed: assigned -> cancelled (new)
  ELSIF v_job.status = 'in_progress' AND p_new_status = 'cancelled' THEN
    NULL; -- Allowed: in_progress -> cancelled (new)
  ELSE
    RAISE EXCEPTION 'Invalid status transition from % to %.', v_job.status, p_new_status;
  END IF;

  -- Handle payment-side state before cancelling
  IF p_new_status = 'cancelled' THEN
    PERFORM cancel_job_with_payment_check(p_job_id);
  END IF;

  -- Apply the transition
  IF p_new_status = 'cancelled' THEN
    UPDATE jobs
      SET status = p_new_status,
          assigned_tradie_id = NULL,
          updated_at = now()
      WHERE id = p_job_id;
  ELSIF p_new_status = 'completed' THEN
    UPDATE jobs
      SET status = p_new_status,
          tradie_completed_at = now(),
          updated_at = now()
      WHERE id = p_job_id;
  ELSE
    UPDATE jobs
      SET status = p_new_status,
          updated_at = now()
      WHERE id = p_job_id;
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION tradie_update_job_status FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION tradie_update_job_status FROM anon;
GRANT EXECUTE ON FUNCTION tradie_update_job_status TO authenticated;

-- ============================================================
-- 3. Add 'job_reopened' to notification types
-- ============================================================
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check CHECK (type IN (
  'new_quote', 'new_interest', 'quote_accepted', 'quote_rejected',
  'job_assigned', 'new_message', 'job_status_changed', 'new_job_note',
  'job_completion_confirmed', 'new_review', 'new_job_attachment',
  'payment_required', 'payment_received', 'payment_failed',
  'refund_processed', 'payout_processed', 'dispute_raised', 'dispute_resolved',
  'job_reopened'
));

-- ============================================================
-- 4. Add 'job_reopened' to activity types
-- ============================================================
ALTER TABLE job_activity DROP CONSTRAINT IF EXISTS job_activity_activity_type_check;
ALTER TABLE job_activity ADD CONSTRAINT job_activity_activity_type_check
  CHECK (activity_type IN (
    'job_created', 'status_changed', 'quote_submitted', 'interest_expressed',
    'quote_accepted', 'quote_rejected', 'quote_withdrawn',
    'note_added', 'photo_uploaded', 'message_sent',
    'review_submitted', 'completion_requested', 'completion_confirmed',
    'payment_initiated', 'payment_received', 'payment_failed',
    'refund_processed', 'payout_processed', 'dispute_raised', 'dispute_resolved',
    'job_reopened'
  ));