/*
# Create job reviews table and review submission function

## Purpose
Adds a two-way review and rating system. After a job is fully completed
(tradie marks complete AND customer confirms), both the customer and the
tradie can leave a single 1-5 star rating with an optional comment for
each other. Reviews are visible on the job detail page and on profiles.

## New Tables
- `job_reviews`
  - `id` (uuid, primary key, default gen_random_uuid())
  - `job_id` (uuid, not null, references jobs ON DELETE CASCADE)
  - `reviewer_id` (uuid, not null, references profiles ON DELETE CASCADE)
  - `reviewee_id` (uuid, not null, references profiles ON DELETE CASCADE)
  - `rating` (integer, not null, CHECK 1-5)
  - `comment` (text, nullable)
  - `created_at` (timestamptz, default now())
  - `updated_at` (timestamptz, default now())

## Constraints
- UNIQUE (job_id, reviewer_id) — one review per job per reviewer
- CHECK (reviewer_id != reviewee_id) — cannot review yourself

## New Functions
- `create_review(p_job_id uuid, p_rating int, p_comment text)`
  SECURITY DEFINER, search_path = public.
  Validates: job exists, status = 'completed', customer_confirmed_at is
  not null, assigned_tradie_id is not null, caller is customer or assigned
  tradie, no existing review by caller for this job, rating 1-5.
  Inserts the review row and creates a 'new_review' notification for the
  reviewee.

## Notification Type
- Adds 'new_review' to the notifications CHECK constraint.
- The notification is created inside create_review via the existing
  create_notification helper — no new trigger needed.

## Indexes
- `idx_job_reviews_reviewee_id` on (reviewee_id) for average-rating lookups

## Security (RLS)
- Row Level Security enabled on job_reviews.
- SELECT: any authenticated user can read all reviews (public feedback).
- INSERT: authenticated can insert, but WITH CHECK requires
  auth.uid() = reviewer_id. In practice all inserts go through the
  create_review SECURITY DEFINER function.
- No UPDATE or DELETE policies — reviews are immutable once submitted.
- Column-level grants: authenticated gets SELECT only (no INSERT/UPDATE/
  DELETE). All writes go through create_review.
- anon role has NO access (revoked).

## Important Notes
1. The create_review function is the only write path. It validates all
   business rules server-side so a malicious client cannot bypass them.
2. Reviews are immutable — no edit or delete is supported.
3. The 'new_review' notification type is added to the existing CHECK
   constraint via ALTER CONSTRAINT (drop + recreate).
4. This migration is idempotent — uses IF NOT EXISTS and DROP IF EXISTS.
*/

-- 1. Create job_reviews table
CREATE TABLE IF NOT EXISTS job_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  reviewer_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  reviewee_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  rating integer NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT job_reviews_one_per_reviewer UNIQUE (job_id, reviewer_id),
  CONSTRAINT job_reviews_no_self_review CHECK (reviewer_id != reviewee_id)
);

-- 2. Enable RLS
ALTER TABLE job_reviews ENABLE ROW LEVEL SECURITY;

-- 3. Index for reviewee lookups (average rating queries)
CREATE INDEX IF NOT EXISTS idx_job_reviews_reviewee_id ON job_reviews (reviewee_id);

-- 4. RLS Policies
-- SELECT: any authenticated user can read all reviews
DROP POLICY IF EXISTS "job_reviews_select_all" ON job_reviews;
CREATE POLICY "job_reviews_select_all"
  ON job_reviews FOR SELECT
  TO authenticated
  USING (true);

-- INSERT: reviewer must be the caller (all writes go through create_review)
DROP POLICY IF EXISTS "job_reviews_insert_own" ON job_reviews;
CREATE POLICY "job_reviews_insert_own"
  ON job_reviews FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = reviewer_id);

-- No UPDATE or DELETE policies — reviews are immutable

-- 5. Column-level grants: SELECT only for authenticated
REVOKE ALL ON job_reviews FROM authenticated;
GRANT SELECT ON job_reviews TO authenticated;

-- Revoke anon access
REVOKE ALL ON job_reviews FROM anon;

-- 6. Add 'new_review' to notifications CHECK constraint
-- Must drop and recreate the constraint to add the new value
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    'new_quote', 'new_interest', 'quote_accepted', 'quote_rejected',
    'job_assigned', 'new_message', 'job_status_changed', 'new_job_note',
    'job_completion_confirmed', 'new_review'
  ));

-- 7. Create the create_review function
CREATE OR REPLACE FUNCTION create_review(
  p_job_id uuid,
  p_rating integer,
  p_comment text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_job RECORD;
  v_reviewee_id uuid;
  v_review_id uuid;
  v_existing_count integer;
BEGIN
  -- Validate rating range
  IF p_rating < 1 OR p_rating > 5 THEN
    RAISE EXCEPTION 'Rating must be between 1 and 5.';
  END IF;

  -- Fetch the job
  SELECT id, customer_id, assigned_tradie_id, status, title, customer_confirmed_at
  INTO v_job
  FROM jobs
  WHERE id = p_job_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Job not found.';
  END IF;

  -- Job must be completed with customer confirmation
  IF v_job.status != 'completed' THEN
    RAISE EXCEPTION 'Reviews are only available for completed jobs.';
  END IF;

  IF v_job.customer_confirmed_at IS NULL THEN
    RAISE EXCEPTION 'Reviews are only available after the customer confirms completion.';
  END IF;

  -- Must have an assigned tradie
  IF v_job.assigned_tradie_id IS NULL THEN
    RAISE EXCEPTION 'This job has no assigned tradie to review.';
  END IF;

  -- Caller must be the customer or the assigned tradie
  IF auth.uid() != v_job.customer_id AND auth.uid() != v_job.assigned_tradie_id THEN
    RAISE EXCEPTION 'You are not a participant in this job.';
  END IF;

  -- Determine the reviewee
  IF auth.uid() = v_job.customer_id THEN
    v_reviewee_id := v_job.assigned_tradie_id;
  ELSE
    v_reviewee_id := v_job.customer_id;
  END IF;

  -- Check for existing review by this reviewer for this job
  SELECT count(*) INTO v_existing_count
  FROM job_reviews
  WHERE job_id = p_job_id AND reviewer_id = auth.uid();

  IF v_existing_count > 0 THEN
    RAISE EXCEPTION 'You have already reviewed this job.';
  END IF;

  -- Insert the review
  INSERT INTO job_reviews (job_id, reviewer_id, reviewee_id, rating, comment)
  VALUES (p_job_id, auth.uid(), v_reviewee_id, p_rating, p_comment)
  RETURNING id INTO v_review_id;

  -- Create a notification for the reviewee
  PERFORM create_notification(
    v_reviewee_id,
    'new_review',
    'New review received',
    'You received a ' || p_rating || '-star review on the job "' || COALESCE(v_job.title, 'Unknown') || '".',
    p_job_id
  );

  RETURN v_review_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION create_review FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION create_review FROM anon;
GRANT EXECUTE ON FUNCTION create_review TO authenticated;
