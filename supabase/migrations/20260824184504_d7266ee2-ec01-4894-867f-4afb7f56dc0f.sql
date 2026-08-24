ALTER FUNCTION public.purge_expired_messages() SET search_path = public;
ALTER FUNCTION public.messages_purge_on_insert() SET search_path = public;

REVOKE ALL ON FUNCTION public.purge_expired_messages() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.messages_purge_on_insert() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.list_message_contacts() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_message_contacts() TO authenticated;