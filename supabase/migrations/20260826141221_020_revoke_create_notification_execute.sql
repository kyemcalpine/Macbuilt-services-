/*
# Tighten create_notification execute grant

## Purpose
The `create_notification` helper function is only called by other
SECURITY DEFINER trigger functions (notify_new_quote, notify_new_message,
etc.). It should not be directly callable by authenticated users via
RPC. Revoke EXECUTE from authenticated — the trigger functions that
call it run as SECURITY DEFINER and bypass the grant check.

## Security
- Revoke EXECUTE on create_notification from authenticated.
- Keep it revoked from PUBLIC and anon (already done).
- The trigger functions that call create_notification run as SECURITY
  DEFINER, so they can call it regardless of the execute grant.
*/

REVOKE EXECUTE ON FUNCTION create_notification FROM authenticated;
