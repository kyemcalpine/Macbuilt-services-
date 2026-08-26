/*
# Add and delete job attachment functions

## Purpose
Two SECURITY DEFINER functions that enforce business rules for
uploading and deleting job attachments. The client calls these
instead of inserting/deleting directly, so all validation happens
server-side.

## Functions

### add_job_attachment(p_job_id, p_attachment_type, p_storage_path, p_file_name, p_mime_type, p_file_size, p_caption)
- Verifies the caller is the job owner or assigned tradie.
- Validates attachment_type rules based on who the caller is and the
  job's current status:
  - job_photo: customer only, job status must be 'open'
  - progress_photo: assigned tradie only, job status must be 'in_progress'
  - completion_photo: assigned tradie only, job status must be 'completed'
    and tradie_completed_at IS NOT NULL
  - additional_photo: customer or assigned tradie, job status must be
    'assigned', 'in_progress', or 'completed' (with tradie_completed_at set)
- Validates MIME type is in the allowed list.
- Validates file_size <= 10 MB.
- Inserts the row and returns the new attachment id.

### delete_job_attachment(p_attachment_id)
- Verifies the caller is the uploader (uploaded_by = auth.uid()).
- Verifies the job is not 'cancelled' (completed jobs allow deletion
  for cleanup but the RLS policy already restricts to the uploader).
- Deletes the row. The client is responsible for also removing the
  storage object.

## Security
- Both functions are SECURITY DEFINER with search_path = public.
- Execute revoked from PUBLIC and anon; granted to authenticated.
- No changes to RLS policies or column-level privileges.
*/

-- Allowed MIME types constant (checked in function)
-- image/jpeg, image/png, image/webp, image/gif

CREATE OR REPLACE FUNCTION add_job_attachment(
  p_job_id uuid,
  p_attachment_type text,
  p_storage_path text,
  p_file_name text,
  p_mime_type text,
  p_file_size bigint,
  p_caption text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_job jobs%ROWTYPE;
  v_is_customer boolean := false;
  v_is_tradie boolean := false;
  v_new_id uuid;
BEGIN
  SELECT * INTO v_job FROM jobs WHERE id = p_job_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Job not found.';
  END IF;

  v_is_customer := (v_job.customer_id = auth.uid());
  v_is_tradie := (v_job.assigned_tradie_id = auth.uid());

  IF NOT v_is_customer AND NOT v_is_tradie THEN
    RAISE EXCEPTION 'You are not authorized to add attachments to this job.';
  END IF;

  -- Validate MIME type
  IF p_mime_type NOT IN ('image/jpeg', 'image/png', 'image/webp', 'image/gif') THEN
    RAISE EXCEPTION 'Unsupported file type. Allowed: JPEG, PNG, WebP, GIF.';
  END IF;

  -- Validate file size (10 MB = 10485760 bytes)
  IF p_file_size > 10485760 THEN
    RAISE EXCEPTION 'File too large. Maximum size is 10 MB.';
  END IF;

  -- Validate attachment_type rules
  IF p_attachment_type = 'job_photo' THEN
    IF NOT v_is_customer THEN
      RAISE EXCEPTION 'Only the customer can upload job photos.';
    END IF;
    IF v_job.status != 'open' THEN
      RAISE EXCEPTION 'Job photos can only be uploaded while the job is open.';
    END IF;

  ELSIF p_attachment_type = 'progress_photo' THEN
    IF NOT v_is_tradie THEN
      RAISE EXCEPTION 'Only the assigned tradie can upload progress photos.';
    END IF;
    IF v_job.status != 'in_progress' THEN
      RAISE EXCEPTION 'Progress photos can only be uploaded while the job is in progress.';
    END IF;

  ELSIF p_attachment_type = 'completion_photo' THEN
    IF NOT v_is_tradie THEN
      RAISE EXCEPTION 'Only the assigned tradie can upload completion photos.';
    END IF;
    IF v_job.status != 'completed' OR v_job.tradie_completed_at IS NULL THEN
      RAISE EXCEPTION 'Completion photos can only be uploaded after marking the job complete.';
    END IF;

  ELSIF p_attachment_type = 'additional_photo' THEN
    IF v_job.status NOT IN ('assigned', 'in_progress', 'completed') THEN
      RAISE EXCEPTION 'Additional photos can only be uploaded while the job is active.';
    END IF;
    IF v_job.status = 'completed' AND v_job.tradie_completed_at IS NULL THEN
      RAISE EXCEPTION 'Additional photos require the tradie to have marked the job complete.';
    END IF;

  ELSE
    RAISE EXCEPTION 'Invalid attachment type.';
  END IF;

  -- Insert the attachment
  INSERT INTO job_attachments (
    job_id, uploaded_by, attachment_type, storage_path,
    file_name, mime_type, file_size, caption
  ) VALUES (
    p_job_id, auth.uid(), p_attachment_type, p_storage_path,
    p_file_name, p_mime_type, p_file_size, p_caption
  )
  RETURNING id INTO v_new_id;

  RETURN v_new_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION add_job_attachment FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION add_job_attachment FROM anon;
GRANT EXECUTE ON FUNCTION add_job_attachment TO authenticated;


CREATE OR REPLACE FUNCTION delete_job_attachment(p_attachment_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_attachment job_attachments%ROWTYPE;
  v_job_status text;
BEGIN
  SELECT * INTO v_attachment FROM job_attachments WHERE id = p_attachment_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Attachment not found.';
  END IF;

  IF v_attachment.uploaded_by != auth.uid() THEN
    RAISE EXCEPTION 'You can only delete your own attachments.';
  END IF;

  -- Check job status
  SELECT status INTO v_job_status FROM jobs WHERE id = v_attachment.job_id;

  IF v_job_status = 'cancelled' THEN
    RAISE EXCEPTION 'Cannot delete attachments from a cancelled job.';
  END IF;

  DELETE FROM job_attachments WHERE id = p_attachment_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION delete_job_attachment FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION delete_job_attachment FROM anon;
GRANT EXECUTE ON FUNCTION delete_job_attachment TO authenticated;
