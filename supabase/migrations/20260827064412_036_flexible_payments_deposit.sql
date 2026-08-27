/*
# Flexible Payments: Any-time payment + 50% deposit request

## Purpose
1. Allow the customer to pay at any job status (assigned, in_progress,
   completed, cancelled) — not just "assigned".
2. Allow the assigned tradie to request a 50% upfront deposit.
3. Track how much has been paid so far via a `paid_amount` column on jobs.

## Changes to `jobs` table
- Add `paid_amount` numeric(10,2) NOT NULL DEFAULT 0 — cumulative amount
  actually paid (succeeded payments only, excluding refunds).
- Add `deposit_requested_at` timestamptz, nullable — set when the tradie
  requests a 50% deposit. NULL means no deposit has been requested.
- Add `deposit_request_message` text, nullable — optional message from
  the tradie explaining the deposit request.
- Extend `payment_status` CHECK to include 'partially_paid'.
  New allowed values: 'unpaid', 'partially_paid', 'paid', 'refunded',
  'partially_refunded', 'disputed'.

## New Function: request_deposit
`request_deposit(p_job_id uuid, p_message text DEFAULT NULL)`
- Caller must be the assigned tradie.
- Job must have an agreed_quote_amount > 0.
- Sets deposit_requested_at = now(), deposit_request_message = p_message.
- Notifies the customer that a deposit has been requested.
- Can only be called once (if deposit_requested_at is already set, raises).
- Execute: authenticated only.

## Notification & Activity Types
- Add 'deposit_requested' to notifications CHECK.
- Add 'deposit_requested' to job_activity CHECK.

## Security
- New columns are NOT added to client UPDATE grant — only settable by
  SECURITY DEFINER functions or service role.
- No changes to RLS policies.
*/

-- ============================================================
-- 1. Add paid_amount, deposit_requested_at, deposit_request_message
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'jobs' AND column_name = 'paid_amount'
  ) THEN
    ALTER TABLE jobs ADD COLUMN paid_amount numeric(10,2) NOT NULL DEFAULT 0;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'jobs' AND column_name = 'deposit_requested_at'
  ) THEN
    ALTER TABLE jobs ADD COLUMN deposit_requested_at timestamptz;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'jobs' AND column_name = 'deposit_request_message'
  ) THEN
    ALTER TABLE jobs ADD COLUMN deposit_request_message text;
  END IF;
END $$;

-- ============================================================
-- 2. Extend payment_status CHECK to include 'partially_paid'
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'jobs_payment_status_check'
      AND conrelid = 'jobs'::regclass
      AND pg_get_constraintdef(oid) LIKE '%partially_paid%'
  ) THEN
    ALTER TABLE jobs DROP CONSTRAINT IF EXISTS jobs_payment_status_check;
    ALTER TABLE jobs ADD CONSTRAINT jobs_payment_status_check
      CHECK (payment_status IN ('unpaid', 'partially_paid', 'paid', 'refunded', 'partially_refunded', 'disputed'));
  END IF;
END $$;

-- ============================================================
-- 3. Extend notification types
-- ============================================================
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check CHECK (type IN (
  'new_quote', 'new_interest', 'quote_accepted', 'quote_rejected',
  'job_assigned', 'new_message', 'job_status_changed', 'new_job_note',
  'job_completion_confirmed', 'new_review', 'new_job_attachment',
  'payment_required', 'payment_received', 'payment_failed',
  'refund_processed', 'payout_processed', 'dispute_raised', 'dispute_resolved',
  'job_reopened', 'deposit_requested'
));

-- ============================================================
-- 4. Extend activity types
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
    'job_reopened', 'deposit_requested'
  ));

-- ============================================================
-- 5. Function: request_deposit
-- ============================================================
CREATE OR REPLACE FUNCTION request_deposit(
  p_job_id uuid,
  p_message text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_job RECORD;
BEGIN
  SELECT * INTO v_job FROM jobs WHERE id = p_job_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Job not found.';
  END IF;

  -- Caller must be the assigned tradie
  IF v_job.assigned_tradie_id IS NULL OR v_job.assigned_tradie_id != auth.uid() THEN
    RAISE EXCEPTION 'Only the assigned tradie can request a deposit.';
  END IF;

  -- Must have an agreed quote amount
  IF v_job.agreed_quote_amount IS NULL OR v_job.agreed_quote_amount <= 0 THEN
    RAISE EXCEPTION 'This job does not have an agreed quote amount.';
  END IF;

  -- Can only request once
  IF v_job.deposit_requested_at IS NOT NULL THEN
    RAISE EXCEPTION 'A deposit has already been requested for this job.';
  END IF;

  -- Don't allow if already paid in full
  IF v_job.payment_status = 'paid' THEN
    RAISE EXCEPTION 'This job has already been paid in full.';
  END IF;

  -- Set deposit request
  UPDATE jobs
    SET deposit_requested_at = now(),
        deposit_request_message = p_message,
        updated_at = now()
    WHERE id = p_job_id;

  -- Log activity
  PERFORM log_job_activity(
    p_job_id,
    'deposit_requested',
    auth.uid(),
    'Tradie requested 50% deposit',
    jsonb_build_object('message', p_message, 'deposit_amount', round(v_job.agreed_quote_amount * 0.50, 2))
  );

  -- Notify customer
  PERFORM create_notification(
    v_job.customer_id,
    'deposit_requested',
    'Deposit requested',
    'The tradie has requested a 50% deposit for the job "' || v_job.title || '".',
    p_job_id
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION request_deposit FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION request_deposit FROM anon;
GRANT EXECUTE ON FUNCTION request_deposit TO authenticated;