-- Update confirm_job_completion to use 3.5% platform fee instead of 10%

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
    v_platform_fee := round(v_job.agreed_quote_amount * 0.035, 2);
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
