/*
# Scoped Profile Visibility for Marketplace Participants

## Purpose
Fixes the "Unknown tradie name" bug. Customers could not see tradie profiles
for quotes/interests on their jobs because the only SELECT policies on profiles
were "read your own row" and "admin reads all". Every join from job_quotes to
profiles returned null for the tradie, so the UI fell back to "Unknown".

This migration adds a narrowly-scoped SELECT policy that lets two users see
each other's profile ONLY when they are connected by a job, quote, or
conversation. It does NOT make profiles public.

## Approach
1. Create a SECURITY DEFINER helper function `is_connected_profile(target_uuid)`
   that checks whether the current authenticated user (auth.uid()) is connected
   to the target profile via:
     - The target is a tradie who submitted a quote/interest on a job owned by
       the current user (customer).
     - The target is a tradie assigned to a job owned by the current user.
     - The current user is a tradie who submitted a quote/interest on a job
       owned by the target (customer).
     - The current user is a tradie assigned to a job owned by the target.
     - The target is a conversation partner (customer or tradie) with the
       current user.
   The function is SECURITY DEFINER SET search_path = public so it bypasses
   RLS on the tables it queries — avoiding the infinite recursion that
   `profiles_select_admin` originally hit (documented in migration 006).

2. Add a new SELECT policy `profiles_select_connected` that allows reading a
   profile row when `is_connected_profile(id)` returns true.

## Security
- No existing policies are dropped or modified.
- No changes to INSERT/UPDATE/DELETE policies.
- No changes to column-level privileges.
- The helper function is SECURITY DEFINER, EXECUTE revoked from anon/PUBLIC,
  granted to authenticated only.
- Profiles are NOT made public — visibility is strictly limited to parties
  connected by a job, quote, or conversation.
*/

-- ============================================================
-- 1. Create SECURITY DEFINER helper function
-- ============================================================
CREATE OR REPLACE FUNCTION is_connected_profile(p_target_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    -- Target tradie submitted a quote/interest on a job owned by current user
    SELECT 1 FROM job_quotes jq
    JOIN jobs j ON j.id = jq.job_id
    WHERE jq.tradie_id = p_target_id
      AND j.customer_id = auth.uid()
      AND jq.status <> 'withdrawn'
  )
  OR EXISTS (
    -- Target tradie is assigned to a job owned by current user
    SELECT 1 FROM jobs
    WHERE assigned_tradie_id = p_target_id
      AND customer_id = auth.uid()
  )
  OR EXISTS (
    -- Current user (tradie) submitted a quote/interest on a job owned by target
    SELECT 1 FROM job_quotes jq
    JOIN jobs j ON j.id = jq.job_id
    WHERE jq.tradie_id = auth.uid()
      AND j.customer_id = p_target_id
      AND jq.status <> 'withdrawn'
  )
  OR EXISTS (
    -- Current user (tradie) is assigned to a job owned by target
    SELECT 1 FROM jobs
    WHERE assigned_tradie_id = auth.uid()
      AND customer_id = p_target_id
  )
  OR EXISTS (
    -- Target is a conversation partner with current user
    SELECT 1 FROM conversations
    WHERE (customer_id = p_target_id AND tradie_id = auth.uid())
       OR (customer_id = auth.uid() AND tradie_id = p_target_id)
  )
$$;

REVOKE EXECUTE ON FUNCTION is_connected_profile(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION is_connected_profile(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION is_connected_profile(uuid) TO authenticated;

-- ============================================================
-- 2. Add scoped SELECT policy for connected marketplace participants
-- ============================================================
DROP POLICY IF EXISTS "profiles_select_connected" ON profiles;

CREATE POLICY "profiles_select_connected"
  ON profiles FOR SELECT
  TO authenticated
  USING (is_connected_profile(id));
