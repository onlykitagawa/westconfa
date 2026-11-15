REVOKE UPDATE (avatar_url) ON public.profiles FROM authenticated;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('avatars', 'avatars', true, 262144, ARRAY['image/jpeg'])
ON CONFLICT (id) DO NOTHING;

CREATE TABLE public.avatar_events (
  id bigserial PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON public.avatar_events FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.avatar_events TO service_role;
ALTER TABLE public.avatar_events ENABLE ROW LEVEL SECURITY;
CREATE INDEX avatar_events_user_time_idx ON public.avatar_events(user_id, created_at);

CREATE TABLE public.avatar_reports (
  target_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reporter_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (target_id, reporter_id)
);
REVOKE ALL ON public.avatar_reports FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.avatar_reports TO service_role;
ALTER TABLE public.avatar_reports ENABLE ROW LEVEL SECURITY;

CREATE FUNCTION public.start_avatar_upload(_user uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = _user AND NOT suspended) THEN RAISE EXCEPTION 'not_allowed'; END IF;
 IF (SELECT count(*) FROM public.avatar_events e WHERE e.user_id = _user AND e.created_at > now() - interval '1 hour') >= 5 THEN
 RAISE EXCEPTION 'avatar_limit';
 END IF;
 INSERT INTO public.avatar_events(user_id) VALUES (_user);
END $function$;
REVOKE ALL ON FUNCTION public.start_avatar_upload(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.start_avatar_upload(uuid) TO service_role;

CREATE FUNCTION public.set_profile_avatar(_user uuid, _url text)
 RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE old text;
BEGIN
 SELECT avatar_url INTO old FROM public.profiles WHERE id = _user AND NOT suspended FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'not_allowed'; END IF;
 UPDATE public.profiles SET avatar_url = _url WHERE id = _user;
 DELETE FROM public.avatar_reports WHERE target_id = _user;
 RETURN old;
END $function$;
REVOKE ALL ON FUNCTION public.set_profile_avatar(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_profile_avatar(uuid, text) TO service_role;

CREATE FUNCTION public.report_avatar(_reporter uuid, _username text)
 RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE target uuid; n integer; old text;
BEGIN
 IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = _reporter AND NOT suspended) THEN RAISE EXCEPTION 'not_allowed'; END IF;
 SELECT id INTO target FROM public.profiles WHERE username = lower(_username) AND NOT suspended AND avatar_url IS NOT NULL;
 IF target IS NULL OR target = _reporter THEN RAISE EXCEPTION 'not_allowed'; END IF;
 INSERT INTO public.avatar_reports(target_id, reporter_id) VALUES (target, _reporter) ON CONFLICT DO NOTHING;
 SELECT count(*) INTO n FROM public.avatar_reports WHERE target_id = target;
 IF n >= 2 THEN
 SELECT avatar_url INTO old FROM public.profiles WHERE id = target;
 UPDATE public.profiles SET avatar_url = NULL WHERE id = target;
 DELETE FROM public.avatar_reports WHERE target_id = target;
 RETURN old;
 END IF;
 RETURN NULL;
END $function$;
REVOKE ALL ON FUNCTION public.report_avatar(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.report_avatar(uuid, text) TO service_role;

CREATE FUNCTION public.admin_clear_avatar(_user_id uuid)
 RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE old text;
BEGIN
 IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Forbidden'; END IF;
 SELECT avatar_url INTO old FROM public.profiles WHERE id = _user_id FOR UPDATE;
 UPDATE public.profiles SET avatar_url = NULL WHERE id = _user_id;
 DELETE FROM public.avatar_reports WHERE target_id = _user_id;
 RETURN old;
END $function$;
REVOKE ALL ON FUNCTION public.admin_clear_avatar(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_clear_avatar(uuid) TO authenticated;

DROP FUNCTION public.get_public_profile(text);
CREATE FUNCTION public.get_public_profile(_username text)
 RETURNS TABLE(username text, display_name text, accepting boolean, bio text, avatar_url text)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT p.username, coalesce(nullif(p.display_name,''), p.username), (NOT p.inbox_paused AND NOT p.suspended), CASE WHEN p.suspended THEN NULL ELSE p.bio END, CASE WHEN p.suspended THEN NULL ELSE p.avatar_url END
  FROM public.profiles p WHERE p.username = lower(_username)
$function$;
GRANT EXECUTE ON FUNCTION public.get_public_profile(text) TO anon, authenticated, service_role;

DROP FUNCTION public.search_profiles(text);
CREATE FUNCTION public.search_profiles(_query text)
 RETURNS TABLE(username text, display_name text, accepting boolean, avatar_url text)
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
 SELECT p.username, coalesce(nullif(p.display_name, ''), p.username), (NOT p.inbox_paused AND NOT p.suspended), p.avatar_url
 FROM public.profiles p
 WHERE p.searchable AND NOT p.suspended AND p.username IS NOT NULL
  AND (p.username LIKE q || '%' OR lower(coalesce(p.display_name, '')) LIKE '%' || q || '%')
 ORDER BY (p.username LIKE q || '%') DESC, p.username
 LIMIT 8;
END $function$;
REVOKE ALL ON FUNCTION public.search_profiles(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.search_profiles(text) TO authenticated;

DROP FUNCTION public.admin_list_users(text);
CREATE FUNCTION public.admin_list_users(_search text)
 RETURNS TABLE(id uuid, email text, username text, display_name text, suspended boolean, created_at timestamp with time zone, avatar_url text)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Forbidden'; END IF;
  RETURN QUERY SELECT p.id, p.email, p.username, p.display_name, p.suspended, p.created_at, p.avatar_url FROM public.profiles p
  WHERE _search IS NULL OR _search = '' OR p.username ILIKE '%' || _search || '%' OR p.email ILIKE '%' || _search || '%'
  ORDER BY p.created_at DESC LIMIT 50;
END $function$;
REVOKE ALL ON FUNCTION public.admin_list_users(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_users(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.purge_expired()
 RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path TO 'public'
AS $function$
  DELETE FROM public.messages WHERE created_at < now() - make_interval(days => public.message_retention_days());
  DELETE FROM public.message_trackers WHERE created_at < now() - make_interval(days => public.message_retention_days());
  DELETE FROM public.rate_events WHERE created_at < now() - interval '24 hours';
  DELETE FROM public.login_attempts WHERE created_at < now() - interval '24 hours';
  DELETE FROM public.search_events WHERE created_at < now() - interval '24 hours';
  DELETE FROM public.avatar_events WHERE created_at < now() - interval '24 hours';
$function$;