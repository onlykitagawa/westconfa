CREATE TABLE public.message_trackers (
  token_hash text PRIMARY KEY,
  message_id uuid NULL UNIQUE REFERENCES public.messages(id) ON DELETE SET NULL,
  final_state text NULL CHECK (final_state IN ('not_delivered', 'delivered', 'seen')),
  created_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON public.message_trackers FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.message_trackers TO service_role;
ALTER TABLE public.message_trackers ENABLE ROW LEVEL SECURITY;
CREATE INDEX message_trackers_created_idx ON public.message_trackers(created_at);

CREATE FUNCTION public.record_message_final_state()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
 UPDATE public.message_trackers
 SET final_state = CASE WHEN OLD.status <> 'approved' THEN 'not_delivered' WHEN OLD.read_at IS NOT NULL THEN 'seen' ELSE 'delivered' END
 WHERE message_id = OLD.id;
 RETURN OLD;
END $function$;
REVOKE ALL ON FUNCTION public.record_message_final_state() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER messages_record_final_state BEFORE DELETE ON public.messages
 FOR EACH ROW EXECUTE FUNCTION public.record_message_final_state();

CREATE FUNCTION public.attach_message_tracker(_message_id uuid, _token_hash text)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
 INSERT INTO public.message_trackers(token_hash, message_id) VALUES (_token_hash, _message_id);
END $function$;
REVOKE ALL ON FUNCTION public.attach_message_tracker(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.attach_message_tracker(uuid, text) TO service_role;

CREATE FUNCTION public.message_status(_token text)
 RETURNS TABLE(state text, sent_at timestamptz, body text)
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
  m.body
 FROM public.message_trackers t
 LEFT JOIN public.messages m ON m.id = t.message_id
 WHERE t.token_hash = encode(sha256(convert_to(_token, 'UTF8')), 'hex');
END $function$;
REVOKE ALL ON FUNCTION public.message_status(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.message_status(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.purge_expired()
 RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path TO 'public'
AS $function$
  DELETE FROM public.messages WHERE created_at < now() - make_interval(days => public.message_retention_days());
  DELETE FROM public.message_trackers WHERE created_at < now() - make_interval(days => public.message_retention_days());
  DELETE FROM public.rate_events WHERE created_at < now() - interval '24 hours';
  DELETE FROM public.login_attempts WHERE created_at < now() - interval '24 hours';
$function$;