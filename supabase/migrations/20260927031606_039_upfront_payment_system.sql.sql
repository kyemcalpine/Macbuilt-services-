/*
# Upfront Payment System

## Purpose
Adds admin-configurable upfront payment percentages (0%, 25%, 50%, 100%)
to the platform. When a job is assigned, the customer sees an upfront
payment option based on the platform-wide setting. The remaining balance
can be paid later via the existing Stripe flow.

## New Tables
- `platform_settings` — single-row table for platform-wide configuration.
  - `upfront_payment_percent` integer NOT NULL DEFAULT 0
    CHECK (value IN (0, 25, 50, 100))

## New Functions
1. `get_upfront_payment_percent()` — SECURITY DEFINER, callable by any
   authenticated user. Returns the current upfront percentage.
2. `set_upfront_payment_percent(p_percent integer)` — SECURITY DEFINER,
   admin only. Updates the upfront payment percentage.

## Security
- `platform_settings`: RLS enabled. Admin-only SELECT (via is_admin()).
  No client INSERT/UPDATE/DELETE — all writes through SECURITY DEFINER
  functions.
- `get_upfront_payment_percent` is safe to expose to all authenticated
  users because it only returns the percentage value (not sensitive).
- `set_upfront_payment_percent` verifies admin role before updating.

## Existing Stripe Flows
- The existing 'full', 'deposit', and 'remaining' payment types in the
  create-payment edge function are preserved unchanged.
- A new 'upfront' payment type is added alongside them.
- The webhook's label map is extended to include 'upfront'.
*/

-- ============================================================
-- 1. Create platform_settings table (single row)
-- ============================================================
CREATE TABLE IF NOT EXISTS platform_settings (
  id integer PRIMARY KEY DEFAULT 1,
  upfront_payment_percent integer NOT NULL DEFAULT 0
    CHECK (upfront_payment_percent IN (0, 25, 50, 100)),
  updated_at timestamptz DEFAULT now(),
  updated_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  CONSTRAINT single_row CHECK (id = 1)
);

ALTER TABLE platform_settings ENABLE ROW LEVEL SECURITY;

-- Admin-only SELECT
DROP POLICY IF EXISTS "platform_settings_select_admin" ON platform_settings;
CREATE POLICY "platform_settings_select_admin"
  ON platform_settings FOR SELECT
  TO authenticated
  USING (is_admin());

GRANT SELECT ON platform_settings TO authenticated;
REVOKE ALL ON platform_settings FROM anon;

-- Insert the default row
INSERT INTO platform_settings (id, upfront_payment_percent)
VALUES (1, 0)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 2. Function: get_upfront_payment_percent (all authenticated)
-- ============================================================
CREATE OR REPLACE FUNCTION get_upfront_payment_percent()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_percent integer;
BEGIN
  SELECT upfront_payment_percent INTO v_percent
  FROM platform_settings WHERE id = 1;

  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  RETURN v_percent;
END;
$$;

REVOKE EXECUTE ON FUNCTION get_upfront_payment_percent FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION get_upfront_payment_percent FROM anon;
GRANT EXECUTE ON FUNCTION get_upfront_payment_percent TO authenticated;

-- ============================================================
-- 3. Function: set_upfront_payment_percent (admin only)
-- ============================================================
CREATE OR REPLACE FUNCTION set_upfront_payment_percent(p_percent integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF p_percent NOT IN (0, 25, 50, 100) THEN
    RAISE EXCEPTION 'Invalid upfront percentage. Must be 0, 25, 50, or 100.';
  END IF;

  UPDATE platform_settings
  SET upfront_payment_percent = p_percent,
      updated_at = now(),
      updated_by = auth.uid()
  WHERE id = 1;
END;
$$;

REVOKE EXECUTE ON FUNCTION set_upfront_payment_percent FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION set_upfront_payment_percent FROM anon;
GRANT EXECUTE ON FUNCTION set_upfront_payment_percent TO authenticated;

-- ============================================================
-- 4. Add 'upfront_payment_required' to notification types
-- ============================================================
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check CHECK (type IN (
  'new_quote', 'new_interest', 'quote_accepted', 'quote_rejected',
  'job_assigned', 'new_message', 'job_status_changed', 'new_job_note',
  'job_completion_confirmed', 'new_review', 'new_job_attachment',
  'payment_required', 'payment_received', 'payment_failed',
  'refund_processed', 'payout_processed', 'dispute_raised', 'dispute_resolved',
  'job_reopened', 'deposit_requested', 'upfront_payment_required', 'deposit_paid'
));

-- ============================================================
-- 5. Notification/activity types are already covered — no new activity type needed
-- The existing 'payment_initiated' and 'payment_received' activity types
-- will be reused for upfront payments via metadata.
-- ============================================================
