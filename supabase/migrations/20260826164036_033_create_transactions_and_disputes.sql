/*
# Stage 5: Payments & Transactions — Database Foundation

## Purpose
Creates the core database infrastructure for the payment system:
- A `transactions` table recording every financial event (payments, refunds, payouts)
- A `disputes` table for the formal dispute resolution process
- Payment-related columns on the `jobs` table
- A `stripe_account_id` column on `profiles` for tradie Stripe Connect accounts
- Extended notification and activity types for payment events
- SECURITY DEFINER functions for dispute management and cancellation refund state

## Payment Model
- Customer pays the FULL agreed quote amount upfront after accepting a quote
- Platform fee: 10% of the agreed quote, deducted from the tradie's payout
- Stripe processing fees are absorbed by the platform (do not reduce tradie payout)
- Tradie receives 90% of the agreed quote via Stripe Connect Express transfer
- Full refund if cancelled before work starts (open or assigned)
- Disputes required for refunds once a job is in_progress

## New Tables
- `transactions`
  - `id` (uuid, primary key, default gen_random_uuid())
  - `job_id` (uuid, not null, references jobs ON DELETE CASCADE)
  - `customer_id` (uuid, not null, references profiles ON DELETE CASCADE)
  - `tradie_id` (uuid, nullable, references profiles ON DELETE SET NULL)
  - `type` (text, not null, CHECK in 'payment' | 'refund' | 'payout')
  - `gross_amount` (numeric(10,2), not null) — full amount before fees
  - `platform_fee` (numeric(10,2), not null default 0) — 10% of gross for payments
  - `net_amount` (numeric(10,2), not null default 0) — tradie's share after fee
  - `stripe_payment_intent_id` (text, nullable)
  - `stripe_transfer_id` (text, nullable)
  - `stripe_refund_id` (text, nullable)
  - `status` (text, not null, default 'pending')
    CHECK in: 'pending', 'requires_payment', 'succeeded', 'failed',
    'refunded', 'partially_refunded', 'disputed',
    'payout_pending', 'payout_succeeded', 'payout_failed'
  - `failure_reason` (text, nullable)
  - `metadata` (jsonb, nullable)
  - `created_at` (timestamptz, default now())
  - `updated_at` (timestamptz, default now())

- `disputes`
  - `id` (uuid, primary key, default gen_random_uuid())
  - `job_id` (uuid, not null, references jobs ON DELETE CASCADE)
  - `raised_by` (uuid, not null, references profiles ON DELETE CASCADE)
  - `raised_by_role` (text, not null, CHECK in 'customer' | 'tradie')
  - `reason` (text, not null)
  - `status` (text, not null, default 'open')
    CHECK in: 'open', 'under_review', 'resolved_full_refund',
    'resolved_partial_refund', 'resolved_no_refund', 'cancelled'
  - `resolver_id` (uuid, nullable, references profiles ON DELETE SET NULL)
  - `resolution_notes` (text, nullable)
  - `refund_amount` (numeric(10,2), nullable)
  - `raised_at` (timestamptz, default now())
  - `resolved_at` (timestamptz, nullable)

## Modified Tables
- `jobs`: add `agreed_quote_amount` (numeric(10,2), nullable),
  `payment_status` (text, not null default 'unpaid', CHECK in
  'unpaid' | 'paid' | 'refunded' | 'partially_refunded' | 'disputed'),
  `stripe_payment_intent_id` (text, nullable)
  These columns are NOT added to the client UPDATE grant — only settable
  by SECURITY DEFINER functions or the service role (webhook edge function).
- `profiles`: add `stripe_account_id` (text, nullable) — stores the Stripe
  Connect Express account ID. NOT client-writable.

## Extended Notification Types
Adds: 'payment_required', 'payment_received', 'payment_failed',
'refund_processed', 'payout_processed', 'dispute_raised', 'dispute_resolved'

## Extended Activity Types
Adds: 'payment_initiated', 'payment_received', 'payment_failed',
'refund_processed', 'payout_processed', 'dispute_raised', 'dispute_resolved'

## New Functions (SECURITY DEFINER)
1. `raise_dispute(p_job_id uuid, p_reason text)` — either party raises a
   dispute on a paid job. Verifies caller is customer or assigned tradie,
   job has payment_status 'paid' or 'disputed', no existing open dispute.
   Inserts dispute row, sets payment_status to 'disputed', notifies admin,
   logs activity.
2. `resolve_dispute(p_dispute_id uuid, p_resolution text, p_refund_amount numeric, p_notes text)`
   — admin only. Resolves a dispute with full_refund, partial_refund, or
   no_refund. For refund resolutions, creates a pending refund transaction
   (the actual Stripe refund is performed by the process-refund edge function).
   Updates dispute status, job payment_status, notifies both parties, logs activity.
3. `cancel_job_with_payment_check(p_job_id uuid)` — replaces direct status
   update for cancellations where a payment may exist. If the job is open or
   assigned and has been paid, creates a pending refund transaction. If the
   job is in_progress and has been paid, sets payment_status to 'disputed'
   and requires a dispute. The actual job status change still goes through
   update_job_status; this function handles the payment-side state only.
   The actual Stripe refund is performed by the process-refund edge function.

## Security (RLS)
- `transactions`: RLS enabled. Customer, assigned tradie, or admin can SELECT.
  No client INSERT/UPDATE/DELETE — all writes through SECURITY DEFINER
  functions or service role (webhook).
- `disputes`: RLS enabled. Customer, assigned tradie, or admin can SELECT.
  No client INSERT/UPDATE/DELETE — all writes through SECURITY DEFINER functions.
- `stripe_account_id` on profiles: NOT added to client UPDATE grant.
- New payment columns on jobs: NOT added to client UPDATE grant.

## Important Notes
1. All money columns use numeric(10,2). The platform fee is calculated
   server-side as 10% of agreed_quote_amount stored in the database — never
   from a client-supplied value.
2. The transactions table is the single source of truth for financial state.
   The webhook edge function updates it based on verified Stripe events.
3. Job status changes and payment operations are kept separate:
   update_job_status handles status, cancel_job_with_payment_check handles
   payment-side state, and the process-refund edge function performs the
   actual Stripe refund.
4. The accept_quote function is modified to lock agreed_quote_amount from
   the accepted quote's amount at acceptance time.
*/

-- ============================================================
-- 1. Add payment columns to jobs
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'jobs' AND column_name = 'agreed_quote_amount'
  ) THEN
    ALTER TABLE jobs ADD COLUMN agreed_quote_amount numeric(10,2);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'jobs' AND column_name = 'payment_status'
  ) THEN
    ALTER TABLE jobs ADD COLUMN payment_status text NOT NULL DEFAULT 'unpaid'
      CHECK (payment_status IN ('unpaid', 'paid', 'refunded', 'partially_refunded', 'disputed'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'jobs' AND column_name = 'stripe_payment_intent_id'
  ) THEN
    ALTER TABLE jobs ADD COLUMN stripe_payment_intent_id text;
  END IF;
END $$;

-- ============================================================
-- 2. Add stripe_account_id to profiles
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'stripe_account_id'
  ) THEN
    ALTER TABLE profiles ADD COLUMN stripe_account_id text;
  END IF;
END $$;

-- ============================================================
-- 3. Create transactions table
-- ============================================================
CREATE TABLE IF NOT EXISTS transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  tradie_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  type text NOT NULL CHECK (type IN ('payment', 'refund', 'payout')),
  gross_amount numeric(10,2) NOT NULL,
  platform_fee numeric(10,2) NOT NULL DEFAULT 0,
  net_amount numeric(10,2) NOT NULL DEFAULT 0,
  stripe_payment_intent_id text,
  stripe_transfer_id text,
  stripe_refund_id text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN (
      'pending', 'requires_payment', 'succeeded', 'failed',
      'refunded', 'partially_refunded', 'disputed',
      'payout_pending', 'payout_succeeded', 'payout_failed'
    )),
  failure_reason text,
  metadata jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

-- Indexes
CREATE INDEX IF NOT EXISTS transactions_job_id_idx ON transactions (job_id);
CREATE INDEX IF NOT EXISTS transactions_customer_id_idx ON transactions (customer_id);
CREATE INDEX IF NOT EXISTS transactions_tradie_id_idx ON transactions (tradie_id);
CREATE INDEX IF NOT EXISTS transactions_status_idx ON transactions (status);
CREATE INDEX IF NOT EXISTS transactions_stripe_payment_intent_idx ON transactions (stripe_payment_intent_id);

-- RLS: customer, assigned tradie, or admin can SELECT
DROP POLICY IF EXISTS "transactions_select_participants" ON transactions;
CREATE POLICY "transactions_select_participants"
  ON transactions FOR SELECT
  TO authenticated
  USING (
    customer_id = auth.uid()
    OR tradie_id = auth.uid()
    OR is_admin()
  );

-- No INSERT/UPDATE/DELETE policies for the client — all writes via
-- SECURITY DEFINER functions or service role
GRANT SELECT ON transactions TO authenticated;
REVOKE ALL ON transactions FROM anon;

-- Updated_at trigger
DROP TRIGGER IF EXISTS transactions_updated_at ON transactions;
CREATE TRIGGER transactions_updated_at
  BEFORE UPDATE ON transactions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- 4. Create disputes table
-- ============================================================
CREATE TABLE IF NOT EXISTS disputes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  raised_by uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  raised_by_role text NOT NULL CHECK (raised_by_role IN ('customer', 'tradie')),
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN (
      'open', 'under_review', 'resolved_full_refund',
      'resolved_partial_refund', 'resolved_no_refund', 'cancelled'
    )),
  resolver_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  resolution_notes text,
  refund_amount numeric(10,2),
  raised_at timestamptz DEFAULT now(),
  resolved_at timestamptz
);

ALTER TABLE disputes ENABLE ROW LEVEL SECURITY;

-- Indexes
CREATE INDEX IF NOT EXISTS disputes_job_id_idx ON disputes (job_id);
CREATE INDEX IF NOT EXISTS disputes_status_idx ON disputes (status);

-- RLS: customer, assigned tradie, or admin can SELECT
DROP POLICY IF EXISTS "disputes_select_participants" ON disputes;
CREATE POLICY "disputes_select_participants"
  ON disputes FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM jobs
      WHERE jobs.id = disputes.job_id
      AND (
        jobs.customer_id = auth.uid()
        OR jobs.assigned_tradie_id = auth.uid()
        OR is_admin()
      )
    )
  );

-- No INSERT/UPDATE/DELETE policies for the client
GRANT SELECT ON disputes TO authenticated;
REVOKE ALL ON disputes FROM anon;

-- ============================================================
-- 5. Extend notification types CHECK constraint
-- ============================================================
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check CHECK (type IN (
  'new_quote', 'new_interest', 'quote_accepted', 'quote_rejected',
  'job_assigned', 'new_message', 'job_status_changed', 'new_job_note',
  'job_completion_confirmed', 'new_review', 'new_job_attachment',
  'payment_required', 'payment_received', 'payment_failed',
  'refund_processed', 'payout_processed', 'dispute_raised', 'dispute_resolved'
));

-- ============================================================
-- 6. Extend activity types CHECK constraint
-- ============================================================
ALTER TABLE job_activity DROP CONSTRAINT IF EXISTS job_activity_activity_type_check;
ALTER TABLE job_activity ADD CONSTRAINT job_activity_activity_type_check
  CHECK (activity_type IN (
    'job_created', 'status_changed', 'quote_submitted', 'interest_expressed',
    'quote_accepted', 'quote_rejected', 'quote_withdrawn',
    'note_added', 'photo_uploaded', 'message_sent',
    'review_submitted', 'completion_requested', 'completion_confirmed',
    'payment_initiated', 'payment_received', 'payment_failed',
    'refund_processed', 'payout_processed', 'dispute_raised', 'dispute_resolved'
  ));

-- ============================================================
-- 7. Modify accept_quote to lock agreed_quote_amount
-- ============================================================
CREATE OR REPLACE FUNCTION accept_quote(p_quote_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_job_id uuid;
  v_tradie_id uuid;
  v_customer_id uuid;
  v_quote_status text;
  v_job_status text;
  v_quote_amount numeric(10,2);
  v_response_type text;
BEGIN
  SELECT job_id, tradie_id, status, amount, response_type
  INTO v_job_id, v_tradie_id, v_quote_status, v_quote_amount, v_response_type
  FROM job_quotes WHERE id = p_quote_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Quote not found';
  END IF;

  IF v_quote_status != 'pending' THEN
    RAISE EXCEPTION 'Only pending quotes can be accepted';
  END IF;

  SELECT customer_id, status
  INTO v_customer_id, v_job_status
  FROM jobs WHERE id = v_job_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Job not found';
  END IF;

  IF v_customer_id <> auth.uid() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF v_job_status != 'open' THEN
    RAISE EXCEPTION 'Job is no longer accepting quotes';
  END IF;

  -- Prevent self-assignment
  IF v_tradie_id = v_customer_id THEN
    RAISE EXCEPTION 'Cannot assign job to yourself';
  END IF;

  -- Require a concrete quote amount for payments
  IF v_response_type != 'quote' OR v_quote_amount IS NULL OR v_quote_amount <= 0 THEN
    RAISE EXCEPTION 'Cannot accept a response without a valid quote amount';
  END IF;

  -- Atomically: accept this quote, reject all other pending quotes,
  -- assign job, and lock the agreed quote amount
  UPDATE job_quotes SET status = 'accepted', updated_at = now()
  WHERE id = p_quote_id;

  UPDATE job_quotes SET status = 'rejected', updated_at = now()
  WHERE job_id = v_job_id AND id != p_quote_id AND status = 'pending';

  UPDATE jobs
  SET assigned_tradie_id = v_tradie_id,
      status = 'assigned',
      agreed_quote_amount = v_quote_amount,
      updated_at = now()
  WHERE id = v_job_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION accept_quote FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION accept_quote FROM anon;
GRANT EXECUTE ON FUNCTION accept_quote TO authenticated;

-- ============================================================
-- 8. Function: raise_dispute
-- ============================================================
CREATE OR REPLACE FUNCTION raise_dispute(
  p_job_id uuid,
  p_reason text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_job RECORD;
  v_dispute_id uuid;
  v_raised_by_role text;
  v_existing_count integer;
  v_admin_id uuid;
BEGIN
  IF p_reason IS NULL OR length(trim(p_reason)) < 10 THEN
    RAISE EXCEPTION 'Please provide a reason (at least 10 characters).';
  END IF;

  SELECT id, customer_id, assigned_tradie_id, status, payment_status, title
  INTO v_job
  FROM jobs WHERE id = p_job_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Job not found.';
  END IF;

  -- Caller must be the customer or the assigned tradie
  IF auth.uid() = v_job.customer_id THEN
    v_raised_by_role := 'customer';
  ELSIF v_job.assigned_tradie_id IS NOT NULL AND auth.uid() = v_job.assigned_tradie_id THEN
    v_raised_by_role := 'tradie';
  ELSE
    RAISE EXCEPTION 'You are not a participant in this job.';
  END IF;

  -- Job must have a payment
  IF v_job.payment_status NOT IN ('paid', 'disputed') THEN
    RAISE EXCEPTION 'A dispute can only be raised on a paid job.';
  END IF;

  -- No existing open or under_review dispute
  SELECT count(*) INTO v_existing_count
  FROM disputes
  WHERE job_id = p_job_id AND status IN ('open', 'under_review');

  IF v_existing_count > 0 THEN
    RAISE EXCEPTION 'A dispute is already open for this job.';
  END IF;

  -- Insert the dispute
  INSERT INTO disputes (job_id, raised_by, raised_by_role, reason)
  VALUES (p_job_id, auth.uid(), v_raised_by_role, p_reason)
  RETURNING id INTO v_dispute_id;

  -- Set job payment_status to disputed
  UPDATE jobs SET payment_status = 'disputed', updated_at = now()
  WHERE id = p_job_id;

  -- Log activity
  PERFORM log_job_activity(
    p_job_id,
    'dispute_raised',
    auth.uid(),
    'Dispute raised: ' || left(p_reason, 120),
    jsonb_build_object('dispute_id', v_dispute_id, 'raised_by_role', v_raised_by_role)
  );

  -- Notify all admins
  FOR v_admin_id IN SELECT id FROM profiles WHERE role = 'admin' LOOP
    PERFORM create_notification(
      v_admin_id,
      'dispute_raised',
      'Dispute raised',
      'A dispute has been raised on the job "' || v_job.title || '".',
      p_job_id
    );
  END LOOP;

  -- Notify the other party
  IF v_raised_by_role = 'customer' AND v_job.assigned_tradie_id IS NOT NULL THEN
    PERFORM create_notification(
      v_job.assigned_tradie_id,
      'dispute_raised',
      'A dispute has been raised',
      'The customer has raised a dispute on the job "' || v_job.title || '".',
      p_job_id
    );
  ELSIF v_raised_by_role = 'tradie' THEN
    PERFORM create_notification(
      v_job.customer_id,
      'dispute_raised',
      'A dispute has been raised',
      'The tradie has raised a dispute on the job "' || v_job.title || '".',
      p_job_id
    );
  END IF;

  RETURN v_dispute_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION raise_dispute FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION raise_dispute FROM anon;
GRANT EXECUTE ON FUNCTION raise_dispute TO authenticated;

-- ============================================================
-- 9. Function: resolve_dispute (admin only)
-- ============================================================
CREATE OR REPLACE FUNCTION resolve_dispute(
  p_dispute_id uuid,
  p_resolution text,
  p_refund_amount numeric DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_dispute RECORD;
  v_job RECORD;
  v_actual_refund numeric(10,2);
  v_payment_txn RECORD;
BEGIN
  -- Verify caller is admin
  IF NOT EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  -- Validate resolution type
  IF p_resolution NOT IN ('resolved_full_refund', 'resolved_partial_refund', 'resolved_no_refund') THEN
    RAISE EXCEPTION 'Invalid resolution type';
  END IF;

  -- Fetch the dispute
  SELECT * INTO v_dispute FROM disputes WHERE id = p_dispute_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Dispute not found';
  END IF;

  IF v_dispute.status NOT IN ('open', 'under_review') THEN
    RAISE EXCEPTION 'This dispute has already been resolved';
  END IF;

  -- Fetch the job
  SELECT * INTO v_job FROM jobs WHERE id = v_dispute.job_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Job not found';
  END IF;

  -- Fetch the original successful payment transaction
  SELECT * INTO v_payment_txn
  FROM transactions
  WHERE job_id = v_dispute.job_id
    AND type = 'payment'
    AND status = 'succeeded'
  ORDER BY created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No successful payment transaction found for this job';
  END IF;

  -- Determine refund amount
  IF p_resolution = 'resolved_full_refund' THEN
    v_actual_refund := v_payment_txn.gross_amount;
  ELSIF p_resolution = 'resolved_partial_refund' THEN
    IF p_refund_amount IS NULL OR p_refund_amount <= 0 OR p_refund_amount > v_payment_txn.gross_amount THEN
      RAISE EXCEPTION 'Invalid refund amount';
    END IF;
    v_actual_refund := p_refund_amount;
  ELSE
    v_actual_refund := 0;
  END IF;

  -- Update the dispute
  UPDATE disputes
  SET status = p_resolution,
      resolver_id = auth.uid(),
      resolution_notes = p_notes,
      refund_amount = v_actual_refund,
      resolved_at = now()
  WHERE id = p_dispute_id;

  -- Create a pending refund transaction if a refund is owed
  IF v_actual_refund > 0 THEN
    INSERT INTO transactions (
      job_id, customer_id, tradie_id, type,
      gross_amount, platform_fee, net_amount,
      status, metadata
    ) VALUES (
      v_dispute.job_id, v_job.customer_id, v_job.assigned_tradie_id,
      'refund', v_actual_refund, 0, v_actual_refund,
      'pending',
      jsonb_build_object('dispute_id', p_dispute_id, 'resolution', p_resolution, 'resolved_by', auth.uid())
    );

    -- Update job payment status
    IF v_actual_refund = v_payment_txn.gross_amount THEN
      UPDATE jobs SET payment_status = 'refunded', updated_at = now()
      WHERE id = v_dispute.job_id;
    ELSE
      UPDATE jobs SET payment_status = 'partially_refunded', updated_at = now()
      WHERE id = v_dispute.job_id;
    END IF;
  END IF;

  -- Log activity
  PERFORM log_job_activity(
    v_dispute.job_id,
    'dispute_resolved',
    auth.uid(),
    'Dispute resolved: ' || p_resolution,
    jsonb_build_object('dispute_id', p_dispute_id, 'refund_amount', v_actual_refund)
  );

  -- Notify both parties
  PERFORM create_notification(
    v_job.customer_id,
    'dispute_resolved',
    'Dispute resolved',
    'The dispute on the job "' || v_job.title || '" has been resolved by an admin.',
    v_dispute.job_id
  );

  IF v_job.assigned_tradie_id IS NOT NULL THEN
    PERFORM create_notification(
      v_job.assigned_tradie_id,
      'dispute_resolved',
      'Dispute resolved',
      'The dispute on the job "' || v_job.title || '" has been resolved by an admin.',
      v_dispute.job_id
    );
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION resolve_dispute FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION resolve_dispute FROM anon;
GRANT EXECUTE ON FUNCTION resolve_dispute TO authenticated;

-- ============================================================
-- 10. Function: cancel_job_with_payment_check
-- Handles payment-side state when a job is cancelled.
-- Does NOT perform the Stripe refund — only creates the
-- pending refund transaction. The process-refund edge function
-- performs the actual Stripe refund.
-- ============================================================
CREATE OR REPLACE FUNCTION cancel_job_with_payment_check(p_job_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_job RECORD;
  v_payment_txn RECORD;
BEGIN
  SELECT * INTO v_job FROM jobs WHERE id = p_job_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Job not found';
  END IF;

  -- Only proceed if there was a payment
  IF v_job.payment_status = 'unpaid' THEN
    RETURN;
  END IF;

  -- Fetch the successful payment transaction
  SELECT * INTO v_payment_txn
  FROM transactions
  WHERE job_id = p_job_id
    AND type = 'payment'
    AND status = 'succeeded'
  ORDER BY created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- If job is open or assigned (before work starts): full refund
  IF v_job.status IN ('open', 'assigned') THEN
    INSERT INTO transactions (
      job_id, customer_id, tradie_id, type,
      gross_amount, platform_fee, net_amount,
      status, metadata
    ) VALUES (
      p_job_id, v_job.customer_id, v_job.assigned_tradie_id,
      'refund', v_payment_txn.gross_amount, 0, v_payment_txn.gross_amount,
      'pending',
      jsonb_build_object('reason', 'cancellation_before_work_start')
    );

    UPDATE jobs SET payment_status = 'refunded', updated_at = now()
    WHERE id = p_job_id;

  -- If job is in_progress: require dispute (set to disputed)
  ELSIF v_job.status = 'in_progress' THEN
    UPDATE jobs SET payment_status = 'disputed', updated_at = now()
    WHERE id = p_job_id;
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION cancel_job_with_payment_check FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION cancel_job_with_payment_check FROM anon;
GRANT EXECUTE ON FUNCTION cancel_job_with_payment_check TO authenticated;

-- ============================================================
-- 11. Modify update_job_status to call cancel_job_with_payment_check
-- on cancellation. This keeps the status change and the Stripe
-- refund separate: the status changes here, the refund transaction
-- is created here, but the actual Stripe refund runs in the
-- process-refund edge function.
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

  IF NOT (
    (v_current_status = 'open'        AND p_new_status IN ('assigned', 'cancelled'))
    OR (v_current_status = 'assigned'   AND p_new_status IN ('in_progress', 'cancelled'))
    OR (v_current_status = 'in_progress' AND p_new_status IN ('cancelled'))
  ) THEN
    RAISE EXCEPTION 'Invalid status transition from % to %', v_current_status, p_new_status;
  END IF;

  IF p_new_status = 'assigned' AND v_assigned_tradie_id IS NULL THEN
    RAISE EXCEPTION 'Cannot assign job without an assigned tradie';
  END IF;

  -- Handle payment-side state before changing status
  IF p_new_status = 'cancelled' THEN
    PERFORM cancel_job_with_payment_check(p_job_id);
  END IF;

  -- Apply the status change
  IF p_new_status = 'cancelled' THEN
    UPDATE jobs SET status = p_new_status, assigned_tradie_id = NULL, updated_at = now()
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
-- 12. Modify confirm_job_completion to trigger payout
-- After customer confirms completion, create a pending payout
-- transaction. The process-payout edge function performs the
-- actual Stripe transfer.
-- ============================================================
CREATE OR REPLACE FUNCTION confirm_job_completion(p_job_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_job RECORD;
  v_platform_fee numeric(10,2);
  v_net_amount numeric(10,2);
BEGIN
  SELECT * INTO v_job FROM jobs WHERE id = p_job_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Job not found.';
  END IF;

  IF v_job.customer_id != auth.uid() THEN
    RAISE EXCEPTION 'You are not authorized to confirm this job completion.';
  END IF;

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

  -- Create a pending payout transaction if the job was paid
  IF v_job.payment_status = 'paid' AND v_job.agreed_quote_amount IS NOT NULL AND v_job.agreed_quote_amount > 0 THEN
    v_platform_fee := round(v_job.agreed_quote_amount * 0.10, 2);
    v_net_amount := v_job.agreed_quote_amount - v_platform_fee;

    INSERT INTO transactions (
      job_id, customer_id, tradie_id, type,
      gross_amount, platform_fee, net_amount,
      status, metadata
    ) VALUES (
      p_job_id, v_job.customer_id, v_job.assigned_tradie_id,
      'payout', v_job.agreed_quote_amount, v_platform_fee, v_net_amount,
      'payout_pending',
      jsonb_build_object('trigger', 'completion_confirmed')
    );
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION confirm_job_completion FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION confirm_job_completion FROM anon;
GRANT EXECUTE ON FUNCTION confirm_job_completion TO authenticated;
