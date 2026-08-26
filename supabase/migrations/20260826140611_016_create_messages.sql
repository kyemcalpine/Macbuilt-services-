/*
# Create messages table

## Purpose
Stores individual messages within a conversation. Each message has a
sender (either the customer or the tradie in the conversation), a body,
and a read_at timestamp for tracking unread state.

## New Tables
- `messages`
  - `id` (uuid, primary key, default gen_random_uuid())
  - `conversation_id` (uuid, not null, references conversations ON DELETE CASCADE)
  - `sender_id` (uuid, not null, default auth.uid(), references profiles ON DELETE CASCADE)
  - `body` (text, not null) — the message content
  - `read_at` (timestamptz, nullable) — when the recipient read the message
  - `created_at` (timestamptz, default now())

## Indexes
- `messages_conversation_id_idx` on (conversation_id)
- `messages_conversation_created_idx` on (conversation_id, created_at) for
  chronological retrieval within a conversation

## Security (RLS)
- Row Level Security enabled.
- A conversation participant (customer or tradie) can SELECT messages in
  conversations they are part of.
- A participant can INSERT messages where sender_id = auth.uid() AND they
  are a participant of the conversation.
- Admin can SELECT all messages (is_admin()).
- No UPDATE or DELETE — messages are immutable once sent.
- anon role has NO access (revoked).

## Important Notes
1. The `sender_id` column defaults to `auth.uid()` so frontend inserts
   that omit it still satisfy the INSERT policy's WITH CHECK.
2. The `read_at` column is used for unread message counts. It is set
   to `now()` when the recipient opens the conversation. The UPDATE
   for marking messages as read is done via a SECURITY DEFINER function
   (mark_messages_read) — the client cannot UPDATE messages directly
   (no UPDATE grant).
3. Messages are immutable — no edits, no deletes. This preserves the
   communication audit trail.
*/

CREATE TABLE IF NOT EXISTS messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE CASCADE,
  body text NOT NULL,
  read_at timestamptz,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- Indexes
CREATE INDEX IF NOT EXISTS messages_conversation_id_idx ON messages (conversation_id);
CREATE INDEX IF NOT EXISTS messages_conversation_created_idx ON messages (conversation_id, created_at);

-- SELECT: conversation participants can read messages
DROP POLICY IF EXISTS "messages_select_participants" ON messages;
CREATE POLICY "messages_select_participants"
  ON messages FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM conversations
      WHERE conversations.id = messages.conversation_id
        AND (
          conversations.customer_id = auth.uid()
          OR conversations.tradie_id = auth.uid()
        )
    )
  );

-- SELECT: admins can read all messages
DROP POLICY IF EXISTS "messages_select_admin" ON messages;
CREATE POLICY "messages_select_admin"
  ON messages FOR SELECT
  TO authenticated
  USING (is_admin());

-- INSERT: participants can send messages
DROP POLICY IF EXISTS "messages_insert_participants" ON messages;
CREATE POLICY "messages_insert_participants"
  ON messages FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = sender_id
    AND EXISTS (
      SELECT 1 FROM conversations
      WHERE conversations.id = messages.conversation_id
        AND (
          conversations.customer_id = auth.uid()
          OR conversations.tradie_id = auth.uid()
        )
    )
  );

-- Grant SELECT and INSERT only (no UPDATE, no DELETE)
GRANT SELECT ON messages TO authenticated;
GRANT INSERT (id, conversation_id, sender_id, body) ON messages TO authenticated;

-- Revoke anon access
REVOKE ALL ON messages FROM anon;
