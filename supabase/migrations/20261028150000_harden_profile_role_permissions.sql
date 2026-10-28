-- Security hardening: prevent self-assignment of privileged roles.
-- Safe to review in source control; this migration must be applied and verified separately.

-- New self-service signups always start with the least-privileged role.
-- Administrative user creation remains supported because admin-users uses service_role
-- and updates the profile after auth.admin.createUser().
CREATE OR REPLACE FUNCTION public.handle_new_user_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, nome, email, cargo)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data ->> 'nome', ''),
    NEW.email,
    'assistente'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- Preserve normal self-service profile edits, but reject a self-service change
-- to cargo. Calls made without an end-user JWT (e.g. trusted service_role
-- operations) remain available to the protected admin-users Edge Function.
CREATE OR REPLACE FUNCTION public.prevent_self_role_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
BEGIN
  IF NEW.cargo IS DISTINCT FROM OLD.cargo
     AND auth.uid() IS NOT NULL
     AND auth.uid() = OLD.id
     AND NOT private.has_cargo(auth.uid(), ARRAY['administrador']) THEN
    RAISE EXCEPTION 'Você não tem permissão para alterar o próprio cargo'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_self_role_change ON public.profiles;
CREATE TRIGGER prevent_self_role_change
BEFORE UPDATE OF cargo ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.prevent_self_role_change();
