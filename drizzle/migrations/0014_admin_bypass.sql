CREATE FUNCTION public.store_admin_message(_recipient_id uuid, _body text, _sender_user_id uuid)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE message_uuid uuid;
BEGIN
 IF _sender_user_id IS NULL OR NOT public.has_role(_sender_user_id, 'admin') THEN RAISE EXCEPTION 'Forbidden'; END IF;
 INSERT INTO public.messages(recipient_id, body, status) VALUES (_recipient_id, _body, 'approved') RETURNING id INTO message_uuid;
 INSERT INTO public.message_senders(message_id, sender_user_id, sender_network_hash) VALUES (message_uuid, _sender_user_id, NULL);
 RETURN message_uuid;
END $function$;
REVOKE ALL ON FUNCTION public.store_admin_message(uuid, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.store_admin_message(uuid, text, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.search_profiles(_query text)
 RETURNS TABLE(username text, display_name text, accepting boolean, avatar_url text)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE q text := lower(btrim(coalesce(_query, '')));
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Forbidden'; END IF;
 IF char_length(q) < 2 OR char_length(q) > 40 THEN RETURN; END IF;
 IF NOT public.has_role(auth.uid(), 'admin') THEN
 IF (SELECT count(*) FROM public.search_events e WHERE e.user_id = auth.uid() AND e.created_at > now() - interval '1 hour') >= 120 THEN
 RAISE EXCEPTION 'rate_limited';
 END IF;
 INSERT INTO public.search_events(user_id) VALUES (auth.uid());
 END IF;
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