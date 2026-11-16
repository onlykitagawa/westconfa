-- The sender of a message now learns when the recipient answers it publicly on their profile
-- (Sent page, private status link, red "new" mark). public_answers.message_id is private: only the
-- owner (RLS) and admins can read the table, and get_public_answers() never returns it.
ALTER TABLE public.public_answers ADD COLUMN message_id uuid NULL REFERENCES public.messages(id) ON DELETE SET NULL;
CREATE INDEX public_answers_message_idx ON public.public_answers(message_id) WHERE message_id IS NOT NULL;
UPDATE public.public_answers a SET message_id = m.id
 FROM public.messages m
 WHERE a.message_id IS NULL AND m.recipient_id = a.owner_id AND m.body = a.question
  AND (SELECT count(*) FROM public.messages m2 WHERE m2.recipient_id = a.owner_id AND m2.body = a.question) = 1;

CREATE OR REPLACE FUNCTION public.publish_answer(_owner uuid, _message_id uuid, _answer text, _status text, _reason text)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE m public.messages%ROWTYPE; aid uuid;
BEGIN
 SELECT * INTO m FROM public.messages WHERE id = _message_id;
 IF NOT FOUND OR m.recipient_id <> _owner OR m.status <> 'approved' OR m.hidden THEN RAISE EXCEPTION 'not_allowed'; END IF;
 IF (SELECT count(*) FROM public.public_answers WHERE owner_id = _owner) >= 100 THEN RAISE EXCEPTION 'answer_limit'; END IF;
 INSERT INTO public.public_answers(owner_id, question, answer, status, reason, message_id) VALUES (_owner, m.body, _answer, _status, left(_reason, 140), m.id) RETURNING id INTO aid;
 RETURN aid;
END $function$;

-- A held answer counts as published when a moderator approves it (so it shows as new to the sender).
CREATE OR REPLACE FUNCTION public.admin_decide_answer(_id uuid, _approve boolean)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
 IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Forbidden'; END IF;
 IF _approve THEN
  DELETE FROM public.answer_reports WHERE answer_id = _id;
  UPDATE public.public_answers SET created_at = CASE WHEN status = 'pending' THEN clock_timestamp() ELSE created_at END,
   status = 'approved', hidden = false, report_count = 0 WHERE id = _id;
 ELSE DELETE FROM public.public_answers WHERE id = _id; END IF;
END $function$;

-- The public answer of a message, only while anyone can see it on the profile.
CREATE FUNCTION public.visible_answer(_message_id uuid)
 RETURNS TABLE(answer text, created_at timestamptz)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
 SELECT a.answer, a.created_at
 FROM public.public_answers a JOIN public.profiles p ON p.id = a.owner_id
 WHERE a.message_id = _message_id AND a.status = 'approved' AND NOT a.hidden AND NOT p.suspended
 ORDER BY a.created_at DESC LIMIT 1;
$function$;
REVOKE ALL ON FUNCTION public.visible_answer(uuid) FROM PUBLIC, anon, authenticated;

DROP FUNCTION public.my_sent_messages();
CREATE FUNCTION public.my_sent_messages()
 RETURNS TABLE(message_id uuid, state text, sent_at timestamptz, body text, to_username text, to_name text, reply_count integer, awaiting_you boolean, new_reply boolean, answer text, answered_at timestamptz)
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
   AND (EXISTS (SELECT 1 FROM public.message_replies r WHERE r.message_id = m.id AND r.status = 'approved' AND r.author = 'owner'
     AND (t.sender_seen_at IS NULL OR r.created_at > t.sender_seen_at))
    OR (pa.created_at IS NOT NULL AND (t.sender_seen_at IS NULL OR pa.created_at > t.sender_seen_at)))),
  pa.answer,
  pa.created_at
 FROM public.message_trackers t
 LEFT JOIN public.messages m ON m.id = t.message_id
 LEFT JOIN public.profiles p ON p.id = m.recipient_id
 LEFT JOIN LATERAL public.visible_answer(CASE WHEN m.status = 'approved' AND NOT m.hidden THEN m.id END) pa ON true
 WHERE t.sender_user_id = auth.uid()
 ORDER BY t.created_at DESC
 LIMIT 100;
END $function$;
REVOKE ALL ON FUNCTION public.my_sent_messages() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_sent_messages() TO authenticated;

CREATE OR REPLACE FUNCTION public.mark_sent_seen(_message_id uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Forbidden'; END IF;
 UPDATE public.message_trackers t
 SET sender_seen_at = (SELECT max(x) FROM (
   SELECT max(r.created_at) AS x FROM public.message_replies r WHERE r.message_id = t.message_id AND r.author = 'owner' AND r.status = 'approved'
   UNION ALL SELECT pa.created_at FROM public.visible_answer(t.message_id) pa) s)
 WHERE t.message_id = _message_id AND t.sender_user_id = auth.uid();
END $function$;

DROP FUNCTION public.message_status(text);
CREATE FUNCTION public.message_status(_token text)
 RETURNS TABLE(state text, sent_at timestamptz, body text, to_username text, answer text, answered_at timestamptz)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
 IF _token IS NULL OR char_length(_token) < 32 OR char_length(_token) > 64 THEN RETURN; END IF;
 RETURN QUERY
 SELECT
  CASE
   WHEN m.id IS NULL THEN coalesce(t.final_state, 'not_delivered')
   WHEN m.status <> 'approved' THEN 'waiting'
   WHEN m.read_at IS NOT NULL THEN 'seen'
   ELSE 'delivered' END,
  t.created_at,
  m.body,
  CASE WHEN pa.answer IS NULL THEN NULL ELSE p.username END,
  pa.answer,
  pa.created_at
 FROM public.message_trackers t
 LEFT JOIN public.messages m ON m.id = t.message_id
 LEFT JOIN public.profiles p ON p.id = m.recipient_id
 LEFT JOIN LATERAL public.visible_answer(CASE WHEN m.status = 'approved' AND NOT m.hidden THEN m.id END) pa ON true
 WHERE t.token_hash = encode(sha256(convert_to(_token, 'UTF8')), 'hex');
END $function$;
REVOKE ALL ON FUNCTION public.message_status(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.message_status(text) TO anon, authenticated;