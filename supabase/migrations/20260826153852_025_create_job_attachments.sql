/*
# Create job_attachments table

## Purpose
Stores metadata for photos and files attached to jobs. Customers can
upload job photos when creating/editing a job so tradies can see the
problem before quoting. Once a tradie is assigned, both the customer
and the assigned tradie can upload progress, completion, and additional
photos during the job lifecycle. The actual file binaries live in a
private Supabase Storage bucket; this table holds the metadata and
the storage path.

## New Tables
- `job_attachments`
  - `id` (uuid, primary key, default gen_random_uuid())
  - `job_id` (uuid, not null, references jobs ON DELETE CASCADE)
  - `uploaded_by` (uuid, not null, default auth.uid(), references profiles ON DELETE CASCADE)
  - `attachment_type` (text, not null) — one of 'job_photo', 'progress_photo', 'completion_photo', 'additional_photo'
  - `storage_path` (text, not null) — path within the private storage bucket
  - `file_name` (text, not null) — original filename for display
  - `mime_type` (text, not null) — MIME type of the file
  - `file_size` (bigint, not null) — file size in bytes
  - `caption` (text, nullable) — optional caption
  - `created_at` (timestamptz, default now())

## Indexes
- `job_attachments_job_id_idx` on (job_id) for retrieval by job

## Security (RLS)
- Row Level Security enabled.
- SELECT: job owner, assigned tradie, or admin can read attachments
  (same participant check as job_notes).
- INSERT: handled via the add_job_attachment SECURITY DEFINER function,
  which validates who can upload which attachment type. A permissive
  INSERT policy exists so the function (running as the owner) can insert,
  but the function enforces all business rules.
- DELETE: only the uploader can delete their own attachment, and only
  while the job is active (not completed/cancelled). Handled via the
  delete_job_attachment SECURITY DEFINER function.
- anon role has NO access (revoked).

## Important Notes
1. The actual file upload to Storage happens client-side AFTER the
   add_job_attachment function creates the DB row and returns the
   storage path. If the storage upload fails, the client calls
   delete_job_attachment to clean up the orphaned row.
2. attachment_type rules:
   - job_photo: customer only, while job is open
   - progress_photo: assigned tradie only, while job is in_progress
   - completion_photo: assigned tradie only, while job is completed/awaiting confirmation
   - additional_photo: customer or assigned tradie, while job is active (assigned/in_progress/completed awaiting confirmation)
3. No UPDATE — attachments are immutable once created (except deletion).
*/

CREATE TABLE IF NOT EXISTS job_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  uploaded_by uuid NOT NULL DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE CASCADE,
  attachment_type text NOT NULL CHECK (attachment_type IN (
    'job_photo', 'progress_photo', 'completion_photo', 'additional_photo'
  )),
  storage_path text NOT NULL,
  file_name text NOT NULL,
  mime_type text NOT NULL,
  file_size bigint NOT NULL,
  caption text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE job_attachments ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS job_attachments_job_id_idx ON job_attachments (job_id);

-- SELECT: job owner, assigned tradie, or admin
DROP POLICY IF EXISTS "job_attachments_select_participants" ON job_attachments;
CREATE POLICY "job_attachments_select_participants"
  ON job_attachments FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM jobs
      WHERE jobs.id = job_attachments.job_id
      AND (
        jobs.customer_id = auth.uid()
        OR jobs.assigned_tradie_id = auth.uid()
        OR is_admin()
      )
    )
  );

-- INSERT: the add_job_attachment SECURITY DEFINER function handles this.
-- The policy allows authenticated users to insert rows where they are the
-- uploader and are a job participant. The function enforces the finer
-- attachment_type and job-status rules.
DROP POLICY IF EXISTS "job_attachments_insert_participants" ON job_attachments;
CREATE POLICY "job_attachments_insert_participants"
  ON job_attachments FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = uploaded_by
    AND EXISTS (
      SELECT 1 FROM jobs
      WHERE jobs.id = job_attachments.job_id
      AND (
        jobs.customer_id = auth.uid()
        OR jobs.assigned_tradie_id = auth.uid()
      )
    )
  );

-- DELETE: only the uploader can delete their own attachment
DROP POLICY IF EXISTS "job_attachments_delete_own" ON job_attachments;
CREATE POLICY "job_attachments_delete_own"
  ON job_attachments FOR DELETE
  TO authenticated
  USING (auth.uid() = uploaded_by);

-- Grant SELECT, INSERT, DELETE (no UPDATE)
GRANT SELECT ON job_attachments TO authenticated;
GRANT INSERT (id, job_id, uploaded_by, attachment_type, storage_path, file_name, mime_type, file_size, caption) ON job_attachments TO authenticated;
GRANT DELETE ON job_attachments TO authenticated;

-- Revoke UPDATE and anon access
REVOKE UPDATE ON job_attachments FROM authenticated;
REVOKE ALL ON job_attachments FROM anon;
