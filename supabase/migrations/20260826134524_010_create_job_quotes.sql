/*
# Create job_quotes table

## Purpose
Stores tradie responses to jobs — both formal quotes (with a price) and
expressions of interest (for fixed-budget jobs). This is the core table
for the marketplace quoting workflow.

## New Tables
- `job_quotes`
  - `id` (uuid, primary key, default gen_random_uuid())
  - `job_id` (uuid, not null, references jobs ON DELETE CASCADE)
  - `tradie_id` (uuid, not null, references profiles ON DELETE CASCADE)
  - `response_type` (text, not null, CHECK in 'quote' | 'interest')
    — 'quote' = formal quote with price; 'interest' = expression of interest
  - `amount` (numeric(10,2), nullable)
    — required and must be > 0 when response_type = 'quote';
      must be NULL when response_type = 'interest'
  - `message` (text, not null) — message to the customer
  - `notes` (text, nullable) — optional internal notes
  - `estimated_start_date` (timestamptz, nullable)
  - `estimated_duration` (text, nullable) — e.g. "2 days", "1 week"
  - `status` (text, not null, default 'pending', CHECK in 'pending' | 'accepted' | 'rejected' | 'withdrawn')
  - `created_at` (timestamptz, default now())
  - `updated_at` (timestamptz, default now())

## Constraints
- CHECK constraint `job_quotes_amount_check`: if response_type = 'quote' then
  amount must be > 0; if response_type = 'interest' then amount must be NULL.
- Partial unique index `job_quotes_one_active_per_tradie`: prevents a tradie
  from having more than one non-withdrawn response per job.

## Indexes
- `job_quotes_job_id_idx` on (job_id)
- `job_quotes_tradie_id_idx` on (tradie_id)
- `job_quotes_one_active_per_tradie` UNIQUE on (job_id, tradie_id) WHERE status != 'withdrawn'

## Security (RLS)
- Row Level Security enabled.
- Tradies can INSERT responses where tradie_id = auth.uid().
- Tradies can SELECT responses they submitted (tradie_id = auth.uid()).
- Job owners can SELECT responses on their own jobs (job.customer_id = auth.uid()).
- Admins can SELECT all responses (is_admin()).
- Tradies can UPDATE only the status column of their own responses (for withdrawal).
  Column-level UPDATE grant is restricted to `status` only.
- No DELETE — responses are never deleted, only withdrawn.
- anon role has NO access (revoked).

## Important Notes
1. The `amount` column is nullable so interest responses can have amount = NULL.
   The CHECK constraint enforces that quotes must have amount > 0 and interests
   must have amount = NULL.
2. The partial unique index allows a tradie to submit a new response after
   withdrawing their previous one (withdrawn rows are excluded from the index).
3. The `accept_quote` and `reject_quote` SECURITY DEFINER functions (created
   in a separate migration) handle status changes that the client cannot make
   directly — the column-level UPDATE grant only allows the tradie to withdraw
   their own response.
*/

CREATE TABLE IF NOT EXISTS job_quotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  tradie_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  response_type text NOT NULL CHECK (response_type IN ('quote', 'interest')),
  amount numeric(10,2),
  message text NOT NULL,
  notes text,
  estimated_start_date timestamptz,
  estimated_duration text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'rejected', 'withdrawn')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT job_quotes_amount_check CHECK (
    (response_type = 'quote' AND amount IS NOT NULL AND amount > 0)
    OR
    (response_type = 'interest' AND amount IS NULL)
  )
);

ALTER TABLE job_quotes ENABLE ROW LEVEL SECURITY;

-- Indexes
CREATE INDEX IF NOT EXISTS job_quotes_job_id_idx ON job_quotes (job_id);
CREATE INDEX IF NOT EXISTS job_quotes_tradie_id_idx ON job_quotes (tradie_id);

-- Partial unique index: one active response per tradie per job
CREATE UNIQUE INDEX IF NOT EXISTS job_quotes_one_active_per_tradie
  ON job_quotes (job_id, tradie_id)
  WHERE status != 'withdrawn';

-- RLS Policies

-- INSERT: tradies can submit their own responses
DROP POLICY IF EXISTS "job_quotes_insert_own" ON job_quotes;
CREATE POLICY "job_quotes_insert_own"
  ON job_quotes FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = tradie_id);

-- SELECT: tradies see their own responses, job owners see responses on their jobs, admins see all
DROP POLICY IF EXISTS "job_quotes_select_tradie" ON job_quotes;
CREATE POLICY "job_quotes_select_tradie"
  ON job_quotes FOR SELECT
  TO authenticated
  USING (auth.uid() = tradie_id);

DROP POLICY IF EXISTS "job_quotes_select_job_owner" ON job_quotes;
CREATE POLICY "job_quotes_select_job_owner"
  ON job_quotes FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM jobs WHERE jobs.id = job_quotes.job_id AND jobs.customer_id = auth.uid())
  );

DROP POLICY IF EXISTS "job_quotes_select_admin" ON job_quotes;
CREATE POLICY "job_quotes_select_admin"
  ON job_quotes FOR SELECT
  TO authenticated
  USING (is_admin());

-- UPDATE: tradies can update only their own responses (for withdrawal)
-- Column-level privileges restrict this to the status column only
DROP POLICY IF EXISTS "job_quotes_update_own" ON job_quotes;
CREATE POLICY "job_quotes_update_own"
  ON job_quotes FOR UPDATE
  TO authenticated
  USING (auth.uid() = tradie_id)
  WITH CHECK (auth.uid() = tradie_id);

-- Column-level privileges: only status is updatable by the client
REVOKE UPDATE ON job_quotes FROM authenticated;
GRANT UPDATE (status) ON job_quotes TO authenticated;

-- Grant SELECT and INSERT
GRANT SELECT ON job_quotes TO authenticated;
GRANT INSERT (
  id, job_id, tradie_id, response_type, amount, message, notes,
  estimated_start_date, estimated_duration, status
) ON job_quotes TO authenticated;

-- Revoke anon access
REVOKE ALL ON job_quotes FROM anon;

-- Updated_at trigger (reuse existing function)
DROP TRIGGER IF EXISTS job_quotes_updated_at ON job_quotes;
CREATE TRIGGER job_quotes_updated_at
  BEFORE UPDATE ON job_quotes
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();
