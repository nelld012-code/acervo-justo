ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_cargo_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_cargo_check CHECK (cargo IN ('administrador','advogado','secretaria','assistente','financeiro'));

CREATE OR REPLACE FUNCTION public.handle_new_user_profile()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_cargo text;
BEGIN
  v_cargo := COALESCE(NEW.raw_user_meta_data ->> 'cargo', 'assistente');
  IF v_cargo NOT IN ('administrador','advogado','secretaria','assistente','financeiro') THEN
    v_cargo := 'assistente';
  END IF;
  INSERT INTO public.profiles (id, nome, email, cargo)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data ->> 'nome', ''), NEW.email, v_cargo)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$function$;