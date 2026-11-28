-- Usernames and display names are public, so they are now checked by the AI before they are saved.
-- They are written only by the saveProfileName server function (service role); clients can still
-- change inbox_paused and searchable themselves.
REVOKE UPDATE (username, display_name) ON public.profiles FROM authenticated, anon;