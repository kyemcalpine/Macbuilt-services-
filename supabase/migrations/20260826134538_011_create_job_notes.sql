/*
# Create job_notes table

## Purpose
Stores ongoing notes on a job — a chronological log that the customer and
assigned tradie can both write to for collaboration during an active job.
Admins can view notes for oversight.

## New Tables
- `job_notes`
  - `id` (uuid, primary key, default gen_random_uuid())
  - `job_id` (uuid, not null, references jobs ON DELETE CASCADE)
  - `author_id` (uuid, not null, references profiles ON DELETE CASCADE)
  - `note` (text, not null) — the note content
  - `created_at` (timestamptz, default now())
  - `updated_at` (timestamptz, default now())

## Indexes
- `job_notes_job_id_idx` on (job_id) for chronological retrieval

## Security (RLS)
- Row Level Security enabled.
- Job owners can SELECT and INSERT notes on their own jobs.
- The assigned tradie can SELECT and INSERT notes on jobs assigned to them.
- Admins can SELECT all notes.
- No UPDATE or DELETE — notes are immutable once posted (audit trail).
- anon role has NO access (revoked).

## Important Notes
1. Notes are write-once: once posted, they cannot be edited or deleted.
   This preserves a clean chronological audit trail for collaboration.
2. Only the assigned tradie (jobs.assigned_tradie_id = auth.uid()) can see
   notes — a tradie who merely submitted a quote but was not assigned
   cannot access the private working notes.
3. The RLS SELECT policy uses an OR across three conditions: job owner,
   assigned tradie, or admin.
*/

CREATE TABLE IF NOT EXISTS job_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  note text NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE job_notes ENABLE ROW LEVEL SECURITY;

-- Index
CREATE INDEX IF NOT EXISTS job_notes_job_id_idx ON job_notes (job_id);

-- RLS Policies

-- SELECT: job owner, assigned tradie, or admin
DROP POLICY IF EXISTS "job_notes_select_participants" ON job_notes;
CREATE POLICY "job_notes_select_participants"
  ON job_notes FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM jobs
      WHERE jobs.id = job_notes.job_id
      AND (
        jobs.customer_id = auth.uid()
        OR jobs.assigned_tradie_id = auth.uid()
        OR is_admin()
      )
    )
  );

-- INSERT: job owner or assigned tradie can add notes
DROP POLICY IF EXISTS "job_notes_insert_participants" ON job_notes;
CREATE POLICY "job_notes_insert_participants"
  ON job_notes FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = author_id
    AND EXISTS (
      SELECT 1 FROM jobs
      WHERE jobs.id = job_notes.job_id
      AND (
        jobs.customer_id = auth.uid()
        OR jobs.assigned_tradie_id = auth.uid()
      )
    )
  );

-- Grant SELECT and INSERT only (no UPDATE, no DELETE)
GRANT SELECT ON job_notes TO authenticated;
GRANT INSERT (id, job_id, author_id, note) ON job_notes TO authenticated;

-- Revoke anon access
REVOKE ALL ON job_notes FROM anon;

-- Updated_at trigger (reuse existing function)
DROP TRIGGER IF EXISTS job_notes_updated_at ON job_notes;
CREATE TRIGGER job_notes_updated_at
  BEFORE UPDATE ON job_notes
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();
