/*
# Add new_job_attachment notification type and trigger

## Purpose
Adds a 'new_job_attachment' notification type and a trigger that
notifies the other job participant when a new attachment is uploaded.
If the uploader is the customer, the assigned tradie is notified.
If the uploader is the tradie, the customer is notified.

## Changes
1. Add 'new_job_attachment' to the notifications CHECK constraint.
2. Create notify_new_job_attachment() trigger function.
3. Attach trigger to job_attachments AFTER INSERT.

## Security
- Trigger function is SECURITY DEFINER with search_path = public.
- Execute revoked from PUBLIC and anon.
- Uses the existing create_notification() helper.
*/

-- Add 'new_job_attachment' to the notifications CHECK constraint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'notifications_type_check'
      AND conrelid = 'notifications'::regclass
      AND pg_get_constraintdef(oid) LIKE '%new_job_attachment%'
  ) THEN
    ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
    ALTER TABLE notifications ADD CONSTRAINT notifications_type_check CHECK (type IN (
      'new_quote', 'new_interest', 'quote_accepted', 'quote_rejected',
      'job_assigned', 'new_message', 'job_status_changed', 'new_job_note',
      'job_completion_confirmed', 'new_review', 'new_job_attachment'
    ));
  END IF;
END $$;

-- Trigger function: notify_new_job_attachment
CREATE OR REPLACE FUNCTION notify_new_job_attachment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_customer_id uuid;
  v_assigned_tradie_id uuid;
  v_job_title text;
  v_recipient_id uuid;
BEGIN
  SELECT customer_id, assigned_tradie_id, title
  INTO v_customer_id, v_assigned_tradie_id, v_job_title
  FROM jobs WHERE id = NEW.job_id;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  -- If the uploader is the customer, notify the assigned tradie
  IF NEW.uploaded_by = v_customer_id AND v_assigned_tradie_id IS NOT NULL THEN
    v_recipient_id := v_assigned_tradie_id;
  ELSIF NEW.uploaded_by = v_assigned_tradie_id THEN
    -- If the uploader is the assigned tradie, notify the customer
    v_recipient_id := v_customer_id;
  ELSE
    -- Uploader is neither (e.g. admin) — skip
    RETURN NEW;
  END IF;

  PERFORM create_notification(
    v_recipient_id,
    'new_job_attachment',
    'New photo added',
    'A new photo was added to the job "' || v_job_title || '".',
    NEW.job_id
  );

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION notify_new_job_attachment FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION notify_new_job_attachment FROM anon;

-- Attach trigger
DROP TRIGGER IF EXISTS job_attachments_new_attachment_notify ON job_attachments;
CREATE TRIGGER job_attachments_new_attachment_notify
  AFTER INSERT ON job_attachments
  FOR EACH ROW
  EXECUTE FUNCTION notify_new_job_attachment();
