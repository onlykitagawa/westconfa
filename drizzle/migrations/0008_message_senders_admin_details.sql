CREATE TABLE public.message_senders (
  message_id uuid PRIMARY KEY REFERENCES public.messages(id) ON DELETE CASCADE,
  sender_user_id uuid NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  sender_network_hash text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON public.message_senders FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.message_senders TO service_role;
ALTER TABLE public.message_senders ENABLE ROW LEVEL SECURITY;
CREATE INDEX message_senders_user_idx ON public.message_senders(sender_user_id);
CREATE INDEX message_senders_hash_idx ON public.message_senders(sender_network_hash);

DROP FUNCTION public.store_screened_message(uuid, text, text, text, text, text, text, boolean);
CREATE FUNCTION public.store_screened_message(_recipient_id uuid, _body text, _status text, _source text, _category text, _reason text, _rate_hash text, _anonymous boolean, _sender_user_id uuid, _sender_network_hash text)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE message_uuid uuid; final_status text := _status; final_source text := _source;
BEGIN
 IF final_status = 'approved' AND coalesce((SELECT value = 'true'::jsonb FROM public.app_settings WHERE key = 'review_all_messages'), true) THEN
 final_status := 'pending'; final_source := 'review_all';
 END IF;
 INSERT INTO public.messages(recipient_id,body,status) VALUES (_recipient_id,_body,final_status) RETURNING id INTO message_uuid;
 IF final_status = 'pending' THEN
 INSERT INTO public.message_moderation(message_id,category,reason,source) VALUES (message_uuid,_category,left(_reason,140),final_source);
 END IF;
 INSERT INTO public.message_senders(message_id,sender_user_id,sender_network_hash) VALUES (message_uuid,_sender_user_id,_sender_network_hash);
 INSERT INTO public.rate_events(ip_hash,recipient_id,anonymous) VALUES (_rate_hash,_recipient_id,_anonymous);
 RETURN message_uuid;
END $function$;
REVOKE ALL ON FUNCTION public.store_screened_message(uuid, text, text, text, text, text, text, boolean, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.store_screened_message(uuid, text, text, text, text, text, text, boolean, uuid, text) TO service_role;

CREATE FUNCTION public.admin_message_details(_message_ids uuid[])
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
 WHERE m.id = ANY(_message_ids) AND (m.status = 'pending' OR m.report_count > 0);
END $function$;
REVOKE ALL ON FUNCTION public.admin_message_details(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_message_details(uuid[]) TO authenticated;

DROP POLICY "Admins read all messages" ON public.messages;
CREATE POLICY "Admins read held or reported messages" ON public.messages FOR SELECT TO authenticated
 USING (public.has_role(auth.uid(), 'admin'::app_role) AND (status = 'pending' OR report_count > 0));