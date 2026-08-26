/*
# Create notification trigger functions

## Purpose
Eight SECURITY DEFINER trigger functions that automatically create
notifications when platform events occur. These functions run inside
the database as triggers on their respective tables — the client never
calls them directly and has no INSERT privilege on the notifications
table.

## Functions

### notify_new_quote()
- Trigger: AFTER INSERT on job_quotes WHERE response_type = 'quote'
- Creates a notification for the job owner: "New quote received"
- Links to the job

### notify_new_interest()
- Trigger: AFTER INSERT on job_quotes WHERE response_type = 'interest'
- Creates a notification for the job owner: "New expression of interest"
- Links to the job

### notify_quote_accepted()
- Trigger: AFTER UPDATE on job_quotes WHERE status changes to 'accepted'
- Creates a notification for the tradie: "Your quote was accepted"
- Links to the job

### notify_quote_rejected()
- Trigger: AFTER UPDATE on job_quotes WHERE status changes to 'rejected'
- Creates a notification for the tradie: "Your quote was rejected"
- Links to the job

### notify_job_assigned()
- Trigger: AFTER UPDATE on jobs WHERE assigned_tradie_id changes from null to a value
- Creates a notification for the tradie: "You have been assigned to a job"
- Links to the job

### notify_job_status_changed()
- Trigger: AFTER UPDATE on jobs WHERE status changes
- Creates a notification for the customer: "Job status updated"
- Links to the job

### notify_new_message()
- Trigger: AFTER INSERT on messages
- Creates a notification for the conversation's other participant
- Links to the conversation and job

### notify_new_job_note()
- Trigger: AFTER INSERT on job_notes
- Creates a notification for the other job participant (customer if
  author is tradie, assigned tradie if author is customer)
- Links to the job

## Security
- All functions are SECURITY DEFINER with search_path = public.
- Execute revoked from PUBLIC and anon; granted to authenticated.
- These functions INSERT into the notifications table, which the client
  cannot do directly (no INSERT grant on notifications to authenticated).
- The trigger functions bypass RLS because they run as the table owner
  (SECURITY DEFINER), allowing them to insert notifications for any user.

## Important Notes
1. All trigger functions check for the relevant condition (e.g., status
   actually changed) before inserting a notification, to avoid spurious
   notifications from no-op updates.
2. The notify_job_assigned function checks that assigned_tradie_id
   changed from null (OLD.assigned_tradie_id IS NULL) to a value
   (NEW.assigned_tradie_id IS NOT NULL), so re-assignment doesn't
   trigger a duplicate notification.
3. The notify_new_message function determines the recipient by checking
   which conversation participant is NOT the sender.
4. The notify_new_job_note function determines the recipient based on
   the author's role: if the author is the customer, notify the assigned
   tradie; if the author is the tradie, notify the customer.
*/

-- Helper: insert a notification (used by all trigger functions)
CREATE OR REPLACE FUNCTION create_notification(
  p_user_id uuid,
  p_type text,
  p_title text,
  p_body text DEFAULT NULL,
  p_job_id uuid DEFAULT NULL,
  p_conversation_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO notifications (user_id, type, title, body, job_id, conversation_id)
  VALUES (p_user_id, p_type, p_title, p_body, p_job_id, p_conversation_id);
END;
$$;

REVOKE EXECUTE ON FUNCTION create_notification FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION create_notification FROM anon;
GRANT EXECUTE ON FUNCTION create_notification TO authenticated;

-- 1. notify_new_quote: trigger on job_quotes INSERT where response_type = 'quote'
CREATE OR REPLACE FUNCTION notify_new_quote()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_customer_id uuid;
  v_job_title text;
BEGIN
  IF NEW.response_type != 'quote' THEN
    RETURN NEW;
  END IF;

  SELECT customer_id, title INTO v_customer_id, v_job_title
  FROM jobs WHERE id = NEW.job_id;

  IF FOUND THEN
    PERFORM create_notification(
      v_customer_id,
      'new_quote',
      'New quote received',
      'A tradie has submitted a quote on your job "' || v_job_title || '".',
      NEW.job_id
    );
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION notify_new_quote FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION notify_new_quote FROM anon;

-- 2. notify_new_interest: trigger on job_quotes INSERT where response_type = 'interest'
CREATE OR REPLACE FUNCTION notify_new_interest()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_customer_id uuid;
  v_job_title text;
BEGIN
  IF NEW.response_type != 'interest' THEN
    RETURN NEW;
  END IF;

  SELECT customer_id, title INTO v_customer_id, v_job_title
  FROM jobs WHERE id = NEW.job_id;

  IF FOUND THEN
    PERFORM create_notification(
      v_customer_id,
      'new_interest',
      'New expression of interest',
      'A tradie is interested in your job "' || v_job_title || '".',
      NEW.job_id
    );
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION notify_new_interest FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION notify_new_interest FROM anon;

-- 3. notify_quote_accepted: trigger on job_quotes UPDATE where status -> 'accepted'
CREATE OR REPLACE FUNCTION notify_quote_accepted()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_job_title text;
BEGIN
  IF OLD.status = 'accepted' OR NEW.status != 'accepted' THEN
    RETURN NEW;
  END IF;

  SELECT title INTO v_job_title FROM jobs WHERE id = NEW.job_id;

  PERFORM create_notification(
    NEW.tradie_id,
    'quote_accepted',
    'Your quote was accepted',
    'Your quote on the job "' || COALESCE(v_job_title, 'Unknown') || '" was accepted by the customer.',
    NEW.job_id
  );

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION notify_quote_accepted FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION notify_quote_accepted FROM anon;

-- 4. notify_quote_rejected: trigger on job_quotes UPDATE where status -> 'rejected'
CREATE OR REPLACE FUNCTION notify_quote_rejected()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_job_title text;
BEGIN
  IF OLD.status = 'rejected' OR NEW.status != 'rejected' THEN
    RETURN NEW;
  END IF;

  SELECT title INTO v_job_title FROM jobs WHERE id = NEW.job_id;

  PERFORM create_notification(
    NEW.tradie_id,
    'quote_rejected',
    'Your quote was rejected',
    'Your quote on the job "' || COALESCE(v_job_title, 'Unknown') || '" was not accepted by the customer.',
    NEW.job_id
  );

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION notify_quote_rejected FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION notify_quote_rejected FROM anon;

-- 5. notify_job_assigned: trigger on jobs UPDATE where assigned_tradie_id goes from null to a value
CREATE OR REPLACE FUNCTION notify_job_assigned()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF OLD.assigned_tradie_id IS NULL AND NEW.assigned_tradie_id IS NOT NULL THEN
    PERFORM create_notification(
      NEW.assigned_tradie_id,
      'job_assigned',
      'You have been assigned to a job',
      'You have been assigned to the job "' || NEW.title || '".',
      NEW.id
    );
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION notify_job_assigned FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION notify_job_assigned FROM anon;

-- 6. notify_job_status_changed: trigger on jobs UPDATE where status changes
CREATE OR REPLACE FUNCTION notify_job_status_changed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  -- Notify the customer about the status change
  PERFORM create_notification(
    NEW.customer_id,
    'job_status_changed',
    'Job status updated',
    'Your job "' || NEW.title || '" is now ' || NEW.status || '.',
    NEW.id
  );

  -- If there's an assigned tradie, notify them too (but not if they just got assigned —
  -- the job_assigned notification covers that)
  IF NEW.assigned_tradie_id IS NOT NULL AND OLD.status != 'open' THEN
    PERFORM create_notification(
      NEW.assigned_tradie_id,
      'job_status_changed',
      'Job status updated',
      'The job "' || NEW.title || '" is now ' || NEW.status || '.',
      NEW.id
    );
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION notify_job_status_changed FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION notify_job_status_changed FROM anon;

-- 7. notify_new_message: trigger on messages INSERT
CREATE OR REPLACE FUNCTION notify_new_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_customer_id uuid;
  v_tradie_id uuid;
  v_recipient_id uuid;
  v_job_title text;
BEGIN
  SELECT customer_id, tradie_id INTO v_customer_id, v_tradie_id
  FROM conversations WHERE id = NEW.conversation_id;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  -- The recipient is the other participant (not the sender)
  v_recipient_id := CASE WHEN NEW.sender_id = v_customer_id THEN v_tradie_id ELSE v_customer_id END;

  SELECT j.title INTO v_job_title
  FROM conversations c
  JOIN jobs j ON j.id = c.job_id
  WHERE c.id = NEW.conversation_id;

  PERFORM create_notification(
    v_recipient_id,
    'new_message',
    'New message',
    'You have a new message regarding the job "' || COALESCE(v_job_title, 'Unknown') || '".',
    NULL,
    NEW.conversation_id
  );

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION notify_new_message FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION notify_new_message FROM anon;

-- 8. notify_new_job_note: trigger on job_notes INSERT
CREATE OR REPLACE FUNCTION notify_new_job_note()
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

  -- If the author is the customer, notify the assigned tradie
  IF NEW.author_id = v_customer_id AND v_assigned_tradie_id IS NOT NULL THEN
    v_recipient_id := v_assigned_tradie_id;
  ELSIF NEW.author_id = v_assigned_tradie_id THEN
    -- If the author is the assigned tradie, notify the customer
    v_recipient_id := v_customer_id;
  ELSE
    -- Author is neither customer nor assigned tradie (e.g. admin) — skip
    RETURN NEW;
  END IF;

  PERFORM create_notification(
    v_recipient_id,
    'new_job_note',
    'New job note',
    'A new note was added to the job "' || v_job_title || '".',
    NEW.job_id
  );

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION notify_new_job_note FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION notify_new_job_note FROM anon;

-- Attach triggers

-- job_quotes: new quote or interest (AFTER INSERT)
DROP TRIGGER IF EXISTS job_quotes_new_quote_notify ON job_quotes;
CREATE TRIGGER job_quotes_new_quote_notify
  AFTER INSERT ON job_quotes
  FOR EACH ROW
  EXECUTE FUNCTION notify_new_quote();

DROP TRIGGER IF EXISTS job_quotes_new_interest_notify ON job_quotes;
CREATE TRIGGER job_quotes_new_interest_notify
  AFTER INSERT ON job_quotes
  FOR EACH ROW
  EXECUTE FUNCTION notify_new_interest();

-- job_quotes: accepted or rejected (AFTER UPDATE)
DROP TRIGGER IF EXISTS job_quotes_accepted_notify ON job_quotes;
CREATE TRIGGER job_quotes_accepted_notify
  AFTER UPDATE ON job_quotes
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION notify_quote_accepted();

DROP TRIGGER IF EXISTS job_quotes_rejected_notify ON job_quotes;
CREATE TRIGGER job_quotes_rejected_notify
  AFTER UPDATE ON job_quotes
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION notify_quote_rejected();

-- jobs: assigned (AFTER UPDATE)
DROP TRIGGER IF EXISTS jobs_assigned_notify ON jobs;
CREATE TRIGGER jobs_assigned_notify
  AFTER UPDATE ON jobs
  FOR EACH ROW
  WHEN (OLD.assigned_tradie_id IS NULL AND NEW.assigned_tradie_id IS NOT NULL)
  EXECUTE FUNCTION notify_job_assigned();

-- jobs: status changed (AFTER UPDATE)
DROP TRIGGER IF EXISTS jobs_status_changed_notify ON jobs;
CREATE TRIGGER jobs_status_changed_notify
  AFTER UPDATE ON jobs
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION notify_job_status_changed();

-- messages: new message (AFTER INSERT)
DROP TRIGGER IF EXISTS messages_new_message_notify ON messages;
CREATE TRIGGER messages_new_message_notify
  AFTER INSERT ON messages
  FOR EACH ROW
  EXECUTE FUNCTION notify_new_message();

-- job_notes: new note (AFTER INSERT)
DROP TRIGGER IF EXISTS job_notes_new_note_notify ON job_notes;
CREATE TRIGGER job_notes_new_note_notify
  AFTER INSERT ON job_notes
  FOR EACH ROW
  EXECUTE FUNCTION notify_new_job_note();
