/*
# Create job_activity table for the Job Activity Timeline (Stage 4C)

## Purpose
Creates a shared, job-scoped activity log that records one row per event
on a job — status changes, quotes, notes, photos, messages, reviews,
completion requests and confirmations. Unlike the notifications table
(which tells a specific user about an event), this table is a shared
chronological history that both the customer and the assigned tradie
can read. All writes come from database triggers; the client has
SELECT-only access.

## New Tables
- `job_activity`
  - `id` (uuid, primary key, default gen_random_uuid())
  - `job_id` (uuid, not null, references jobs ON DELETE CASCADE)
  - `activity_type` (text, not null) — one of:
    'job_created', 'status_changed', 'quote_submitted', 'interest_expressed',
    'quote_accepted', 'quote_rejected', 'quote_withdrawn',
    'note_added', 'photo_uploaded', 'message_sent',
    'review_submitted', 'completion_requested', 'completion_confirmed'
  - `actor_id` (uuid, nullable) — who performed the action (may be null
    for system-generated events)
  - `detail` (text, nullable) — short human-readable description
  - `metadata` (jsonb, nullable) — structured context (quote amount,
    photo caption, status from/to, rating, etc.)
  - `created_at` (timestamptz, default now())

## Indexes
- `job_activity_job_id_idx` on (job_id, created_at) for chronological
  retrieval by job

## Security (RLS)
- Row Level Security enabled.
- SELECT: job owner, assigned tradie, or admin can read activity rows
  (same participant check as job_notes and job_attachments).
- No INSERT, UPDATE, or DELETE policies for the client — all writes
  come from SECURITY DEFINER trigger functions that bypass RLS.
- anon role has NO access (revoked).

## Important Notes
1. This table is append-only from the client's perspective. Triggers
   on existing tables insert rows; the client never writes directly.
2. The RLS SELECT policy mirrors the pattern used by job_notes and
   job_attachments for consistency.
3. This migration only creates the table and RLS. Trigger functions
   are created in a separate migration (031).
*/

CREATE TABLE IF NOT EXISTS job_activity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  activity_type text NOT NULL CHECK (activity_type IN (
    'job_created', 'status_changed', 'quote_submitted', 'interest_expressed',
    'quote_accepted', 'quote_rejected', 'quote_withdrawn',
    'note_added', 'photo_uploaded', 'message_sent',
    'review_submitted', 'completion_requested', 'completion_confirmed'
  )),
  actor_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  detail text,
  metadata jsonb,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE job_activity ENABLE ROW LEVEL SECURITY;

-- Index for chronological retrieval by job
CREATE INDEX IF NOT EXISTS job_activity_job_id_idx
  ON job_activity (job_id, created_at);

-- SELECT: job owner, assigned tradie, or admin
DROP POLICY IF EXISTS "job_activity_select_participants" ON job_activity;
CREATE POLICY "job_activity_select_participants"
  ON job_activity FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM jobs
      WHERE jobs.id = job_activity.job_id
      AND (
        jobs.customer_id = auth.uid()
        OR jobs.assigned_tradie_id = auth.uid()
        OR is_admin()
      )
    )
  );

-- Grant SELECT only (no INSERT/UPDATE/DELETE for the client)
GRANT SELECT ON job_activity TO authenticated;

-- Revoke anon access
REVOKE ALL ON job_activity FROM anon;
