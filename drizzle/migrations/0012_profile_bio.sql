REVOKE UPDATE (bio) ON public.profiles FROM authenticated;

DROP FUNCTION public.get_public_profile(text);
CREATE FUNCTION public.get_public_profile(_username text)
 RETURNS TABLE(username text, display_name text, accepting boolean, bio text)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT p.username, coalesce(nullif(p.display_name,''), p.username), (NOT p.inbox_paused AND NOT p.suspended), CASE WHEN p.suspended THEN NULL ELSE p.bio END
  FROM public.profiles p WHERE p.username = lower(_username)
$function$;
GRANT EXECUTE ON FUNCTION public.get_public_profile(text) TO anon, authenticated, service_role;

CREATE FUNCTION public.set_profile_bio(_user uuid, _bio text)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE b text := nullif(btrim(coalesce(_bio, '')), '');
BEGIN
 IF b IS NOT NULL AND char_length(b) > 160 THEN RAISE EXCEPTION 'too_long'; END IF;
 UPDATE public.profiles SET bio = b WHERE id = _user AND NOT suspended;
 IF NOT FOUND THEN RAISE EXCEPTION 'not_allowed'; END IF;
END $function$;
REVOKE ALL ON FUNCTION public.set_profile_bio(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_profile_bio(uuid, text) TO service_role;