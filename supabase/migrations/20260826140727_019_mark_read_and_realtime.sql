/*
# Create mark-read functions and enable realtime

## Purpose
1. SECURITY DEFINER functions for marking notifications and messages as read.
2. Add conversations, messages, and notifications to the Supabase realtime
   publication so the client can subscribe to live updates.

## Functions

### mark_notification_read(p_notification_id uuid)
- Verifies the caller owns the notification (user_id = auth.uid()).
- Sets read_at = now() on that single notification.
- Returns void.

### mark_all_notifications_read()
- Marks all unread notifications for the current user as read.
- Returns void.

### mark_messages_read(p_conversation_id uuid)
- Verifies the caller is a participant in the conversation.
- Sets read_at = now() on all messages in the conversation where
  sender_id != auth.uid() AND read_at IS NULL (i.e., incoming unread
  messages from the other party).
- Returns void.

## Realtime
- Adds `conversations`, `messages`, and `notifications` to the
  `supabase_realtime` publication so the client can use Supabase
  realtime subscriptions to receive live updates without polling.

## Security
- All functions are SECURITY DEFINER with search_path = public.
- Execute revoked from PUBLIC and anon; granted to authenticated.
- mark_messages_read updates the messages.read_at column, which the
  client cannot update directly (no UPDATE grant on messages). The
  function verifies the caller is a conversation participant before
  updating.

## Important Notes
1. mark_messages_read only marks messages from the OTHER party as read
   — it never touches the caller's own sent messages.
2. The realtime publication allows the client to subscribe to INSERT
   events on messages and notifications, and UPDATE events on
   conversations (for last-message and unread-count updates).
*/

-- mark_notification_read: mark a single notification as read
CREATE OR REPLACE FUNCTION mark_notification_read(p_notification_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  SELECT user_id INTO v_user_id FROM notifications WHERE id = p_notification_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Notification not found';
  END IF;

  IF v_user_id <> auth.uid() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  UPDATE notifications SET read_at = now() WHERE id = p_notification_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION mark_notification_read FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION mark_notification_read FROM anon;
GRANT EXECUTE ON FUNCTION mark_notification_read TO authenticated;

-- mark_all_notifications_read: mark all unread notifications as read for the current user
CREATE OR REPLACE FUNCTION mark_all_notifications_read()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  UPDATE notifications SET read_at = now()
  WHERE user_id = auth.uid() AND read_at IS NULL;
END;
$$;

REVOKE EXECUTE ON FUNCTION mark_all_notifications_read FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION mark_all_notifications_read FROM anon;
GRANT EXECUTE ON FUNCTION mark_all_notifications_read TO authenticated;

-- mark_messages_read: mark all unread incoming messages in a conversation as read
CREATE OR REPLACE FUNCTION mark_messages_read(p_conversation_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_customer_id uuid;
  v_tradie_id uuid;
  v_is_participant boolean;
BEGIN
  SELECT customer_id, tradie_id INTO v_customer_id, v_tradie_id
  FROM conversations WHERE id = p_conversation_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Conversation not found';
  END IF;

  v_is_participant := (auth.uid() = v_customer_id OR auth.uid() = v_tradie_id);

  IF NOT v_is_participant THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  -- Mark only incoming messages (not from the caller) as read
  UPDATE messages SET read_at = now()
  WHERE conversation_id = p_conversation_id
    AND sender_id <> auth.uid()
    AND read_at IS NULL;
END;
$$;

REVOKE EXECUTE ON FUNCTION mark_messages_read FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION mark_messages_read FROM anon;
GRANT EXECUTE ON FUNCTION mark_messages_read TO authenticated;

-- Add tables to the realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE conversations;
ALTER PUBLICATION supabase_realtime ADD TABLE messages;
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
