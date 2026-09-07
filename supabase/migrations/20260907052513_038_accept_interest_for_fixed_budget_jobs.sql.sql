/*
# Fix: Accept Interest on Fixed Budget Jobs

## Purpose
Fixes a bug where accepting a tradie's "interest" response on a fixed budget
job fails with "Cannot accept a response without a valid quote amount".

On fixed budget jobs, tradies express interest (response_type = 'interest')
without submitting a quote amount. The previous accept_quote function required
every accepted response to have response_type = 'quote' and a non-null positive
amount, which made it impossible to accept an interest response.

## Changes
1. Modifies `accept_quote` to fetch the job's `quote_preference` and `budget`.
2. For fixed_budget jobs with an interest response:
   - Allows acceptance even when quote amount is null or zero.
   - Uses the job's `budget` as the `agreed_quote_amount` (the contract amount).
   - If the job budget is also null, raises an error (can't accept without a price).
3. For normal quote jobs (open_to_quotes): behavior is unchanged — still requires
   response_type = 'quote' with a valid positive amount.

## Security
- No changes to RLS, grants, or column-level privileges.
- No changes to Stripe/payout logic.
- The function remains SECURITY DEFINER with search_path = public.
- Execute remains revoked from PUBLIC/anon, granted to authenticated.
*/

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
  v_quote_preference text;
  v_job_budget numeric(10,2);
  v_agreed_amount numeric(10,2);
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

  SELECT customer_id, status, quote_preference, budget
  INTO v_customer_id, v_job_status, v_quote_preference, v_job_budget
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

  -- Determine the agreed amount based on job type
  IF v_quote_preference = 'fixed_budget' AND v_response_type = 'interest' THEN
    -- Fixed budget job: use the job's budget as the contract amount
    IF v_job_budget IS NULL OR v_job_budget <= 0 THEN
      RAISE EXCEPTION 'Cannot accept interest on a fixed budget job without a valid budget';
    END IF;
    v_agreed_amount := v_job_budget;
  ELSE
    -- Normal quote job: require a concrete quote amount
    IF v_response_type != 'quote' OR v_quote_amount IS NULL OR v_quote_amount <= 0 THEN
      RAISE EXCEPTION 'Cannot accept a response without a valid quote amount';
    END IF;
    v_agreed_amount := v_quote_amount;
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
      agreed_quote_amount = v_agreed_amount,
      updated_at = now()
  WHERE id = v_job_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION accept_quote FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION accept_quote FROM anon;
GRANT EXECUTE ON FUNCTION accept_quote TO authenticated;
