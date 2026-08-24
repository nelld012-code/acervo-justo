CREATE TABLE public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  recipient_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body text NOT NULL,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '60 days')
);

GRANT SELECT, INSERT, UPDATE ON public.messages TO authenticated;
GRANT ALL ON public.messages TO service_role;

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Participantes leem suas mensagens"
ON public.messages FOR SELECT TO authenticated
USING ((auth.uid() = sender_id OR auth.uid() = recipient_id) AND expires_at > now());

CREATE POLICY "Usuario envia como ele mesmo"
ON public.messages FOR INSERT TO authenticated
WITH CHECK (auth.uid() = sender_id AND sender_id <> recipient_id);

CREATE POLICY "Destinatario marca como lida"
ON public.messages FOR UPDATE TO authenticated
USING (auth.uid() = recipient_id)
WITH CHECK (auth.uid() = recipient_id);

CREATE INDEX idx_messages_pair ON public.messages (sender_id, recipient_id, created_at DESC);
CREATE INDEX idx_messages_recipient_unread ON public.messages (recipient_id) WHERE read_at IS NULL;
CREATE INDEX idx_messages_expires_at ON public.messages (expires_at);

CREATE OR REPLACE FUNCTION public.list_message_contacts()
RETURNS TABLE (id uuid, nome text, cargo text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.nome, p.cargo
  FROM public.profiles p
  WHERE auth.uid() IS NOT NULL AND p.id <> auth.uid()
  ORDER BY p.nome
$$;

REVOKE ALL ON FUNCTION public.list_message_contacts() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_message_contacts() TO authenticated;

CREATE OR REPLACE FUNCTION public.purge_expired_messages()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.messages WHERE expires_at <= now()
$$;

REVOKE ALL ON FUNCTION public.purge_expired_messages() FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.messages_purge_on_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.messages WHERE expires_at <= now();
  RETURN NULL;
END;
$$;

CREATE TRIGGER messages_purge_expired
AFTER INSERT ON public.messages
FOR EACH STATEMENT EXECUTE FUNCTION public.messages_purge_on_insert();

DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_cron;
  PERFORM cron.schedule('purge-expired-messages', '0 3 * * *', 'SELECT public.purge_expired_messages()');
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron indisponivel: limpeza por gatilho permanece ativa';
END;
$$;

ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;