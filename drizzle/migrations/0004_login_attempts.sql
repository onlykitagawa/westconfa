CREATE TABLE public.login_attempts (
  id bigserial PRIMARY KEY,
  email_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX login_attempts_hash_idx ON public.login_attempts (email_hash, created_at);
GRANT ALL ON public.login_attempts TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.login_attempts_id_seq TO service_role;
ALTER TABLE public.login_attempts ENABLE ROW LEVEL SECURITY;

COMMENT ON COLUMN public.rate_events.ip_hash IS 'Salted one-way hash of the sender key: network address for visitors, account id for signed-in senders. Never linked to messages; purged after 24h.';

CREATE OR REPLACE FUNCTION public.purge_expired() RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  DELETE FROM public.messages WHERE created_at < now() - make_interval(days => public.message_retention_days());
  DELETE FROM public.rate_events WHERE created_at < now() - interval '24 hours';
  DELETE FROM public.login_attempts WHERE created_at < now() - interval '24 hours';
$$;