-- Red "new reply" marks. A viewer's marker now remembers the newest reply they have actually been
-- shown (its created_at) instead of the moment they looked. A reply that was held for review and
-- approved later is therefore still marked as new. This is exact because each side can have only
-- one reply waiting for review at a time (add_owner_reply and add_sender_reply refuse a new one
-- while one is pending), so a side's replies always become visible in the order they were written.
CREATE OR REPLACE FUNCTION public.mark_sent_seen(_message_id uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Forbidden'; END IF;
 UPDATE public.message_trackers t
 SET sender_seen_at = (SELECT max(r.created_at) FROM public.message_replies r WHERE r.message_id = t.message_id AND r.author = 'owner' AND r.status = 'approved')
 WHERE t.message_id = _message_id AND t.sender_user_id = auth.uid();
END $function$;

CREATE OR REPLACE FUNCTION public.mark_thread_seen(_message_id uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Forbidden'; END IF;
 UPDATE public.messages m
 SET owner_seen_at = (SELECT max(r.created_at) FROM public.message_replies r WHERE r.message_id = m.id AND r.author = 'sender' AND r.status = 'approved')
 WHERE m.id = _message_id AND m.recipient_id = auth.uid();
END $function$;

-- Reply state of the caller's own inbox conversations (one row per message that has replies).
-- Always scoped to the recipient, also for admins, whose row-level access to replies is wider.
CREATE FUNCTION public.my_inbox_threads()
 RETURNS TABLE(message_id uuid, replied boolean, new_reply boolean)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Forbidden'; END IF;
 RETURN QUERY
 SELECT m.id,
  bool_or(r.author = 'owner'),
  bool_or(r.author = 'sender' AND r.status = 'approved' AND (m.owner_seen_at IS NULL OR r.created_at > m.owner_seen_at))
 FROM public.messages m
 JOIN public.message_replies r ON r.message_id = m.id
 WHERE m.recipient_id = auth.uid() AND m.status = 'approved' AND NOT m.hidden
 GROUP BY m.id;
END $function$;
REVOKE ALL ON FUNCTION public.my_inbox_threads() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_inbox_threads() TO authenticated;