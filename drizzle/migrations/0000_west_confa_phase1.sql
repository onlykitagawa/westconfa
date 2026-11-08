-- Config constants
CREATE OR REPLACE FUNCTION public.message_retention_days() RETURNS integer LANGUAGE sql IMMUTABLE AS $$ SELECT 90 $$;
CREATE OR REPLACE FUNCTION public.is_allowed_email(_email text) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT lower(coalesce(_email,'')) LIKE '%@wiut.uz' OR lower(coalesce(_email,'')) = 'zukhrdnvoybek@gmail.com'
$$;

-- Roles
CREATE TYPE public.app_role AS ENUM ('admin', 'moderator', 'user');

-- Profiles
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  username text UNIQUE,
  display_name text,
  avatar_url text,
  bio text,
  inbox_paused boolean NOT NULL DEFAULT false,
  suspended boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT username_format CHECK (username IS NULL OR username ~ '^[a-z0-9_]{3,20}$'),
  CONSTRAINT username_reserved CHECK (username IS NULL OR username NOT IN ('admin','inbox','settings','auth','u','api','privacy','terms','guidelines','contact','support','help','westconfa','west_confa','root','system','moderator','wiut')),
  CONSTRAINT display_name_len CHECK (display_name IS NULL OR char_length(display_name) <= 40),
  CONSTRAINT bio_len CHECK (bio IS NULL OR char_length(bio) <= 300)
);
GRANT SELECT ON public.profiles TO authenticated;
GRANT UPDATE (username, display_name, inbox_paused, avatar_url, bio) ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own profile read" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "Own profile update" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role public.app_role NOT NULL,
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own roles read" ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

-- Messages
CREATE TABLE public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 500),
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz,
  hidden boolean NOT NULL DEFAULT false,
  report_count integer NOT NULL DEFAULT 0,
  reviewed boolean NOT NULL DEFAULT false
);
CREATE INDEX messages_recipient_idx ON public.messages (recipient_id, created_at DESC);
CREATE INDEX messages_reported_idx ON public.messages (report_count) WHERE report_count > 0;
GRANT SELECT, DELETE ON public.messages TO authenticated;
GRANT UPDATE (read_at) ON public.messages TO authenticated;
GRANT ALL ON public.messages TO service_role;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Recipient reads visible" ON public.messages FOR SELECT TO authenticated USING (recipient_id = auth.uid() AND hidden = false);
CREATE POLICY "Admin reads reported" ON public.messages FOR SELECT TO authenticated USING (report_count > 0 AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Recipient marks read" ON public.messages FOR UPDATE TO authenticated USING (recipient_id = auth.uid()) WITH CHECK (recipient_id = auth.uid());
CREATE POLICY "Recipient deletes" ON public.messages FOR DELETE TO authenticated USING (recipient_id = auth.uid());
CREATE POLICY "Admin deletes" ON public.messages FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.message_reports (
  message_id uuid NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  reporter_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, reporter_id)
);
GRANT ALL ON public.message_reports TO service_role;
ALTER TABLE public.message_reports ENABLE ROW LEVEL SECURITY;

-- Rate limiting (hashed IP only, purged after 24h)
CREATE TABLE public.rate_events (
  id bigserial PRIMARY KEY,
  ip_hash text NOT NULL,
  recipient_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX rate_events_hash_idx ON public.rate_events (ip_hash, created_at);
GRANT ALL ON public.rate_events TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.rate_events_id_seq TO service_role;
ALTER TABLE public.rate_events ENABLE ROW LEVEL SECURITY;

-- Contact form
CREATE TABLE public.contact_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 100),
  email text NOT NULL CHECK (char_length(email) BETWEEN 3 AND 255),
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT INSERT ON public.contact_messages TO anon, authenticated;
GRANT SELECT, DELETE ON public.contact_messages TO authenticated;
GRANT ALL ON public.contact_messages TO service_role;
ALTER TABLE public.contact_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can submit contact" ON public.contact_messages FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Admin reads contact" ON public.contact_messages FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin deletes contact" ON public.contact_messages FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Auth lifecycle: enforce allowed emails on the backend, create profile, seed first admin
CREATE OR REPLACE FUNCTION public.enforce_allowed_email() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_allowed_email(NEW.email) THEN
    RAISE EXCEPTION 'Only WIUT student emails are allowed';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER enforce_allowed_email_trg BEFORE INSERT OR UPDATE OF email ON auth.users FOR EACH ROW EXECUTE FUNCTION public.enforce_allowed_email();

CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email) VALUES (NEW.id, lower(NEW.email)) ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user') ON CONFLICT DO NOTHING;
  IF lower(NEW.email) = 'zukhrdnvoybek@gmail.com' THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin') ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Public RPCs
CREATE OR REPLACE FUNCTION public.get_public_profile(_username text)
RETURNS TABLE (username text, display_name text, accepting boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.username, coalesce(nullif(p.display_name,''), p.username), (NOT p.inbox_paused AND NOT p.suspended)
  FROM public.profiles p WHERE p.username = lower(_username)
$$;
GRANT EXECUTE ON FUNCTION public.get_public_profile(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.is_username_available(_username text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT NOT EXISTS (SELECT 1 FROM public.profiles WHERE username = lower(_username) AND id <> coalesce(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid))
$$;
REVOKE EXECUTE ON FUNCTION public.is_username_available(text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.is_username_available(text) TO authenticated;

-- Report: queues for admin and hides from the inbox
CREATE OR REPLACE FUNCTION public.report_message(_message_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.messages WHERE id = _message_id AND recipient_id = auth.uid()) THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;
  INSERT INTO public.message_reports (message_id, reporter_id) VALUES (_message_id, auth.uid()) ON CONFLICT DO NOTHING;
  UPDATE public.messages SET report_count = (SELECT count(*) FROM public.message_reports WHERE message_id = _message_id), hidden = true, reviewed = false
  WHERE id = _message_id;
END $$;
REVOKE EXECUTE ON FUNCTION public.report_message(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.report_message(uuid) TO authenticated;

-- Admin RPCs (role checked inside)
CREATE OR REPLACE FUNCTION public.admin_stats()
RETURNS json LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE r json;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Forbidden'; END IF;
  SELECT json_build_object(
    'users', (SELECT count(*) FROM public.profiles),
    'active_links', (SELECT count(*) FROM public.profiles WHERE username IS NOT NULL),
    'messages', (SELECT count(*) FROM public.messages),
    'open_reports', (SELECT count(*) FROM public.messages WHERE report_count > 0 AND NOT reviewed),
    'per_day', (SELECT coalesce(json_agg(json_build_object('day', d::date, 'count', c) ORDER BY d), '[]'::json) FROM (
       SELECT g AS d, (SELECT count(*) FROM public.messages m WHERE m.created_at::date = g::date) AS c
       FROM generate_series(current_date - 13, current_date, interval '1 day') g) s)
  ) INTO r;
  RETURN r;
END $$;
REVOKE EXECUTE ON FUNCTION public.admin_stats() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.admin_stats() TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_list_users(_search text)
RETURNS TABLE (id uuid, email text, username text, display_name text, suspended boolean, created_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Forbidden'; END IF;
  RETURN QUERY SELECT p.id, p.email, p.username, p.display_name, p.suspended, p.created_at FROM public.profiles p
  WHERE _search IS NULL OR _search = '' OR p.username ILIKE '%' || _search || '%' OR p.email ILIKE '%' || _search || '%'
  ORDER BY p.created_at DESC LIMIT 50;
END $$;
REVOKE EXECUTE ON FUNCTION public.admin_list_users(text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.admin_list_users(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_set_suspended(_user_id uuid, _suspended boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Forbidden'; END IF;
  UPDATE public.profiles SET suspended = _suspended WHERE id = _user_id;
END $$;
REVOKE EXECUTE ON FUNCTION public.admin_set_suspended(uuid, boolean) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.admin_set_suspended(uuid, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_review_message(_message_id uuid, _restore boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Forbidden'; END IF;
  UPDATE public.messages SET reviewed = true, hidden = NOT _restore WHERE id = _message_id;
END $$;
REVOKE EXECUTE ON FUNCTION public.admin_review_message(uuid, boolean) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.admin_review_message(uuid, boolean) TO authenticated;

-- Retention
CREATE OR REPLACE FUNCTION public.purge_expired() RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  DELETE FROM public.messages WHERE created_at < now() - make_interval(days => public.message_retention_days());
  DELETE FROM public.rate_events WHERE created_at < now() - interval '24 hours';
$$;
REVOKE EXECUTE ON FUNCTION public.purge_expired() FROM anon, authenticated, public;
GRANT EXECUTE ON FUNCTION public.purge_expired() TO service_role;

CREATE EXTENSION IF NOT EXISTS pg_cron;
