-- "Ask": a campus-wide anonymous question feed for signed-in students.
-- Posts and answers are shown without any author details. Clients have NO direct access to these
-- tables; everything goes through the functions below (reads for signed-in students, writes
-- through the server with the service role, decisions for admins). Authors are visible to admins
-- only, in the moderation queue.
CREATE TABLE public.ask_posts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 author_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
 body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 500),
 status text NOT NULL DEFAULT 'pending' CHECK (status IN ('approved', 'pending')),
 hidden boolean NOT NULL DEFAULT false,
 report_count integer NOT NULL DEFAULT 0,
 author_seen_at timestamptz NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 published_at timestamptz NULL
);
CREATE INDEX ask_posts_feed_idx ON public.ask_posts(published_at DESC) WHERE status = 'approved' AND NOT hidden;
CREATE INDEX ask_posts_author_idx ON public.ask_posts(author_id, created_at DESC);

CREATE TABLE public.ask_answers (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 post_id uuid NOT NULL REFERENCES public.ask_posts(id) ON DELETE CASCADE,
 author_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
 body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 500),
 status text NOT NULL DEFAULT 'pending' CHECK (status IN ('approved', 'pending')),
 hidden boolean NOT NULL DEFAULT false,
 report_count integer NOT NULL DEFAULT 0,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 published_at timestamptz NULL
);
CREATE INDEX ask_answers_post_idx ON public.ask_answers(post_id, created_at);
CREATE INDEX ask_answers_author_idx ON public.ask_answers(author_id, created_at DESC);

CREATE TABLE public.ask_votes (
 kind text NOT NULL CHECK (kind IN ('post', 'answer')),
 item_id uuid NOT NULL,
 user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY (kind, item_id, user_id)
);
CREATE INDEX ask_votes_item_idx ON public.ask_votes(kind, item_id);

CREATE TABLE public.ask_reports (
 kind text NOT NULL CHECK (kind IN ('post', 'answer')),
 item_id uuid NOT NULL,
 reporter_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY (kind, item_id, reporter_id)
);

-- What the AI thought of each post and answer, and what the admin decided. Kept (with the text)
-- so the AI can later be checked against, and taught from, the admin's real decisions.
CREATE TABLE public.ask_moderation (
 kind text NOT NULL CHECK (kind IN ('post', 'answer')),
 item_id uuid NOT NULL,
 body text NOT NULL,
 ai_says text NOT NULL CHECK (ai_says IN ('allow', 'review', 'unavailable', 'admin')),
 reason text NULL,
 decided text NULL CHECK (decided IN ('approved', 'rejected')),
 created_at timestamptz NOT NULL DEFAULT now(),
 decided_at timestamptz NULL,
 PRIMARY KEY (kind, item_id)
);

-- Spam limits (kept 24 hours).
CREATE TABLE public.ask_events (
 user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
 kind text NOT NULL CHECK (kind IN ('post', 'answer')),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ask_events_user_idx ON public.ask_events(user_id, kind, created_at DESC);

ALTER TABLE public.ask_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ask_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ask_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ask_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ask_moderation ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ask_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ask_posts, public.ask_answers, public.ask_votes, public.ask_reports, public.ask_moderation, public.ask_events FROM PUBLIC, anon, authenticated;

-- "Every post waits for the admin first" (owner, Nov 17). Switch in the admin Ask tab.
INSERT INTO public.app_settings(key, value) VALUES ('ask_review_all', 'true'::jsonb) ON CONFLICT (key) DO NOTHING;

-- Who may use Ask: signed in, not suspended, has a username.
CREATE FUNCTION public.ask_member(_user uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
 SELECT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = _user AND p.username IS NOT NULL AND NOT p.suspended);
$function$;
REVOKE ALL ON FUNCTION public.ask_member(uuid) FROM PUBLIC, anon, authenticated;

-- Server only (service role): stores a screened post. _ai_says is the AI's own opinion; the
-- review-all switch can still hold an "allow". Admins (_trusted) skip limits and review.
CREATE FUNCTION public.store_ask_post(_author uuid, _body text, _ai_says text, _reason text, _trusted boolean)
 RETURNS TABLE(id uuid, status text)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE pid uuid; st text;
BEGIN
 IF NOT public.ask_member(_author) THEN RAISE EXCEPTION 'not_allowed'; END IF;
 IF NOT _trusted AND (SELECT count(*) FROM public.ask_events e WHERE e.user_id = _author AND e.kind = 'post' AND e.created_at > now() - interval '24 hours') >= 5 THEN
  RAISE EXCEPTION 'rate_limited';
 END IF;
 st := CASE WHEN _trusted THEN 'approved'
  WHEN _ai_says = 'allow' AND NOT coalesce((SELECT s.value = 'true'::jsonb FROM public.app_settings s WHERE s.key = 'ask_review_all'), true) THEN 'approved'
  ELSE 'pending' END;
 INSERT INTO public.ask_posts(author_id, body, status, published_at)
 VALUES (_author, _body, st, CASE WHEN st = 'approved' THEN clock_timestamp() END) RETURNING ask_posts.id INTO pid;
 INSERT INTO public.ask_moderation(kind, item_id, body, ai_says, reason, decided, decided_at)
 VALUES ('post', pid, _body, CASE WHEN _trusted THEN 'admin' ELSE _ai_says END, left(_reason, 140), CASE WHEN st = 'approved' THEN 'approved' END, CASE WHEN st = 'approved' THEN now() END);
 IF NOT _trusted THEN INSERT INTO public.ask_events(user_id, kind) VALUES (_author, 'post'); END IF;
 RETURN QUERY SELECT pid, st;
END $function$;
REVOKE ALL ON FUNCTION public.store_ask_post(uuid, text, text, text, boolean) FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.store_ask_answer(_author uuid, _post_id uuid, _body text, _ai_says text, _reason text, _trusted boolean)
 RETURNS TABLE(id uuid, status text)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE aid uuid; st text;
BEGIN
 IF NOT public.ask_member(_author) THEN RAISE EXCEPTION 'not_allowed'; END IF;
 IF NOT EXISTS (SELECT 1 FROM public.ask_posts p WHERE p.id = _post_id AND p.status = 'approved' AND NOT p.hidden) THEN RAISE EXCEPTION 'not_found'; END IF;
 IF NOT _trusted AND (SELECT count(*) FROM public.ask_events e WHERE e.user_id = _author AND e.kind = 'answer' AND e.created_at > now() - interval '24 hours') >= 30 THEN
  RAISE EXCEPTION 'rate_limited';
 END IF;
 st := CASE WHEN _trusted THEN 'approved'
  WHEN _ai_says = 'allow' AND NOT coalesce((SELECT s.value = 'true'::jsonb FROM public.app_settings s WHERE s.key = 'ask_review_all'), true) THEN 'approved'
  ELSE 'pending' END;
 INSERT INTO public.ask_answers(post_id, author_id, body, status, published_at)
 VALUES (_post_id, _author, _body, st, CASE WHEN st = 'approved' THEN clock_timestamp() END) RETURNING ask_answers.id INTO aid;
 INSERT INTO public.ask_moderation(kind, item_id, body, ai_says, reason, decided, decided_at)
 VALUES ('answer', aid, _body, CASE WHEN _trusted THEN 'admin' ELSE _ai_says END, left(_reason, 140), CASE WHEN st = 'approved' THEN 'approved' END, CASE WHEN st = 'approved' THEN now() END);
 IF NOT _trusted THEN INSERT INTO public.ask_events(user_id, kind) VALUES (_author, 'answer'); END IF;
 RETURN QUERY SELECT aid, st;
END $function$;
REVOKE ALL ON FUNCTION public.store_ask_answer(uuid, uuid, text, text, text, boolean) FROM PUBLIC, anon, authenticated;

-- The feed. 'hot' ranks by upvotes and answers, fading with age; 'new' is newest first.
-- Never returns who wrote anything; `mine` only tells the caller about their own posts.
CREATE FUNCTION public.ask_feed(_sort text, _limit integer DEFAULT 30, _offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, body text, published_at timestamptz, score integer, answer_count integer, voted boolean, mine boolean, new_answers boolean)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
 IF NOT public.ask_member(auth.uid()) THEN RAISE EXCEPTION 'Forbidden'; END IF;
 RETURN QUERY
 WITH f AS (
  SELECT p.id, p.body, p.published_at, p.author_id, p.author_seen_at,
   (SELECT count(*)::integer FROM public.ask_votes v WHERE v.kind = 'post' AND v.item_id = p.id) AS score,
   (SELECT count(*)::integer FROM public.ask_answers a WHERE a.post_id = p.id AND a.status = 'approved' AND NOT a.hidden) AS answer_count
  FROM public.ask_posts p
  WHERE p.status = 'approved' AND NOT p.hidden
 )
 SELECT f.id, f.body, f.published_at, f.score, f.answer_count,
  EXISTS (SELECT 1 FROM public.ask_votes v WHERE v.kind = 'post' AND v.item_id = f.id AND v.user_id = auth.uid()),
  f.author_id = auth.uid(),
  f.author_id = auth.uid() AND EXISTS (SELECT 1 FROM public.ask_answers a WHERE a.post_id = f.id AND a.status = 'approved' AND NOT a.hidden AND a.author_id <> auth.uid() AND (f.author_seen_at IS NULL OR a.published_at > f.author_seen_at))
 FROM f
 ORDER BY
  CASE WHEN _sort = 'new' THEN NULL ELSE (f.score + 2 * f.answer_count + 1) / power(extract(epoch FROM (now() - f.published_at)) / 3600 + 2, 1.5) END DESC NULLS LAST,
  f.published_at DESC
 LIMIT least(greatest(coalesce(_limit, 30), 1), 50) OFFSET greatest(coalesce(_offset, 0), 0);
END $function$;
REVOKE ALL ON FUNCTION public.ask_feed(text, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ask_feed(text, integer, integer) TO authenticated;

-- The caller's own posts (including ones waiting for review) with "new answers" marks.
CREATE FUNCTION public.ask_mine()
 RETURNS TABLE(id uuid, body text, status text, created_at timestamptz, published_at timestamptz, score integer, answer_count integer, new_answers boolean)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
 IF NOT public.ask_member(auth.uid()) THEN RAISE EXCEPTION 'Forbidden'; END IF;
 RETURN QUERY
 SELECT p.id, p.body, CASE WHEN p.hidden THEN 'hidden' ELSE p.status END, p.created_at, p.published_at,
  (SELECT count(*)::integer FROM public.ask_votes v WHERE v.kind = 'post' AND v.item_id = p.id),
  (SELECT count(*)::integer FROM public.ask_answers a WHERE a.post_id = p.id AND a.status = 'approved' AND NOT a.hidden),
  (p.status = 'approved' AND NOT p.hidden AND EXISTS (SELECT 1 FROM public.ask_answers a WHERE a.post_id = p.id AND a.status = 'approved' AND NOT a.hidden AND a.author_id <> auth.uid() AND (p.author_seen_at IS NULL OR a.published_at > p.author_seen_at)))
 FROM public.ask_posts p
 WHERE p.author_id = auth.uid()
 ORDER BY p.created_at DESC
 LIMIT 50;
END $function$;
REVOKE ALL ON FUNCTION public.ask_mine() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ask_mine() TO authenticated;

-- One post: visible when approved and not hidden, or to its own author.
CREATE FUNCTION public.ask_post(_id uuid)
 RETURNS TABLE(id uuid, body text, status text, created_at timestamptz, published_at timestamptz, score integer, voted boolean, mine boolean)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
 IF NOT public.ask_member(auth.uid()) THEN RAISE EXCEPTION 'Forbidden'; END IF;
 RETURN QUERY
 SELECT p.id, p.body, CASE WHEN p.hidden THEN 'hidden' ELSE p.status END, p.created_at, p.published_at,
  (SELECT count(*)::integer FROM public.ask_votes v WHERE v.kind = 'post' AND v.item_id = p.id),
  EXISTS (SELECT 1 FROM public.ask_votes v WHERE v.kind = 'post' AND v.item_id = p.id AND v.user_id = auth.uid()),
  p.author_id = auth.uid()
 FROM public.ask_posts p
 WHERE p.id = _id AND ((p.status = 'approved' AND NOT p.hidden) OR p.author_id = auth.uid());
END $function$;
REVOKE ALL ON FUNCTION public.ask_post(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ask_post(uuid) TO authenticated;

-- Answers under a post: approved and visible ones, plus the caller's own waiting ones.
-- by_asker marks answers written by the person who asked (without saying who that is).
CREATE FUNCTION public.ask_answers_of(_post_id uuid)
 RETURNS TABLE(id uuid, body text, status text, created_at timestamptz, published_at timestamptz, score integer, voted boolean, mine boolean, by_asker boolean)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
 IF NOT public.ask_member(auth.uid()) THEN RAISE EXCEPTION 'Forbidden'; END IF;
 IF NOT EXISTS (SELECT 1 FROM public.ask_posts p WHERE p.id = _post_id AND ((p.status = 'approved' AND NOT p.hidden) OR p.author_id = auth.uid())) THEN RETURN; END IF;
 RETURN QUERY
 SELECT a.id, a.body, a.status, a.created_at, a.published_at,
  (SELECT count(*)::integer FROM public.ask_votes v WHERE v.kind = 'answer' AND v.item_id = a.id),
  EXISTS (SELECT 1 FROM public.ask_votes v WHERE v.kind = 'answer' AND v.item_id = a.id AND v.user_id = auth.uid()),
  a.author_id = auth.uid(),
  a.author_id = (SELECT p.author_id FROM public.ask_posts p WHERE p.id = _post_id)
 FROM public.ask_answers a
 WHERE a.post_id = _post_id AND NOT a.hidden AND (a.status = 'approved' OR a.author_id = auth.uid())
 ORDER BY coalesce(a.published_at, a.created_at), a.id
 LIMIT 300;
END $function$;
REVOKE ALL ON FUNCTION public.ask_answers_of(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ask_answers_of(uuid) TO authenticated;

-- Upvote or remove an upvote. Only on visible items, never on your own.
CREATE FUNCTION public.ask_vote(_kind text, _id uuid, _on boolean)
 RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE own_id uuid;
BEGIN
 IF NOT public.ask_member(auth.uid()) THEN RAISE EXCEPTION 'Forbidden'; END IF;
 IF _kind = 'post' THEN SELECT p.author_id INTO own_id FROM public.ask_posts p WHERE p.id = _id AND p.status = 'approved' AND NOT p.hidden;
 ELSIF _kind = 'answer' THEN SELECT a.author_id INTO own_id FROM public.ask_answers a JOIN public.ask_posts p ON p.id = a.post_id WHERE a.id = _id AND a.status = 'approved' AND NOT a.hidden AND p.status = 'approved' AND NOT p.hidden;
 ELSE RAISE EXCEPTION 'not_allowed'; END IF;
 IF own_id IS NULL OR own_id = auth.uid() THEN RAISE EXCEPTION 'not_allowed'; END IF;
 IF _on THEN INSERT INTO public.ask_votes(kind, item_id, user_id) VALUES (_kind, _id, auth.uid()) ON CONFLICT DO NOTHING;
 ELSE DELETE FROM public.ask_votes v WHERE v.kind = _kind AND v.item_id = _id AND v.user_id = auth.uid(); END IF;
 RETURN (SELECT count(*)::integer FROM public.ask_votes v WHERE v.kind = _kind AND v.item_id = _id);
END $function$;
REVOKE ALL ON FUNCTION public.ask_vote(text, uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ask_vote(text, uuid, boolean) TO authenticated;

-- Report. Three different students hide the item until an admin decides.
CREATE FUNCTION public.ask_report(_kind text, _id uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE own_id uuid; n integer;
BEGIN
 IF NOT public.ask_member(auth.uid()) THEN RAISE EXCEPTION 'Forbidden'; END IF;
 IF _kind = 'post' THEN SELECT p.author_id INTO own_id FROM public.ask_posts p WHERE p.id = _id AND p.status = 'approved';
 ELSIF _kind = 'answer' THEN SELECT a.author_id INTO own_id FROM public.ask_answers a WHERE a.id = _id AND a.status = 'approved';
 ELSE RAISE EXCEPTION 'not_allowed'; END IF;
 IF own_id IS NULL OR own_id = auth.uid() THEN RAISE EXCEPTION 'not_allowed'; END IF;
 INSERT INTO public.ask_reports(kind, item_id, reporter_id) VALUES (_kind, _id, auth.uid()) ON CONFLICT DO NOTHING;
 SELECT count(*) INTO n FROM public.ask_reports r WHERE r.kind = _kind AND r.item_id = _id;
 IF _kind = 'post' THEN UPDATE public.ask_posts SET report_count = n, hidden = (hidden OR n >= 3) WHERE ask_posts.id = _id;
 ELSE UPDATE public.ask_answers SET report_count = n, hidden = (hidden OR n >= 3) WHERE ask_answers.id = _id; END IF;
END $function$;
REVOKE ALL ON FUNCTION public.ask_report(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ask_report(text, uuid) TO authenticated;

-- Delete your own post or answer (admins: any).
CREATE FUNCTION public.ask_delete(_kind text, _id uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE n integer;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Forbidden'; END IF;
 IF _kind = 'post' THEN
  DELETE FROM public.ask_posts p WHERE p.id = _id AND (p.author_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
 ELSIF _kind = 'answer' THEN
  DELETE FROM public.ask_answers a WHERE a.id = _id AND (a.author_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
 ELSE RAISE EXCEPTION 'not_allowed'; END IF;
 GET DIAGNOSTICS n = ROW_COUNT;
 IF n = 0 THEN RAISE EXCEPTION 'not_allowed'; END IF;
 DELETE FROM public.ask_votes v WHERE v.kind = _kind AND v.item_id = _id;
 DELETE FROM public.ask_reports r WHERE r.kind = _kind AND r.item_id = _id;
END $function$;
REVOKE ALL ON FUNCTION public.ask_delete(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ask_delete(text, uuid) TO authenticated;

-- The author has now been shown every answer on their post (clears the red mark).
CREATE FUNCTION public.ask_mark_seen(_post_id uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Forbidden'; END IF;
 UPDATE public.ask_posts p
 SET author_seen_at = (SELECT max(a.published_at) FROM public.ask_answers a WHERE a.post_id = p.id AND a.status = 'approved' AND NOT a.hidden)
 WHERE p.id = _post_id AND p.author_id = auth.uid();
END $function$;
REVOKE ALL ON FUNCTION public.ask_mark_seen(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ask_mark_seen(uuid) TO authenticated;

-- Admin queue: waiting and reported posts and answers, with the author (admins only).
CREATE FUNCTION public.admin_ask_queue()
 RETURNS TABLE(kind text, id uuid, body text, post_body text, status text, hidden boolean, reports integer, ai_says text, reason text, author_username text, author_email text, created_at timestamptz)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
 IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Forbidden'; END IF;
 RETURN QUERY
 SELECT 'post'::text, p.id, p.body, NULL::text, p.status, p.hidden, p.report_count, m.ai_says, m.reason, pr.username, pr.email, p.created_at
 FROM public.ask_posts p JOIN public.profiles pr ON pr.id = p.author_id LEFT JOIN public.ask_moderation m ON m.kind = 'post' AND m.item_id = p.id
 WHERE p.status = 'pending' OR p.report_count > 0
 UNION ALL
 SELECT 'answer'::text, a.id, a.body, p.body, a.status, a.hidden, a.report_count, m.ai_says, m.reason, pr.username, pr.email, a.created_at
 FROM public.ask_answers a JOIN public.ask_posts p ON p.id = a.post_id JOIN public.profiles pr ON pr.id = a.author_id LEFT JOIN public.ask_moderation m ON m.kind = 'answer' AND m.item_id = a.id
 WHERE a.status = 'pending' OR a.report_count > 0
 ORDER BY 12
 LIMIT 200;
END $function$;
REVOKE ALL ON FUNCTION public.admin_ask_queue() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_ask_queue() TO authenticated;

-- Approve (publish, clear reports) or reject (delete). The decision is recorded next to the AI's
-- opinion so the AI can later be compared with, and taught from, the admin's choices.
CREATE FUNCTION public.admin_ask_decide(_kind text, _id uuid, _approve boolean)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE n integer;
BEGIN
 IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Forbidden'; END IF;
 IF _kind NOT IN ('post', 'answer') THEN RAISE EXCEPTION 'not_allowed'; END IF;
 IF _approve THEN
  IF _kind = 'post' THEN
   UPDATE public.ask_posts SET status = 'approved', hidden = false, report_count = 0, published_at = coalesce(published_at, clock_timestamp()) WHERE ask_posts.id = _id;
  ELSE
   UPDATE public.ask_answers SET status = 'approved', hidden = false, report_count = 0, published_at = coalesce(published_at, clock_timestamp()) WHERE ask_answers.id = _id;
  END IF;
  GET DIAGNOSTICS n = ROW_COUNT;
  DELETE FROM public.ask_reports r WHERE r.kind = _kind AND r.item_id = _id;
  UPDATE public.ask_moderation SET decided = coalesce(decided, 'approved'), decided_at = coalesce(decided_at, now()) WHERE ask_moderation.kind = _kind AND item_id = _id;
 ELSE
  IF _kind = 'post' THEN DELETE FROM public.ask_posts WHERE ask_posts.id = _id; ELSE DELETE FROM public.ask_answers WHERE ask_answers.id = _id; END IF;
  GET DIAGNOSTICS n = ROW_COUNT;
  DELETE FROM public.ask_votes v WHERE v.kind = _kind AND v.item_id = _id;
  DELETE FROM public.ask_reports r WHERE r.kind = _kind AND r.item_id = _id;
  UPDATE public.ask_moderation SET decided = 'rejected', decided_at = now() WHERE ask_moderation.kind = _kind AND item_id = _id;
 END IF;
 IF n = 0 THEN RAISE EXCEPTION 'not_found'; END IF;
END $function$;
REVOKE ALL ON FUNCTION public.admin_ask_decide(text, uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_ask_decide(text, uuid, boolean) TO authenticated;

-- Posts, answers and moderation notes are deleted after the same 90 days as messages;
-- spam-limit events after 24 hours.
CREATE OR REPLACE FUNCTION public.purge_expired()
 RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path TO 'public'
AS $function$
  DELETE FROM public.messages WHERE created_at < now() - make_interval(days => public.message_retention_days());
  DELETE FROM public.message_trackers WHERE created_at < now() - make_interval(days => public.message_retention_days());
  DELETE FROM public.rate_events WHERE created_at < now() - interval '24 hours';
  DELETE FROM public.login_attempts WHERE created_at < now() - interval '24 hours';
  DELETE FROM public.search_events WHERE created_at < now() - interval '24 hours';
  DELETE FROM public.avatar_events WHERE created_at < now() - interval '24 hours';
  DELETE FROM public.ask_posts WHERE created_at < now() - make_interval(days => public.message_retention_days());
  DELETE FROM public.ask_votes v WHERE v.kind = 'post' AND NOT EXISTS (SELECT 1 FROM public.ask_posts p WHERE p.id = v.item_id);
  DELETE FROM public.ask_votes v WHERE v.kind = 'answer' AND NOT EXISTS (SELECT 1 FROM public.ask_answers a WHERE a.id = v.item_id);
  DELETE FROM public.ask_reports r WHERE (r.kind = 'post' AND NOT EXISTS (SELECT 1 FROM public.ask_posts p WHERE p.id = r.item_id))
   OR (r.kind = 'answer' AND NOT EXISTS (SELECT 1 FROM public.ask_answers a WHERE a.id = r.item_id));
  DELETE FROM public.ask_moderation WHERE created_at < now() - make_interval(days => public.message_retention_days());
  DELETE FROM public.ask_events WHERE created_at < now() - interval '24 hours';
$function$;