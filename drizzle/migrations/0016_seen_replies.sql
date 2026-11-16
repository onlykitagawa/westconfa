ALTER TABLE public.message_trackers ADD COLUMN sender_seen_at timestamptz NULL;
ALTER TABLE public.messages ADD COLUMN owner_seen_at timestamptz NULL;

DROP FUNCTION public.my_sent_messages();
CREATE FUNCTION public.my_sent_messages()
 RETURNS TABLE(message_id uuid, state text, sent_at timestamptz, body text, to_username text, to_name text, reply_count integer, awaiting_you boolean, new_reply boolean)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Forbidden'; END IF;
 RETURN QUERY
 SELECT m.id,
  CASE
   WHEN m.id IS NULL THEN coalesce(t.final_state, 'not_delivered')
   WHEN m.status <> 'approved' THEN 'waiting'
   WHEN m.read_at IS NOT NULL THEN 'seen'
   ELSE 'delivered' END,
  t.created_at,
  m.body,
  p.username,
  coalesce(nullif(p.display_name, ''), p.username),
  (SELECT count(*)::integer FROM public.message_replies r WHERE r.message_id = m.id AND r.status = 'approved' AND r.author = 'owner'),
  (m.id IS NOT NULL AND m.status = 'approved' AND NOT m.hidden AND NOT m.replies_closed
   AND coalesce((SELECT x.author FROM public.message_replies x WHERE x.message_id = m.id AND x.status = 'approved' ORDER BY x.created_at DESC, x.id DESC LIMIT 1), '') = 'owner'
   AND NOT EXISTS (SELECT 1 FROM public.message_replies x WHERE x.message_id = m.id AND x.author = 'sender' AND x.status = 'pending')
   AND (SELECT count(*) FROM public.message_replies x WHERE x.message_id = m.id) < 30),
  (m.id IS NOT NULL AND m.status = 'approved' AND NOT m.hidden
   AND EXISTS (SELECT 1 FROM public.message_replies r WHERE r.message_id = m.id AND r.status = 'approved' AND r.author = 'owner'
    AND (t.sender_seen_at IS NULL OR r.created_at > t.sender_seen_at)))
 FROM public.message_trackers t
 LEFT JOIN public.messages m ON m.id = t.message_id
 LEFT JOIN public.profiles p ON p.id = m.recipient_id
 WHERE t.sender_user_id = auth.uid()
 ORDER BY t.created_at DESC
 LIMIT 100;
END $function$;
REVOKE ALL ON FUNCTION public.my_sent_messages() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_sent_messages() TO authenticated;

CREATE FUNCTION public.mark_sent_seen(_message_id uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Forbidden'; END IF;
 UPDATE public.message_trackers SET sender_seen_at = now() WHERE message_id = _message_id AND sender_user_id = auth.uid();
END $function$;
REVOKE ALL ON FUNCTION public.mark_sent_seen(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_sent_seen(uuid) TO authenticated;

CREATE FUNCTION public.mark_thread_seen(_message_id uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Forbidden'; END IF;
 UPDATE public.messages SET owner_seen_at = now() WHERE id = _message_id AND recipient_id = auth.uid();
END $function$;
REVOKE ALL ON FUNCTION public.mark_thread_seen(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_thread_seen(uuid) TO authenticated;