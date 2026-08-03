REVOKE ALL ON FUNCTION public.handle_new_user_profile() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_role_from_cargo() FROM PUBLIC, anon, authenticated;