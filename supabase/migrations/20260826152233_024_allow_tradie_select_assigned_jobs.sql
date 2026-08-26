/*
# Allow assigned tradies to SELECT their assigned jobs

## Purpose
The jobs table had SELECT policies for:
  - admin (is_admin())
  - open jobs (status = 'open')
  - job owner (auth.uid() = customer_id)

But NO policy allowed the assigned tradie to read a job they are
working on. This meant when a tradie navigated to /jobs/:id for a
job assigned to them, the query returned no rows, the page showed
"Job not found", and none of the workflow buttons (Start Work,
Mark as Completed, Leave a Review) ever appeared.

## Change
Add a SELECT policy allowing the assigned tradie to read jobs
where auth.uid() = assigned_tradie_id.

## Security
- This is a read-only policy. No INSERT/UPDATE/DELETE changes.
- The tradie can only read jobs explicitly assigned to them.
- All existing policies remain unchanged.
*/

CREATE POLICY "jobs_select_assigned_tradie"
  ON jobs FOR SELECT
  TO authenticated
  USING (auth.uid() = assigned_tradie_id);
