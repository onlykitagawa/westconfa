ALTER TABLE public.messages ADD COLUMN status text NOT NULL DEFAULT 'approved' CONSTRAINT messages_status_check CHECK (status IN ('approved', 'pending'));
CREATE TABLE public.message_moderation (
 message_id uuid PRIMARY KEY REFERENCES public.messages(id) ON DELETE CASCADE,
 category text,
 reason text,
 source text NOT NULL CHECK (source IN ('ai','review_all','ai_error')),
 created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.message_moderation TO authenticated;
GRANT ALL ON public.message_moderation TO service_role;
ALTER TABLE public.message_moderation ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read moderation" ON public.message_moderation FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE TABLE public.app_settings (key text PRIMARY KEY, value jsonb NOT NULL);
GRANT SELECT, UPDATE ON public.app_settings TO authenticated;
GRANT ALL ON public.app_settings TO service_role;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read settings" ON public.app_settings FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins update settings" ON public.app_settings FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
DROP POLICY "Recipient reads visible" ON public.messages;
DROP POLICY "Recipient marks read" ON public.messages;
DROP POLICY "Recipient deletes" ON public.messages;
DROP POLICY "Admin reads reported" ON public.messages;
CREATE POLICY "Recipient reads visible" ON public.messages FOR SELECT TO authenticated USING (recipient_id = auth.uid() AND NOT hidden AND status = 'approved');
CREATE POLICY "Recipient marks read" ON public.messages FOR UPDATE TO authenticated USING (recipient_id = auth.uid() AND status = 'approved') WITH CHECK (recipient_id = auth.uid() AND status = 'approved');
CREATE POLICY "Recipient deletes" ON public.messages FOR DELETE TO authenticated USING (recipient_id = auth.uid() AND status = 'approved');
CREATE POLICY "Admins read all messages" ON public.messages FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
REVOKE UPDATE ON public.messages FROM authenticated;
GRANT UPDATE (read_at) ON public.messages TO authenticated;
CREATE OR REPLACE FUNCTION public.admin_decide_message(_message_id uuid, _approve boolean) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
 IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Forbidden'; END IF;
 IF _approve THEN UPDATE public.messages SET status = 'approved' WHERE id = _message_id AND status = 'pending';
 ELSE DELETE FROM public.messages WHERE id = _message_id AND status = 'pending'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.admin_decide_message(uuid,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_decide_message(uuid,boolean) TO authenticated;
CREATE OR REPLACE FUNCTION public.store_screened_message(_recipient_id uuid, _body text, _status text, _source text, _category text, _reason text, _rate_hash text, _anonymous boolean) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE message_uuid uuid; final_status text := _status; final_source text := _source;
BEGIN
 IF final_status = 'approved' AND coalesce((SELECT value = 'true'::jsonb FROM public.app_settings WHERE key = 'review_all_messages'), true) THEN
 final_status := 'pending'; final_source := 'review_all';
 END IF;
 INSERT INTO public.messages(recipient_id,body,status) VALUES (_recipient_id,_body,final_status) RETURNING id INTO message_uuid;
 IF final_status = 'pending' THEN
 INSERT INTO public.message_moderation(message_id,category,reason,source) VALUES (message_uuid,_category,left(_reason,140),final_source);
 END IF;
 INSERT INTO public.rate_events(ip_hash,recipient_id,anonymous) VALUES (_rate_hash,_recipient_id,_anonymous);
 RETURN message_uuid;
END $$;
REVOKE ALL ON FUNCTION public.store_screened_message(uuid,text,text,text,text,text,text,boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.store_screened_message(uuid,text,text,text,text,text,text,boolean) TO service_role;
CREATE OR REPLACE FUNCTION public.report_message(_message_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM public.messages WHERE id = _message_id AND recipient_id = auth.uid() AND status = 'approved' AND NOT hidden) THEN RAISE EXCEPTION 'Not allowed'; END IF;
 INSERT INTO public.message_reports(message_id,reporter_id) VALUES (_message_id,auth.uid()) ON CONFLICT DO NOTHING;
 UPDATE public.messages SET report_count = (SELECT count(*) FROM public.message_reports WHERE message_id = _message_id), hidden = true, reviewed = false WHERE id = _message_id;
END $$;
CREATE OR REPLACE FUNCTION public.admin_stats() RETURNS json LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE r json;
BEGIN
 IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Forbidden'; END IF;
 SELECT json_build_object(
 'users',(SELECT count(*) FROM public.profiles),
 'active_links',(SELECT count(*) FROM public.profiles WHERE username IS NOT NULL),
 'messages',(SELECT count(*) FROM public.messages),
 'open_reports',(SELECT count(*) FROM public.messages WHERE report_count > 0 AND NOT reviewed),
 'pending_review',(SELECT count(*) FROM public.messages WHERE status = 'pending'),
 'per_day',(SELECT coalesce(json_agg(json_build_object('day',d::date,'count',c) ORDER BY d),'[]'::json) FROM (
 SELECT g AS d,(SELECT count(*) FROM public.messages m WHERE m.created_at::date = g::date) AS c FROM generate_series(current_date-13,current_date,interval '1 day') g) s)
 ) INTO r;
 RETURN r;
END $$;