/*
# Create secure quote management functions

## Purpose
Three SECURITY DEFINER functions for the marketplace workflow:
- `accept_quote` — atomically accepts a quote/interest, assigns the job,
  and rejects all other pending responses. This is the ONLY way a job
  gets assigned to a tradie.
- `reject_quote` — rejects a single pending response (job owner only).
- `withdraw_quote` — allows a tradie to withdraw their own pending response.

## Functions

### accept_quote(p_quote_id uuid)
1. Fetches the quote and its job.
2. Verifies the caller is the job owner (customer_id = auth.uid()).
3. Verifies the quote status is 'pending'.
4. Verifies the job status is 'open' (can't accept on an already-assigned job).
5. Verifies the quote's tradie_id is NOT the job's customer_id (no self-assignment).
6. Atomically:
   a. Marks the selected quote as 'accepted'.
   b. Rejects all other pending quotes on that job (status = 'rejected').
   c. Sets jobs.assigned_tradie_id = quote.tradie_id.
   d. Sets jobs.status = 'assigned'.
7. All in one transaction — a job can never be assigned to multiple tradies.

### reject_quote(p_quote_id uuid)
1. Fetches the quote and its job.
2. Verifies the caller is the job owner.
3. Verifies the quote status is 'pending'.
4. Marks the quote as 'rejected'.

### withdraw_quote(p_quote_id uuid)
1. Fetches the quote.
2. Verifies the caller is the quote's tradie (tradie_id = auth.uid()).
3. Verifies the quote status is 'pending'.
4. Marks the quote as 'withdrawn'.

## Security
- All three are SECURITY DEFINER with search_path = public.
- Execute revoked from PUBLIC and anon; granted to authenticated only.
- These functions perform mutations that the client cannot do directly:
  - accept_quote updates job_quotes.status AND jobs.assigned_tradie_id AND
    jobs.status — none of which the client can set via normal CRUD
    (column-level privileges restrict both tables).
  - reject_quote and withdraw_quote update job_quotes.status — the client
    CAN update status directly (column-level grant), but these functions
    add ownership and state validation.

## Important Notes
1. The self-assignment guard (tradie_id != customer_id) prevents a customer
   from accepting their own response on their own job.
2. The job status check ('open') in accept_quote prevents double-assignment.
3. All three functions raise exceptions on any validation failure, which
   surface as errors to the client.
*/

-- accept_quote: atomically accept a response, assign the job, reject others
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
BEGIN
  SELECT job_id, tradie_id, status
  INTO v_job_id, v_tradie_id, v_quote_status
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

  -- Atomically: accept this quote, reject all other pending quotes, assign job
  UPDATE job_quotes SET status = 'accepted', updated_at = now()
  WHERE id = p_quote_id;

  UPDATE job_quotes SET status = 'rejected', updated_at = now()
  WHERE job_id = v_job_id AND id != p_quote_id AND status = 'pending';

  UPDATE jobs
  SET assigned_tradie_id = v_tradie_id,
      status = 'assigned',
      updated_at = now()
  WHERE id = v_job_id;
END;
$$;

-- reject_quote: job owner rejects a single pending quote
CREATE OR REPLACE FUNCTION reject_quote(p_quote_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_job_id uuid;
  v_customer_id uuid;
  v_quote_status text;
BEGIN
  SELECT job_id, status
  INTO v_job_id, v_quote_status
  FROM job_quotes WHERE id = p_quote_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Quote not found';
  END IF;

  IF v_quote_status != 'pending' THEN
    RAISE EXCEPTION 'Only pending quotes can be rejected';
  END IF;

  SELECT customer_id INTO v_customer_id
  FROM jobs WHERE id = v_job_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Job not found';
  END IF;

  IF v_customer_id <> auth.uid() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  UPDATE job_quotes SET status = 'rejected', updated_at = now()
  WHERE id = p_quote_id;
END;
$$;

-- withdraw_quote: tradie withdraws their own pending quote
CREATE OR REPLACE FUNCTION withdraw_quote(p_quote_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_tradie_id uuid;
  v_quote_status text;
BEGIN
  SELECT tradie_id, status
  INTO v_tradie_id, v_quote_status
  FROM job_quotes WHERE id = p_quote_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Quote not found';
  END IF;

  IF v_tradie_id <> auth.uid() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF v_quote_status != 'pending' THEN
    RAISE EXCEPTION 'Only pending quotes can be withdrawn';
  END IF;

  UPDATE job_quotes SET status = 'withdrawn', updated_at = now()
  WHERE id = p_quote_id;
END;
$$;

-- Revoke and grant execute
REVOKE EXECUTE ON FUNCTION accept_quote FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION accept_quote FROM anon;
GRANT EXECUTE ON FUNCTION accept_quote TO authenticated;

REVOKE EXECUTE ON FUNCTION reject_quote FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION reject_quote FROM anon;
GRANT EXECUTE ON FUNCTION reject_quote TO authenticated;

REVOKE EXECUTE ON FUNCTION withdraw_quote FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION withdraw_quote FROM anon;
GRANT EXECUTE ON FUNCTION withdraw_quote TO authenticated;
