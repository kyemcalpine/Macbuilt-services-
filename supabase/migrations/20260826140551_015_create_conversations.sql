/*
# Create conversations table

## Purpose
Stores 1:1 conversations between a customer and a tradie, scoped to a
specific job. A conversation is the container for messages — it links
two participants to a job so they can communicate about it.

## New Tables
- `conversations`
  - `id` (uuid, primary key, default gen_random_uuid())
  - `job_id` (uuid, not null, references jobs ON DELETE CASCADE)
  - `customer_id` (uuid, not null, references profiles ON DELETE CASCADE)
  - `tradie_id` (uuid, not null, references profiles ON DELETE CASCADE)
  - `created_at` (timestamptz, default now())
  - `updated_at` (timestamptz, default now())

## Constraints
- Unique constraint on (job_id, customer_id, tradie_id): only one
  conversation per customer-tradie pair per job.

## Indexes
- `conversations_job_id_idx` on (job_id)
- `conversations_customer_id_idx` on (customer_id)
- `conversations_tradie_id_idx` on (tradie_id)

## Security (RLS)
- Row Level Security enabled.
- Customer can SELECT conversations where customer_id = auth.uid().
- Tradie can SELECT conversations where tradie_id = auth.uid().
- Admin can SELECT all conversations (is_admin()).
- Either participant can INSERT a conversation (customer_id = auth.uid()
  OR tradie_id = auth.uid()), but only if the tradie has an active
  (non-withdrawn) quote on the job OR is the assigned tradie.
- No UPDATE or DELETE — conversations are immutable once created.
- anon role has NO access (revoked).

## Important Notes
1. The INSERT policy uses a WITH CHECK subquery against job_quotes to
   verify the tradie has a non-withdrawn response on the job, OR against
   jobs to verify the tradie is the assigned_tradie_id. This prevents
   random users from creating conversations on jobs they have no
   relationship to.
2. The self-conversation guard (customer_id != tradie_id) is enforced
   via CHECK constraint.
3. Conversations are immutable — no edits, no deletes. This preserves
   the communication audit trail.
*/

CREATE TABLE IF NOT EXISTS conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  tradie_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT conversations_no_self CHECK (customer_id != tradie_id)
);

-- Unique constraint: one conversation per customer-tradie pair per job
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'conversations_job_customer_tradie_unique'
      AND table_name = 'conversations'
  ) THEN
    ALTER TABLE conversations
      ADD CONSTRAINT conversations_job_customer_tradie_unique
      UNIQUE (job_id, customer_id, tradie_id);
  END IF;
END $$;

ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;

-- Indexes
CREATE INDEX IF NOT EXISTS conversations_job_id_idx ON conversations (job_id);
CREATE INDEX IF NOT EXISTS conversations_customer_id_idx ON conversations (customer_id);
CREATE INDEX IF NOT EXISTS conversations_tradie_id_idx ON conversations (tradie_id);

-- SELECT: customer sees their conversations, tradie sees theirs, admin sees all
DROP POLICY IF EXISTS "conversations_select_customer" ON conversations;
CREATE POLICY "conversations_select_customer"
  ON conversations FOR SELECT
  TO authenticated
  USING (auth.uid() = customer_id);

DROP POLICY IF EXISTS "conversations_select_tradie" ON conversations;
CREATE POLICY "conversations_select_tradie"
  ON conversations FOR SELECT
  TO authenticated
  USING (auth.uid() = tradie_id);

DROP POLICY IF EXISTS "conversations_select_admin" ON conversations;
CREATE POLICY "conversations_select_admin"
  ON conversations FOR SELECT
  TO authenticated
  USING (is_admin());

-- INSERT: either participant can create, but only if the tradie has an
-- active quote on the job OR is the assigned tradie
DROP POLICY IF EXISTS "conversations_insert_participants" ON conversations;
CREATE POLICY "conversations_insert_participants"
  ON conversations FOR INSERT
  TO authenticated
  WITH CHECK (
    (auth.uid() = customer_id OR auth.uid() = tradie_id)
    AND customer_id != tradie_id
    AND (
      -- Tradie has an active (non-withdrawn) response on the job
      EXISTS (
        SELECT 1 FROM job_quotes
        WHERE job_quotes.job_id = conversations.job_id
          AND job_quotes.tradie_id = conversations.tradie_id
          AND job_quotes.status != 'withdrawn'
      )
      OR
      -- Tradie is the assigned tradie on the job
      EXISTS (
        SELECT 1 FROM jobs
        WHERE jobs.id = conversations.job_id
          AND jobs.assigned_tradie_id = conversations.tradie_id
      )
    )
  );

-- Grant SELECT and INSERT only (no UPDATE, no DELETE)
GRANT SELECT ON conversations TO authenticated;
GRANT INSERT (id, job_id, customer_id, tradie_id) ON conversations TO authenticated;

-- Revoke anon access
REVOKE ALL ON conversations FROM anon;

-- Updated_at trigger (reuse existing function)
DROP TRIGGER IF EXISTS conversations_updated_at ON conversations;
CREATE TRIGGER conversations_updated_at
  BEFORE UPDATE ON conversations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();
