-- Security hardening (Nov 24, 2026). Row rules already block every attack we tried; this removes
-- table permissions the site never uses, so a future mistake in a rule cannot open a hole.
-- Clients keep only: profiles SELECT + column UPDATEs, messages SELECT/DELETE + UPDATE(read_at),
-- message_replies SELECT, public_answers SELECT/DELETE, user_roles SELECT, message_moderation
-- SELECT (admins, by rule), app_settings SELECT/UPDATE (admins, by rule), contact_messages
-- INSERT (anyone) and SELECT/DELETE (admins, by rule). Column grants are not touched.
REVOKE ALL ON public.app_settings, public.login_attempts, public.message_moderation, public.message_reports,
 public.messages, public.profiles, public.rate_events, public.user_roles FROM anon;
REVOKE SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.contact_messages FROM anon;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.app_settings, public.contact_messages, public.login_attempts,
 public.message_moderation, public.message_reports, public.messages, public.profiles, public.rate_events,
 public.user_roles FROM authenticated;
REVOKE ALL ON public.login_attempts, public.rate_events, public.message_reports FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.user_roles FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.message_moderation FROM authenticated;
REVOKE INSERT, DELETE ON public.app_settings FROM authenticated;
REVOKE UPDATE ON public.contact_messages FROM authenticated;
REVOKE INSERT, DELETE ON public.profiles FROM authenticated;
REVOKE INSERT ON public.messages FROM authenticated;

-- Trigger functions are never called directly; has_role is only for signed-in rules.
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_allowed_email() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;

-- The contact form is open to anyone: cap it so nobody can flood it (60 a hour for the whole site).
CREATE FUNCTION public.limit_contact_messages()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
 IF (SELECT count(*) FROM public.contact_messages WHERE created_at > now() - interval '1 hour') >= 60 THEN
  RAISE EXCEPTION 'rate_limited';
 END IF;
 RETURN NEW;
END $function$;
REVOKE EXECUTE ON FUNCTION public.limit_contact_messages() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER contact_messages_limit BEFORE INSERT ON public.contact_messages FOR EACH ROW EXECUTE FUNCTION public.limit_contact_messages();