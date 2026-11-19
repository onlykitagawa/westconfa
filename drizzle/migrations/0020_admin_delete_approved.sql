-- Moderators can delete what they approved, later on. Admins still only ever see messages and replies
-- they were shown for review (held or reported): approving one now marks it, so it stays in their
-- "Approved" list until it is deleted or expires after 90 days.
ALTER TABLE public.messages ADD COLUMN admin_approved_at timestamptz NULL;
ALTER TABLE public.message_replies ADD COLUMN admin_approved_at timestamptz NULL;
ALTER TABLE public.public_answers ADD COLUMN admin_approved_at timestamptz NULL;
-- Messages approved before this change: every approved message with a moderation note was held and
-- then approved by an admin.
UPDATE public.messages m SET admin_approved_at = mm.created_at FROM public.message_moderation mm WHERE mm.message_id = m.id AND m.status = 'approved';

DROP POLICY "Admins read held or reported messages" ON public.messages;
CREATE POLICY "Admins read held, reported or approved-by-admin messages" ON public.messages FOR SELECT TO authenticated
 USING (public.has_role(auth.uid(), 'admin'::app_role) AND (status = 'pending' OR report_count > 0 OR admin_approved_at IS NOT NULL));

CREATE OR REPLACE FUNCTION public.admin_decide_message(_message_id uuid, _approve boolean)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
 IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Forbidden'; END IF;
 IF _approve THEN UPDATE public.messages SET status = 'approved', admin_approved_at = now() WHERE id = _message_id AND status = 'pending';
 ELSE DELETE FROM public.messages WHERE id = _message_id AND status = 'pending'; END IF;
END $function$;

CREATE OR REPLACE FUNCTION public.admin_decide_reply(_id uuid, _approve boolean)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
 IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Forbidden'; END IF;
 IF _approve THEN UPDATE public.message_replies SET status = 'approved', admin_approved_at = now() WHERE id = _id AND status = 'pending';
 ELSE DELETE FROM public.message_replies WHERE id = _id AND status = 'pending'; END IF;
END $function$;

CREATE OR REPLACE FUNCTION public.admin_decide_answer(_id uuid, _approve boolean)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
 IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Forbidden'; END IF;
 IF _approve THEN
  DELETE FROM public.answer_reports WHERE answer_id = _id;
  UPDATE public.public_answers SET created_at = CASE WHEN status = 'pending' THEN clock_timestamp() ELSE created_at END,
   status = 'approved', hidden = false, report_count = 0, admin_approved_at = now() WHERE id = _id;
 ELSE DELETE FROM public.public_answers WHERE id = _id; END IF;
END $function$;

-- Who sent it, also for messages the admin approved earlier.
CREATE OR REPLACE FUNCTION public.admin_message_details(_message_ids uuid[])
 RETURNS TABLE(message_id uuid, recipient_username text, recipient_display_name text, sender_kind text, sender_username text, sender_email text, sender_network_code text, sender_other_messages integer)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
 IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Forbidden'; END IF;
 RETURN QUERY
 SELECT m.id, rp.username, rp.display_name,
  CASE WHEN s.sender_user_id IS NOT NULL THEN 'account' WHEN s.sender_network_hash IS NOT NULL THEN 'guest' ELSE 'unknown' END,
  sp.username, sp.email,
  CASE WHEN s.sender_user_id IS NULL AND s.sender_network_hash IS NOT NULL THEN left(s.sender_network_hash, 8) END,
  CASE
   WHEN s.sender_user_id IS NOT NULL THEN (SELECT count(*)::int FROM public.message_senders o WHERE o.sender_user_id = s.sender_user_id AND o.message_id <> m.id AND o.created_at >= now() - interval '90 days')
   WHEN s.sender_network_hash IS NOT NULL THEN (SELECT count(*)::int FROM public.message_senders o WHERE o.sender_user_id IS NULL AND o.sender_network_hash = s.sender_network_hash AND o.message_id <> m.id AND o.created_at >= now() - interval '90 days')
   ELSE 0 END
 FROM public.messages m
 JOIN public.profiles rp ON rp.id = m.recipient_id
 LEFT JOIN public.message_senders s ON s.message_id = m.id
 LEFT JOIN public.profiles sp ON sp.id = s.sender_user_id
 WHERE m.id = ANY(_message_ids) AND (m.status = 'pending' OR m.report_count > 0 OR m.admin_approved_at IS NOT NULL);
END $function$;

-- Everything an admin approved (newest first): held messages, replies, public answers (approved or
-- kept after reports) and Ask questions and answers. Context is what it answers.
CREATE FUNCTION public.admin_approved_items()
 RETURNS TABLE(kind text, id uuid, body text, context text, approved_at timestamptz)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
 IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Forbidden'; END IF;
 RETURN QUERY
 SELECT * FROM (
  SELECT 'message'::text, m.id, m.body, NULL::text, m.admin_approved_at FROM public.messages m WHERE m.admin_approved_at IS NOT NULL AND m.status = 'approved'
  UNION ALL
  SELECT 'reply_' || r.author, r.id, r.body, m.body, r.admin_approved_at FROM public.message_replies r JOIN public.messages m ON m.id = r.message_id WHERE r.admin_approved_at IS NOT NULL AND r.status = 'approved'
  UNION ALL
  SELECT 'answer'::text, a.id, a.answer, a.question, a.admin_approved_at FROM public.public_answers a WHERE a.admin_approved_at IS NOT NULL AND a.status = 'approved'
  UNION ALL
  SELECT 'ask_post'::text, p.id, p.body, NULL::text, mo.decided_at FROM public.ask_posts p JOIN public.ask_moderation mo ON mo.kind = 'post' AND mo.item_id = p.id WHERE mo.decided = 'approved' AND mo.ai_says <> 'admin' AND p.status = 'approved'
  UNION ALL
  SELECT 'ask_answer'::text, a.id, a.body, p.body, mo.decided_at FROM public.ask_answers a JOIN public.ask_posts p ON p.id = a.post_id JOIN public.ask_moderation mo ON mo.kind = 'answer' AND mo.item_id = a.id WHERE mo.decided = 'approved' AND mo.ai_says <> 'admin' AND a.status = 'approved'
 ) q ORDER BY 5 DESC NULLS LAST
 LIMIT 300;
END $function$;
REVOKE ALL ON FUNCTION public.admin_approved_items() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_approved_items() TO authenticated;

-- Delete something an admin approved earlier (Ask posts and answers: anything, as on the Ask pages).
CREATE FUNCTION public.admin_delete_approved(_kind text, _id uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE n integer;
BEGIN
 IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Forbidden'; END IF;
 IF _kind = 'message' THEN DELETE FROM public.messages WHERE id = _id AND admin_approved_at IS NOT NULL;
 ELSIF _kind IN ('reply_owner', 'reply_sender') THEN DELETE FROM public.message_replies WHERE id = _id AND admin_approved_at IS NOT NULL;
 ELSIF _kind = 'answer' THEN DELETE FROM public.public_answers WHERE id = _id AND admin_approved_at IS NOT NULL;
 ELSIF _kind = 'ask_post' THEN DELETE FROM public.ask_posts WHERE id = _id;
 ELSIF _kind = 'ask_answer' THEN DELETE FROM public.ask_answers WHERE id = _id;
 ELSE RAISE EXCEPTION 'not_allowed'; END IF;
 GET DIAGNOSTICS n = ROW_COUNT;
 IF n = 0 THEN RAISE EXCEPTION 'not_found'; END IF;
 IF _kind IN ('ask_post', 'ask_answer') THEN
  DELETE FROM public.ask_votes v WHERE v.kind = substr(_kind, 5) AND v.item_id = _id;
  DELETE FROM public.ask_reports r WHERE r.kind = substr(_kind, 5) AND r.item_id = _id;
 END IF;
END $function$;
REVOKE ALL ON FUNCTION public.admin_delete_approved(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_delete_approved(text, uuid) TO authenticated;