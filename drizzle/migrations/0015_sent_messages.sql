ALTER TABLE public.message_trackers ADD COLUMN sender_user_id uuid NULL REFERENCES public.profiles(id) ON DELETE SET NULL;
CREATE INDEX message_trackers_sender_idx ON public.message_trackers(sender_user_id, created_at DESC);
UPDATE public.message_trackers t SET sender_user_id = s.sender_user_id
 FROM public.message_senders s
 WHERE s.message_id = t.message_id AND s.sender_user_id IS NOT NULL
  AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = s.sender_user_id);

CREATE OR REPLACE FUNCTION public.attach_message_tracker(_message_id uuid, _token_hash text)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
 INSERT INTO public.message_trackers(token_hash, message_id, sender_user_id)
 SELECT _token_hash, _message_id, (SELECT s.sender_user_id FROM public.message_senders s WHERE s.message_id = _message_id);
END $function$;

CREATE FUNCTION public.my_sent_messages()
 RETURNS TABLE(message_id uuid, state text, sent_at timestamptz, body text, to_username text, to_name text, reply_count integer, awaiting_you boolean)
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
   AND (SELECT count(*) FROM public.message_replies x WHERE x.message_id = m.id) < 30)
 FROM public.message_trackers t
 LEFT JOIN public.messages m ON m.id = t.message_id
 LEFT JOIN public.profiles p ON p.id = m.recipient_id
 WHERE t.sender_user_id = auth.uid()
 ORDER BY t.created_at DESC
 LIMIT 100;
END $function$;
REVOKE ALL ON FUNCTION public.my_sent_messages() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_sent_messages() TO authenticated;

CREATE FUNCTION public.my_sent_thread(_message_id uuid)
 RETURNS TABLE(id uuid, author text, body text, created_at timestamptz, status text, closed boolean, can_reply boolean)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Forbidden'; END IF;
 RETURN QUERY
 SELECT r.id, r.author, r.body, r.created_at, r.status, m.replies_closed,
  (NOT m.replies_closed
   AND coalesce((SELECT x.author FROM public.message_replies x WHERE x.message_id = m.id AND x.status = 'approved' ORDER BY x.created_at DESC, x.id DESC LIMIT 1), '') = 'owner'
   AND NOT EXISTS (SELECT 1 FROM public.message_replies x WHERE x.message_id = m.id AND x.author = 'sender' AND x.status = 'pending')
   AND (SELECT count(*) FROM public.message_replies x WHERE x.message_id = m.id) < 30)
 FROM public.message_trackers t
 JOIN public.messages m ON m.id = t.message_id AND m.status = 'approved' AND NOT m.hidden
 JOIN public.message_replies r ON r.message_id = m.id AND (r.status = 'approved' OR r.author = 'sender')
 WHERE t.sender_user_id = auth.uid() AND m.id = _message_id
 ORDER BY r.created_at, r.id;
END $function$;
REVOKE ALL ON FUNCTION public.my_sent_thread(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_sent_thread(uuid) TO authenticated;