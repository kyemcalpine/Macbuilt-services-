/*
# Fix: add DEFAULT auth.uid() to job_quotes.tradie_id

## Root Cause
The `job_quotes.tradie_id` column is NOT NULL with no default.
The QuoteForm frontend insert payload does not include `tradie_id`
(following the same pattern as jobs.customer_id which has DEFAULT auth.uid()).
Without a default, `tradie_id` is null in the insert, which fails the
RLS INSERT policy `WITH CHECK (auth.uid() = tradie_id)`.

## Fix
Add `DEFAULT auth.uid()` to the `tradie_id` column, matching the
established pattern used for `jobs.customer_id`. The RLS INSERT
policy still enforces `auth.uid() = tradie_id` — the default simply
fills the column from the authenticated session so the insert succeeds.

## Security
This does NOT weaken RLS. The policy `WITH CHECK (auth.uid() = tradie_id)`
still runs. A user can only create quotes where they are the tradie.
The default is filled from the authenticated session, not from user input.
*/

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'job_quotes'
      AND column_name = 'tradie_id'
      AND column_default IS NULL
  ) THEN
    ALTER TABLE job_quotes
      ALTER COLUMN tradie_id SET DEFAULT auth.uid();
  END IF;
END $$;
