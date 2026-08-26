/*
# Create job_activity trigger functions (Stage 4C)

## Purpose
Creates SECURITY DEFINER trigger functions that automatically insert
rows into the job_activity table when events occur on existing tables.
These mirror the existing notification triggers but write a shared,
job-scoped history instead of per-user notifications.

## Functions and Triggers

### log_job_created()
- Trigger: AFTER INSERT on jobs
- Logs: 'job_created' with the customer as actor

### log_job_status_changed()
- Trigger: AFTER UPDATE on jobs WHERE status changes
- Logs: 'status_changed' with old/new status in metadata
- Uses a session guard (current_setting('activity.log_quote_accepted'))
  to avoid duplicate entries when accept_quote() changes both
  job_quotes.status and jobs.status in the same transaction.

### log_job_assigned()
- Trigger: AFTER UPDATE on jobs WHERE assigned_tradie_id goes from NULL to a value
- Logs: 'quote_accepted' when a tradie is assigned (the assignment is
  the result of the customer accepting a quote)
- Only fires if the session guard is NOT set (i.e., the assignment
  did not come through accept_quote which sets its own guard). This
  prevents a duplicate 'quote_accepted' entry since log_quote_accepted
  on job_quotes also logs this event.

### log_job_completion_requested()
- Trigger: AFTER UPDATE on jobs WHERE tradie_completed_at goes from NULL to a value
- Logs: 'completion_requested' with the tradie as actor

### log_job_completion_confirmed()
- Trigger: AFTER UPDATE on jobs WHERE customer_confirmed_at goes from NULL to a value
- Logs: 'completion_confirmed' with the customer as actor

### log_quote_submitted()
- Trigger: AFTER INSERT on job_quotes WHERE response_type = 'quote'
- Logs: 'quote_submitted' with quote amount in metadata

### log_interest_expressed()
- Trigger: AFTER INSERT on job_quotes WHERE response_type = 'interest'
- Logs: 'interest_expressed'

### log_quote_accepted()
- Trigger: AFTER UPDATE on job_quotes WHERE status changes to 'accepted'
- Logs: 'quote_accepted' and sets session guard so log_job_assigned
  does not create a duplicate entry

### log_quote_rejected()
- Trigger: AFTER UPDATE on job_quotes WHERE status changes to 'rejected'
- Logs: 'quote_rejected'

### log_quote_withdrawn()
- Trigger: AFTER UPDATE on job_quotes WHERE status changes to 'withdrawn'
- Logs: 'quote_withdrawn'

### log_note_added()
- Trigger: AFTER INSERT on job_notes
- Logs: 'note_added' with truncated note text in detail

### log_photo_uploaded()
- Trigger: AFTER INSERT on job_attachments
- Logs: 'photo_uploaded' with attachment type and caption in metadata

### log_message_sent()
- Trigger: AFTER INSERT on messages
- Logs: 'message_sent' — looks up the job_id via the conversation

### log_review_submitted()
- Trigger: AFTER INSERT on job_reviews
- Logs: 'review_submitted' with rating in metadata

## Duplicate Prevention Strategy
The accept_quote() function updates both job_quotes.status → 'accepted'
AND jobs.assigned_tradie_id (NULL → value) AND jobs.status ('open' → 'assigned')
in a single transaction. This means three triggers would fire:
  1. job_quotes UPDATE → log_quote_accepted (logs 'quote_accepted')
  2. jobs UPDATE (assigned_tradie_id) → log_job_assigned (would log 'quote_accepted')
  3. jobs UPDATE (status) → log_job_status_changed (logs 'status_changed')

To avoid a duplicate 'quote_accepted' entry:
- log_quote_accepted sets a session-local GUC flag before returning.
- log_job_assigned checks this flag and skips if set.
The 'status_changed' entry from trigger 3 is intentional and not a duplicate
— it records the status transition separately.

## Security
- All functions are SECURITY DEFINER with search_path = public.
- Execute revoked from PUBLIC and anon.
- These functions INSERT into job_activity, which the client cannot
  do directly (no INSERT grant on job_activity to authenticated).
- The trigger functions bypass RLS because they run as the table owner
  (SECURITY DEFINER).

## Important Notes
1. All trigger functions check for the relevant condition (e.g., status
   actually changed) before inserting, to avoid spurious entries.
2. The session guard uses set_config('activity.log_quote_accepted', 'true', true)
   which is transaction-local — it resets after the transaction commits.
3. log_message_sent joins conversations to find the job_id, since
   messages reference conversations, not jobs directly.
4. actor_id is derived from auth.uid() where possible. For triggers on
   tables where the actor is the row creator/updater, auth.uid() is
   available because the client initiated the operation.
*/

-- Helper: insert a job_activity row (used by all trigger functions)
CREATE OR REPLACE FUNCTION log_job_activity(
  p_job_id uuid,
  p_activity_type text,
  p_actor_id uuid DEFAULT NULL,
  p_detail text DEFAULT NULL,
  p_metadata jsonb DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO job_activity (job_id, activity_type, actor_id, detail, metadata)
  VALUES (p_job_id, p_activity_type, p_actor_id, p_detail, p_metadata);
END;
$$;

REVOKE EXECUTE ON FUNCTION log_job_activity FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION log_job_activity FROM anon;

-- 1. log_job_created: trigger on jobs INSERT
CREATE OR REPLACE FUNCTION log_job_created()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  PERFORM log_job_activity(
    NEW.id,
    'job_created',
    NEW.customer_id,
    'Job posted',
    jsonb_build_object('title', NEW.title, 'trade_category', NEW.trade_category)
  );
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION log_job_created FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION log_job_created FROM anon;

-- 2. log_job_status_changed: trigger on jobs UPDATE WHERE status changes
CREATE OR REPLACE FUNCTION log_job_status_changed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  PERFORM log_job_activity(
    NEW.id,
    'status_changed',
    auth.uid(),
    'Status changed from ' || OLD.status || ' to ' || NEW.status,
    jsonb_build_object('from_status', OLD.status, 'to_status', NEW.status)
  );

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION log_job_status_changed FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION log_job_status_changed FROM anon;

-- 3. log_job_assigned: trigger on jobs UPDATE WHERE assigned_tradie_id NULL -> value
-- Skips if log_quote_accepted already set the session guard (avoiding duplicate)
CREATE OR REPLACE FUNCTION log_job_assigned()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_guard text;
BEGIN
  IF OLD.assigned_tradie_id IS NULL AND NEW.assigned_tradie_id IS NOT NULL THEN
    v_guard := current_setting('activity.log_quote_accepted', true);

    IF v_guard IS NULL OR v_guard != 'true' THEN
      PERFORM log_job_activity(
        NEW.id,
        'quote_accepted',
        auth.uid(),
        'Tradie assigned to job',
        jsonb_build_object('tradie_id', NEW.assigned_tradie_id)
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION log_job_assigned FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION log_job_assigned FROM anon;

-- 4. log_job_completion_requested: trigger on jobs UPDATE WHERE tradie_completed_at NULL -> value
CREATE OR REPLACE FUNCTION log_job_completion_requested()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF OLD.tradie_completed_at IS NULL AND NEW.tradie_completed_at IS NOT NULL THEN
    PERFORM log_job_activity(
      NEW.id,
      'completion_requested',
      auth.uid(),
      'Tradie marked job as complete',
      NULL
    );
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION log_job_completion_requested FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION log_job_completion_requested FROM anon;

-- 5. log_job_completion_confirmed: trigger on jobs UPDATE WHERE customer_confirmed_at NULL -> value
CREATE OR REPLACE FUNCTION log_job_completion_confirmed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF OLD.customer_confirmed_at IS NULL AND NEW.customer_confirmed_at IS NOT NULL THEN
    PERFORM log_job_activity(
      NEW.id,
      'completion_confirmed',
      auth.uid(),
      'Customer confirmed job completion',
      NULL
    );
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION log_job_completion_confirmed FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION log_job_completion_confirmed FROM anon;

-- 6. log_quote_submitted: trigger on job_quotes INSERT WHERE response_type = 'quote'
CREATE OR REPLACE FUNCTION log_quote_submitted()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.response_type != 'quote' THEN
    RETURN NEW;
  END IF;

  PERFORM log_job_activity(
    NEW.job_id,
    'quote_submitted',
    NEW.tradie_id,
    'Quote submitted',
    jsonb_build_object('amount', NEW.amount, 'quote_id', NEW.id)
  );

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION log_quote_submitted FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION log_quote_submitted FROM anon;

-- 7. log_interest_expressed: trigger on job_quotes INSERT WHERE response_type = 'interest'
CREATE OR REPLACE FUNCTION log_interest_expressed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.response_type != 'interest' THEN
    RETURN NEW;
  END IF;

  PERFORM log_job_activity(
    NEW.job_id,
    'interest_expressed',
    NEW.tradie_id,
    'Interest expressed',
    jsonb_build_object('quote_id', NEW.id)
  );

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION log_interest_expressed FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION log_interest_expressed FROM anon;

-- 8. log_quote_accepted: trigger on job_quotes UPDATE WHERE status -> 'accepted'
-- Sets session guard so log_job_assigned skips (avoiding duplicate 'quote_accepted')
CREATE OR REPLACE FUNCTION log_quote_accepted()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF OLD.status = 'accepted' OR NEW.status != 'accepted' THEN
    RETURN NEW;
  END IF;

  -- Set session guard so the jobs.assigned_tradie_id trigger does not
  -- create a duplicate 'quote_accepted' activity entry
  PERFORM set_config('activity.log_quote_accepted', 'true', true);

  PERFORM log_job_activity(
    NEW.job_id,
    'quote_accepted',
    auth.uid(),
    'Quote accepted and tradie assigned',
    jsonb_build_object('quote_id', NEW.id, 'tradie_id', NEW.tradie_id, 'amount', NEW.amount)
  );

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION log_quote_accepted FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION log_quote_accepted FROM anon;

-- 9. log_quote_rejected: trigger on job_quotes UPDATE WHERE status -> 'rejected'
CREATE OR REPLACE FUNCTION log_quote_rejected()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF OLD.status = 'rejected' OR NEW.status != 'rejected' THEN
    RETURN NEW;
  END IF;

  PERFORM log_job_activity(
    NEW.job_id,
    'quote_rejected',
    auth.uid(),
    'Quote rejected',
    jsonb_build_object('quote_id', NEW.id, 'tradie_id', NEW.tradie_id)
  );

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION log_quote_rejected FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION log_quote_rejected FROM anon;

-- 10. log_quote_withdrawn: trigger on job_quotes UPDATE WHERE status -> 'withdrawn'
CREATE OR REPLACE FUNCTION log_quote_withdrawn()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF OLD.status = 'withdrawn' OR NEW.status != 'withdrawn' THEN
    RETURN NEW;
  END IF;

  PERFORM log_job_activity(
    NEW.job_id,
    'quote_withdrawn',
    auth.uid(),
    'Quote withdrawn',
    jsonb_build_object('quote_id', NEW.id, 'tradie_id', NEW.tradie_id)
  );

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION log_quote_withdrawn FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION log_quote_withdrawn FROM anon;

-- 11. log_note_added: trigger on job_notes INSERT
CREATE OR REPLACE FUNCTION log_note_added()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_detail text;
BEGIN
  v_detail := left(NEW.note, 120);

  PERFORM log_job_activity(
    NEW.job_id,
    'note_added',
    NEW.author_id,
    v_detail,
    jsonb_build_object('note_id', NEW.id)
  );

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION log_note_added FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION log_note_added FROM anon;

-- 12. log_photo_uploaded: trigger on job_attachments INSERT
CREATE OR REPLACE FUNCTION log_photo_uploaded()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  PERFORM log_job_activity(
    NEW.job_id,
    'photo_uploaded',
    NEW.uploaded_by,
    'Photo uploaded: ' || NEW.attachment_type,
    jsonb_build_object(
      'attachment_id', NEW.id,
      'attachment_type', NEW.attachment_type,
      'caption', NEW.caption,
      'file_name', NEW.file_name
    )
  );

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION log_photo_uploaded FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION log_photo_uploaded FROM anon;

-- 13. log_message_sent: trigger on messages INSERT
-- Looks up the job_id via the conversation
CREATE OR REPLACE FUNCTION log_message_sent()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_job_id uuid;
BEGIN
  SELECT job_id INTO v_job_id FROM conversations WHERE id = NEW.conversation_id;

  IF NOT FOUND OR v_job_id IS NULL THEN
    RETURN NEW;
  END IF;

  PERFORM log_job_activity(
    v_job_id,
    'message_sent',
    NEW.sender_id,
    left(NEW.body, 120),
    jsonb_build_object('conversation_id', NEW.conversation_id, 'message_id', NEW.id)
  );

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION log_message_sent FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION log_message_sent FROM anon;

-- 14. log_review_submitted: trigger on job_reviews INSERT
CREATE OR REPLACE FUNCTION log_review_submitted()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  PERFORM log_job_activity(
    NEW.job_id,
    'review_submitted',
    NEW.reviewer_id,
    'Review submitted: ' || NEW.rating || ' stars',
    jsonb_build_object('review_id', NEW.id, 'rating', NEW.rating)
  );

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION log_review_submitted FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION log_review_submitted FROM anon;

-- ============================================================
-- Attach all triggers
-- ============================================================

-- jobs: AFTER INSERT (job_created)
DROP TRIGGER IF EXISTS jobs_activity_created ON jobs;
CREATE TRIGGER jobs_activity_created
  AFTER INSERT ON jobs
  FOR EACH ROW
  EXECUTE FUNCTION log_job_created();

-- jobs: AFTER UPDATE (status_changed) — separate from notification trigger
DROP TRIGGER IF EXISTS jobs_activity_status_changed ON jobs;
CREATE TRIGGER jobs_activity_status_changed
  AFTER UPDATE ON jobs
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION log_job_status_changed();

-- jobs: AFTER UPDATE (assigned) — separate from notification trigger
DROP TRIGGER IF EXISTS jobs_activity_assigned ON jobs;
CREATE TRIGGER jobs_activity_assigned
  AFTER UPDATE ON jobs
  FOR EACH ROW
  WHEN (OLD.assigned_tradie_id IS NULL AND NEW.assigned_tradie_id IS NOT NULL)
  EXECUTE FUNCTION log_job_assigned();

-- jobs: AFTER UPDATE (completion_requested)
DROP TRIGGER IF EXISTS jobs_activity_completion_requested ON jobs;
CREATE TRIGGER jobs_activity_completion_requested
  AFTER UPDATE ON jobs
  FOR EACH ROW
  WHEN (OLD.tradie_completed_at IS NULL AND NEW.tradie_completed_at IS NOT NULL)
  EXECUTE FUNCTION log_job_completion_requested();

-- jobs: AFTER UPDATE (completion_confirmed)
DROP TRIGGER IF EXISTS jobs_activity_completion_confirmed ON jobs;
CREATE TRIGGER jobs_activity_completion_confirmed
  AFTER UPDATE ON jobs
  FOR EACH ROW
  WHEN (OLD.customer_confirmed_at IS NULL AND NEW.customer_confirmed_at IS NOT NULL)
  EXECUTE FUNCTION log_job_completion_confirmed();

-- job_quotes: AFTER INSERT (quote_submitted / interest_expressed)
-- Use a single trigger that dispatches based on response_type
DROP TRIGGER IF EXISTS job_quotes_activity_insert ON job_quotes;
CREATE TRIGGER job_quotes_activity_insert
  AFTER INSERT ON job_quotes
  FOR EACH ROW
  EXECUTE FUNCTION log_quote_submitted();

DROP TRIGGER IF EXISTS job_quotes_activity_interest ON job_quotes;
CREATE TRIGGER job_quotes_activity_interest
  AFTER INSERT ON job_quotes
  FOR EACH ROW
  EXECUTE FUNCTION log_interest_expressed();

-- job_quotes: AFTER UPDATE (accepted)
DROP TRIGGER IF EXISTS job_quotes_activity_accepted ON job_quotes;
CREATE TRIGGER job_quotes_activity_accepted
  AFTER UPDATE ON job_quotes
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION log_quote_accepted();

-- job_quotes: AFTER UPDATE (rejected)
DROP TRIGGER IF EXISTS job_quotes_activity_rejected ON job_quotes;
CREATE TRIGGER job_quotes_activity_rejected
  AFTER UPDATE ON job_quotes
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION log_quote_rejected();

-- job_quotes: AFTER UPDATE (withdrawn)
DROP TRIGGER IF EXISTS job_quotes_activity_withdrawn ON job_quotes;
CREATE TRIGGER job_quotes_activity_withdrawn
  AFTER UPDATE ON job_quotes
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION log_quote_withdrawn();

-- job_notes: AFTER INSERT (note_added)
DROP TRIGGER IF EXISTS job_notes_activity_added ON job_notes;
CREATE TRIGGER job_notes_activity_added
  AFTER INSERT ON job_notes
  FOR EACH ROW
  EXECUTE FUNCTION log_note_added();

-- job_attachments: AFTER INSERT (photo_uploaded)
DROP TRIGGER IF EXISTS job_attachments_activity_uploaded ON job_attachments;
CREATE TRIGGER job_attachments_activity_uploaded
  AFTER INSERT ON job_attachments
  FOR EACH ROW
  EXECUTE FUNCTION log_photo_uploaded();

-- messages: AFTER INSERT (message_sent)
DROP TRIGGER IF EXISTS messages_activity_sent ON messages;
CREATE TRIGGER messages_activity_sent
  AFTER INSERT ON messages
  FOR EACH ROW
  EXECUTE FUNCTION log_message_sent();

-- job_reviews: AFTER INSERT (review_submitted)
DROP TRIGGER IF EXISTS job_reviews_activity_submitted ON job_reviews;
CREATE TRIGGER job_reviews_activity_submitted
  AFTER INSERT ON job_reviews
  FOR EACH ROW
  EXECUTE FUNCTION log_review_submitted();
