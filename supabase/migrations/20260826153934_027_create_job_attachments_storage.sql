/*
# Create private job-attachments storage bucket and policies

## Purpose
Creates a private Supabase Storage bucket for job photos and file
attachments. Files are NOT publicly accessible — access is controlled
by Storage RLS policies that verify the user is a job participant
(owner, assigned tradie, or admin).

## Bucket
- Name: job-attachments
- Public: false (private)
- File size limit: 10 MB (10485760 bytes)
- Allowed MIME types: image/jpeg, image/png, image/webp, image/gif

## Path Strategy
Files are stored at: jobs/{job_id}/{attachment_id}{extension}
- job_id is the uuid of the job
- attachment_id is the uuid of the job_attachments row
- extension is the file extension (e.g. .jpg, .png)

This ensures files are scoped to a specific job and the storage
policies can verify the job_id in the path prefix matches a job
the user has access to.

## Storage RLS Policies (on storage.objects)
- INSERT: user must be a job participant (owner or assigned tradie)
  and the path must start with the job's folder prefix.
- SELECT: user must be a job participant (owner, assigned tradie,
  or admin) and the path must match a job they have access to.
- UPDATE: revoked (no edits to uploaded files).
- DELETE: only the uploader (owner of the storage object) or admin.

## Security
- The bucket is private — no public reads.
- All policies verify job participation via subqueries to the jobs table.
- anon role has no access to this bucket's objects.
*/

-- Create the private bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'job-attachments',
  'job-attachments',
  false,
  10485760,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO NOTHING;

-- Helper function: extract job_id from the storage path
-- Path format: jobs/{job_id}/{filename}
CREATE OR REPLACE FUNCTION get_job_id_from_path(path text)
RETURNS uuid
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT (regexp_match(path, '^jobs/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})'))[1]::uuid
$$;

-- INSERT policy: user must be a job participant and path must be under their job's folder
DROP POLICY IF EXISTS "job_attachments_storage_insert" ON storage.objects;
CREATE POLICY "job_attachments_storage_insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'job-attachments'
    AND EXISTS (
      SELECT 1 FROM jobs
      WHERE jobs.id = get_job_id_from_path(name)
      AND (
        jobs.customer_id = auth.uid()
        OR jobs.assigned_tradie_id = auth.uid()
      )
    )
  );

-- SELECT policy: user must be a job participant (owner, tradie, or admin)
DROP POLICY IF EXISTS "job_attachments_storage_select" ON storage.objects;
CREATE POLICY "job_attachments_storage_select"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'job-attachments'
    AND EXISTS (
      SELECT 1 FROM jobs
      WHERE jobs.id = get_job_id_from_path(name)
      AND (
        jobs.customer_id = auth.uid()
        OR jobs.assigned_tradie_id = auth.uid()
        OR is_admin()
      )
    )
  );

-- DELETE policy: only the uploader (owner of the storage object) or admin
DROP POLICY IF EXISTS "job_attachments_storage_delete" ON storage.objects;
CREATE POLICY "job_attachments_storage_delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'job-attachments'
    AND (
      owner = auth.uid()
      OR is_admin()
    )
  );
