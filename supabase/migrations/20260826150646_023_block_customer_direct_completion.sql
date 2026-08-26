/*
# Block customer direct in_progress -> completed transition

## Purpose
The customer's `update_job_status` function previously allowed
in_progress -> completed. This let the customer bypass the tradie's
completion step, setting status='completed' WITHOUT setting
tradie_completed_at — which then blocked the "Confirm Completion"
button (requires tradie_completed_at IS NOT NULL) and the review
workflow (requires customer_confirmed_at IS NOT NULL).

The tradie's `tradie_update_job_status` is now the ONLY path to
'completed', which correctly sets tradie_completed_at. The customer
then confirms via `confirm_job_completion`, which sets
customer_confirmed_at.

## Change
Remove 'completed' from the allowed transitions for 'in_progress'
in update_job_status. The customer can still cancel from
in_progress. All other transitions are unchanged.

## Security
- No changes to RLS, grants, or column privileges.
- No changes to tradie_update_job_status or confirm_job_completion.
*/

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
  -- Note: in_progress -> completed is intentionally NOT allowed here.
  -- Only the assigned tradie can move a job to 'completed' via
  -- tradie_update_job_status, which sets tradie_completed_at.
  -- The customer then confirms via confirm_job_completion.
  IF NOT (
    (v_current_status = 'open'        AND p_new_status IN ('assigned', 'cancelled'))
    OR (v_current_status = 'assigned'   AND p_new_status IN ('in_progress', 'cancelled'))
    OR (v_current_status = 'in_progress' AND p_new_status IN ('cancelled'))
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

REVOKE EXECUTE ON FUNCTION update_job_status FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION update_job_status FROM anon;
GRANT EXECUTE ON FUNCTION update_job_status TO authenticated;
