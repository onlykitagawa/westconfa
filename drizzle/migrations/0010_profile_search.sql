ALTER TABLE public.profiles ADD COLUMN searchable boolean NOT NULL DEFAULT true;
REVOKE UPDATE ON public.profiles FROM authenticated;
GRANT UPDATE (username, display_name, inbox_paused, avatar_url, bio, searchable) ON public.profiles TO authenticated;

CREATE TABLE public.search_events (
  id bigserial PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON public.search_events FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.search_events TO service_role;
ALTER TABLE public.search_events ENABLE ROW LEVEL SECURITY;
CREATE INDEX search_events_user_time_idx ON public.search_events(user_id, created_at);

CREATE FUNCTION public.search_profiles(_query text)
 RETURNS TABLE(username text, display_name text, accepting boolean)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE q text := lower(btrim(coalesce(_query, '')));
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Forbidden'; END IF;
 IF char_length(q) < 2 OR char_length(q) > 40 THEN RETURN; END IF;
 IF (SELECT count(*) FROM public.search_events e WHERE e.user_id = auth.uid() AND e.created_at > now() - interval '1 hour') >= 120 THEN
 RAISE EXCEPTION 'rate_limited';
 END IF;
 INSERT INTO public.search_events(user_id) VALUES (auth.uid());
 q := replace(replace(replace(q, '\', '\\'), '%', '\%'), '_', '\_');
 RETURN QUERY
 SELECT p.username, coalesce(nullif(p.display_name, ''), p.username), (NOT p.inbox_paused AND NOT p.suspended)
 FROM public.profiles p
 WHERE p.searchable AND NOT p.suspended AND p.username IS NOT NULL
  AND (p.username LIKE q || '%' OR lower(coalesce(p.display_name, '')) LIKE '%' || q || '%')
 ORDER BY (p.username LIKE q || '%') DESC, p.username
 LIMIT 8;
END $function$;
REVOKE ALL ON FUNCTION public.search_profiles(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.search_profiles(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.purge_expired()
 RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path TO 'public'
AS $function$
  DELETE FROM public.messages WHERE created_at < now() - make_interval(days => public.message_retention_days());
  DELETE FROM public.message_trackers WHERE created_at < now() - make_interval(days => public.message_retention_days());
  DELETE FROM public.rate_events WHERE created_at < now() - interval '24 hours';
  DELETE FROM public.login_attempts WHERE created_at < now() - interval '24 hours';
  DELETE FROM public.search_events WHERE created_at < now() - interval '24 hours';
$function$;