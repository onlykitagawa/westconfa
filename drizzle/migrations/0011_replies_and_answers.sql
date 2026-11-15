ALTER TABLE public.messages ADD COLUMN replies_closed boolean NOT NULL DEFAULT false;

CREATE TABLE public.message_replies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  author text NOT NULL CHECK (author IN ('owner', 'sender')),
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 500),
  status text NOT NULL DEFAULT 'approved' CHECK (status IN ('approved', 'pending')),
  reason text NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX message_replies_message_idx ON public.message_replies(message_id, created_at);
REVOKE ALL ON public.message_replies FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.message_replies TO authenticated;
GRANT ALL ON public.message_replies TO service_role;
ALTER TABLE public.message_replies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Recipient reads own thread" ON public.message_replies FOR SELECT TO authenticated
 USING ((status = 'approved' OR author = 'owner') AND EXISTS (SELECT 1 FROM public.messages m WHERE m.id = message_id AND m.recipient_id = auth.uid() AND m.status = 'approved' AND NOT m.hidden));
CREATE POLICY "Admins read replies" ON public.message_replies FOR SELECT TO authenticated
 USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.public_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  question text NOT NULL CHECK (char_length(question) BETWEEN 1 AND 1000),
  answer text NOT NULL CHECK (char_length(answer) BETWEEN 1 AND 500),
  status text NOT NULL DEFAULT 'approved' CHECK (status IN ('approved', 'pending')),
  reason text NULL,
  hidden boolean NOT NULL DEFAULT false,
  report_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_id, question)
);
CREATE INDEX public_answers_owner_idx ON public.public_answers(owner_id, created_at DESC);
REVOKE ALL ON public.public_answers FROM PUBLIC, anon, authenticated;
GRANT SELECT, DELETE ON public.public_answers TO authenticated;
GRANT ALL ON public.public_answers TO service_role;
ALTER TABLE public.public_answers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner reads own answers" ON public.public_answers FOR SELECT TO authenticated USING (owner_id = auth.uid());
CREATE POLICY "Owner deletes own answers" ON public.public_answers FOR DELETE TO authenticated USING (owner_id = auth.uid());
CREATE POLICY "Admins read answers" ON public.public_answers FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.answer_reports (
  answer_id uuid NOT NULL REFERENCES public.public_answers(id) ON DELETE CASCADE,
  reporter_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (answer_id, reporter_id)
);
REVOKE ALL ON public.answer_reports FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.answer_reports TO service_role;
ALTER TABLE public.answer_reports ENABLE ROW LEVEL SECURITY;

CREATE FUNCTION public.add_owner_reply(_owner uuid, _message_id uuid, _body text, _status text, _reason text)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE m public.messages%ROWTYPE; rid uuid;
BEGIN
 SELECT * INTO m FROM public.messages WHERE id = _message_id FOR UPDATE;
 IF NOT FOUND OR m.recipient_id <> _owner OR m.status <> 'approved' OR m.hidden THEN RAISE EXCEPTION 'not_allowed'; END IF;
 IF m.replies_closed THEN RAISE EXCEPTION 'thread_closed'; END IF;
 IF EXISTS (SELECT 1 FROM public.message_replies WHERE message_id = _message_id AND author = 'owner' AND status = 'pending') THEN RAISE EXCEPTION 'pending_exists'; END IF;
 IF (SELECT count(*) FROM public.message_replies WHERE message_id = _message_id) >= 30 THEN RAISE EXCEPTION 'thread_full'; END IF;
 INSERT INTO public.message_replies(message_id, author, body, status, reason) VALUES (_message_id, 'owner', _body, _status, left(_reason, 140)) RETURNING id INTO rid;
 RETURN rid;
END $function$;
REVOKE ALL ON FUNCTION public.add_owner_reply(uuid, uuid, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.add_owner_reply(uuid, uuid, text, text, text) TO service_role;

CREATE FUNCTION public.add_sender_reply(_token_hash text, _body text, _status text, _reason text)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE m public.messages%ROWTYPE; rid uuid; final_status text := _status;
BEGIN
 SELECT msg.* INTO m FROM public.message_trackers t JOIN public.messages msg ON msg.id = t.message_id WHERE t.token_hash = _token_hash FOR UPDATE OF msg;
 IF NOT FOUND OR m.status <> 'approved' OR m.hidden THEN RAISE EXCEPTION 'not_allowed'; END IF;
 IF m.replies_closed THEN RAISE EXCEPTION 'thread_closed'; END IF;
 IF coalesce((SELECT r.author FROM public.message_replies r WHERE r.message_id = m.id AND r.status = 'approved' ORDER BY r.created_at DESC, r.id DESC LIMIT 1), '') <> 'owner' THEN RAISE EXCEPTION 'not_your_turn'; END IF;
 IF EXISTS (SELECT 1 FROM public.message_replies WHERE message_id = m.id AND author = 'sender' AND status = 'pending') THEN RAISE EXCEPTION 'pending_exists'; END IF;
 IF (SELECT count(*) FROM public.message_replies WHERE message_id = m.id) >= 30 THEN RAISE EXCEPTION 'thread_full'; END IF;
 IF final_status = 'approved' AND coalesce((SELECT value = 'true'::jsonb FROM public.app_settings WHERE key = 'review_all_messages'), true) THEN final_status := 'pending'; END IF;
 INSERT INTO public.message_replies(message_id, author, body, status, reason) VALUES (m.id, 'sender', _body, final_status, left(_reason, 140)) RETURNING id INTO rid;
 RETURN rid;
END $function$;
REVOKE ALL ON FUNCTION public.add_sender_reply(text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.add_sender_reply(text, text, text, text) TO service_role;

CREATE FUNCTION public.message_thread(_token text)
 RETURNS TABLE(id uuid, author text, body text, created_at timestamptz, status text, closed boolean, can_reply boolean)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
 IF _token IS NULL OR char_length(_token) < 32 OR char_length(_token) > 64 THEN RETURN; END IF;
 RETURN QUERY
 SELECT r.id, r.author, r.body, r.created_at, r.status, m.replies_closed,
  (NOT m.replies_closed
   AND coalesce((SELECT x.author FROM public.message_replies x WHERE x.message_id = m.id AND x.status = 'approved' ORDER BY x.created_at DESC, x.id DESC LIMIT 1), '') = 'owner'
   AND NOT EXISTS (SELECT 1 FROM public.message_replies x WHERE x.message_id = m.id AND x.author = 'sender' AND x.status = 'pending')
   AND (SELECT count(*) FROM public.message_replies x WHERE x.message_id = m.id) < 30)
 FROM public.message_trackers t
 JOIN public.messages m ON m.id = t.message_id AND m.status = 'approved' AND NOT m.hidden
 JOIN public.message_replies r ON r.message_id = m.id AND (r.status = 'approved' OR r.author = 'sender')
 WHERE t.token_hash = encode(sha256(convert_to(_token, 'UTF8')), 'hex')
 ORDER BY r.created_at, r.id;
END $function$;
REVOKE ALL ON FUNCTION public.message_thread(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.message_thread(text) TO anon, authenticated;

CREATE FUNCTION public.set_thread_closed(_message_id uuid, _closed boolean)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Forbidden'; END IF;
 UPDATE public.messages SET replies_closed = _closed WHERE id = _message_id AND recipient_id = auth.uid() AND status = 'approved' AND NOT hidden;
 IF NOT FOUND THEN RAISE EXCEPTION 'not_allowed'; END IF;
END $function$;
REVOKE ALL ON FUNCTION public.set_thread_closed(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_thread_closed(uuid, boolean) TO authenticated;

CREATE FUNCTION public.publish_answer(_owner uuid, _message_id uuid, _answer text, _status text, _reason text)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE m public.messages%ROWTYPE; aid uuid;
BEGIN
 SELECT * INTO m FROM public.messages WHERE id = _message_id;
 IF NOT FOUND OR m.recipient_id <> _owner OR m.status <> 'approved' OR m.hidden THEN RAISE EXCEPTION 'not_allowed'; END IF;
 IF (SELECT count(*) FROM public.public_answers WHERE owner_id = _owner) >= 100 THEN RAISE EXCEPTION 'answer_limit'; END IF;
 INSERT INTO public.public_answers(owner_id, question, answer, status, reason) VALUES (_owner, m.body, _answer, _status, left(_reason, 140)) RETURNING id INTO aid;
 RETURN aid;
END $function$;
REVOKE ALL ON FUNCTION public.publish_answer(uuid, uuid, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.publish_answer(uuid, uuid, text, text, text) TO service_role;

CREATE FUNCTION public.get_public_answers(_username text)
 RETURNS TABLE(id uuid, question text, answer text, created_at timestamptz)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
 SELECT a.id, a.question, a.answer, a.created_at
 FROM public.public_answers a JOIN public.profiles p ON p.id = a.owner_id
 WHERE p.username = lower(btrim(coalesce(_username, ''))) AND NOT p.suspended AND a.status = 'approved' AND NOT a.hidden
 ORDER BY a.created_at DESC
 LIMIT 50;
$function$;
REVOKE ALL ON FUNCTION public.get_public_answers(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_answers(text) TO anon, authenticated;

CREATE FUNCTION public.report_answer(_answer_id uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE n integer;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Forbidden'; END IF;
 IF NOT EXISTS (SELECT 1 FROM public.public_answers WHERE id = _answer_id AND status = 'approved' AND owner_id <> auth.uid()) THEN RAISE EXCEPTION 'not_allowed'; END IF;
 INSERT INTO public.answer_reports(answer_id, reporter_id) VALUES (_answer_id, auth.uid()) ON CONFLICT DO NOTHING;
 SELECT count(*) INTO n FROM public.answer_reports WHERE answer_id = _answer_id;
 UPDATE public.public_answers SET report_count = n, hidden = (hidden OR n >= 2) WHERE id = _answer_id;
END $function$;
REVOKE ALL ON FUNCTION public.report_answer(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.report_answer(uuid) TO authenticated;

CREATE FUNCTION public.admin_review_queue()
 RETURNS TABLE(kind text, id uuid, body text, context text, reason text, reports integer, created_at timestamptz)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
 IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Forbidden'; END IF;
 RETURN QUERY
 SELECT * FROM (
  SELECT 'reply_' || r.author, r.id, r.body, m.body, r.reason, 0, r.created_at
  FROM public.message_replies r JOIN public.messages m ON m.id = r.message_id WHERE r.status = 'pending'
  UNION ALL
  SELECT CASE WHEN a.status = 'pending' THEN 'answer_pending' ELSE 'answer_reported' END, a.id, a.answer, a.question, a.reason, a.report_count, a.created_at
  FROM public.public_answers a WHERE a.status = 'pending' OR a.report_count > 0
 ) q ORDER BY 7;
END $function$;
REVOKE ALL ON FUNCTION public.admin_review_queue() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_review_queue() TO authenticated;

CREATE FUNCTION public.admin_decide_reply(_id uuid, _approve boolean)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
 IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Forbidden'; END IF;
 IF _approve THEN UPDATE public.message_replies SET status = 'approved' WHERE id = _id AND status = 'pending';
 ELSE DELETE FROM public.message_replies WHERE id = _id AND status = 'pending'; END IF;
END $function$;
REVOKE ALL ON FUNCTION public.admin_decide_reply(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_decide_reply(uuid, boolean) TO authenticated;

CREATE FUNCTION public.admin_decide_answer(_id uuid, _approve boolean)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
 IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Forbidden'; END IF;
 IF _approve THEN
  DELETE FROM public.answer_reports WHERE answer_id = _id;
  UPDATE public.public_answers SET status = 'approved', hidden = false, report_count = 0 WHERE id = _id;
 ELSE DELETE FROM public.public_answers WHERE id = _id; END IF;
END $function$;
REVOKE ALL ON FUNCTION public.admin_decide_answer(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_decide_answer(uuid, boolean) TO authenticated;