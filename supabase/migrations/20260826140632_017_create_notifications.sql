/*
# Create notifications table

## Purpose
Stores notifications for each user — alerts about platform events like
new quotes, quote acceptance/rejection, job assignment, status changes,
new messages, and new job notes. Notifications are created automatically
by database triggers and SECURITY DEFINER functions, never by the client
directly.

## New Tables
- `notifications`
  - `id` (uuid, primary key, default gen_random_uuid())
  - `user_id` (uuid, not null, default auth.uid(), references profiles ON DELETE CASCADE)
  - `type` (text, not null, CHECK in a defined set of notification types)
  - `title` (text, not null) — short headline
  - `body` (text, nullable) — optional longer description
  - `job_id` (uuid, nullable, references jobs ON DELETE SET NULL) — linked job
  - `conversation_id` (uuid, nullable, references conversations ON DELETE SET NULL) — linked conversation
  - `read_at` (timestamptz, nullable) — null = unread
  - `created_at` (timestamptz, default now())

## Notification Types
- 'new_quote' — a tradie submitted a quote on your job
- 'new_interest' — a tradie expressed interest in your job
- 'quote_accepted' — your quote was accepted by the customer
- 'quote_rejected' — your quote was rejected by the customer
- 'job_assigned' — you were assigned to a job
- 'new_message' — you received a new message in a conversation
- 'job_status_changed' — a job's status was updated
- 'new_job_note' — a new note was added to a job you're involved in

## Indexes
- `notifications_user_id_idx` on (user_id) for general listing
- `notifications_user_read_idx` on (user_id, read_at) for fast unread queries

## Security (RLS)
- Row Level Security enabled.
- A user can SELECT only their own notifications (user_id = auth.uid()).
- A user can UPDATE only the read_at column of their own notifications
  (for marking as read). Column-level UPDATE grant restricted to read_at.
- No INSERT via client — notifications are created by triggers only.
- No DELETE — notifications are permanent.
- anon role has NO access (revoked).

## Important Notes
1. The `user_id` column defaults to `auth.uid()` but notifications are
   created by SECURITY DEFINER trigger functions, not by client inserts.
   The default exists for consistency with the codebase pattern.
2. The client has no INSERT privilege on this table — all notifications
   are generated server-side by triggers on job_quotes, jobs, messages,
   and job_notes tables.
3. The UPDATE grant is restricted to the `read_at` column only — users
   cannot modify any other field of a notification.
*/

CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN (
    'new_quote', 'new_interest', 'quote_accepted', 'quote_rejected',
    'job_assigned', 'new_message', 'job_status_changed', 'new_job_note'
  )),
  title text NOT NULL,
  body text,
  job_id uuid REFERENCES jobs(id) ON DELETE SET NULL,
  conversation_id uuid REFERENCES conversations(id) ON DELETE SET NULL,
  read_at timestamptz,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Indexes
CREATE INDEX IF NOT EXISTS notifications_user_id_idx ON notifications (user_id);
CREATE INDEX IF NOT EXISTS notifications_user_read_idx ON notifications (user_id, read_at);

-- SELECT: users see only their own notifications
DROP POLICY IF EXISTS "notifications_select_own" ON notifications;
CREATE POLICY "notifications_select_own"
  ON notifications FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- UPDATE: users can update only their own notifications (for marking as read)
DROP POLICY IF EXISTS "notifications_update_own" ON notifications;
CREATE POLICY "notifications_update_own"
  ON notifications FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Column-level privileges: only read_at is updatable
REVOKE UPDATE ON notifications FROM authenticated;
GRANT UPDATE (read_at) ON notifications TO authenticated;

-- Grant SELECT only (no INSERT, no DELETE)
GRANT SELECT ON notifications TO authenticated;

-- Revoke anon access
REVOKE ALL ON notifications FROM anon;
