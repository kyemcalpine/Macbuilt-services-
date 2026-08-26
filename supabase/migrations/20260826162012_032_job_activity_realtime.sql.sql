/*
# Add job_activity to realtime publication (Stage 4C)

## Purpose
Adds the `job_activity` table to the `supabase_realtime` publication
so the frontend can subscribe to INSERT events and display new activity
entries live without polling.

## Changes
- ALTER PUBLICATION supabase_realtime ADD TABLE job_activity

## Important Notes
1. This mirrors the approach used for conversations, messages, and
   notifications in migration 019.
2. The client subscribes to INSERT events filtered by job_id to receive
   new activity entries in real time.
*/

ALTER PUBLICATION supabase_realtime ADD TABLE job_activity;
