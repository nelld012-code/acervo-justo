CREATE OR REPLACE FUNCTION public.prazo_merge_on_insert()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $function$
BEGIN
  NEW.dedupe_key := public.prazo_normalize_identity(NEW.nome) || '|'
    || public.prazo_normalize_identity(coalesce(NEW.numero_processo, '')) || '|'
    || coalesce(NEW.data_limite::text, '<null>');
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.dedupe_key, 0));
  -- Somente aditivo: mesma identidade já existente é ignorada, sem alterar o registro existente.
  IF EXISTS (SELECT 1 FROM public.prazos WHERE dedupe_key = NEW.dedupe_key) THEN
    RETURN NULL;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.prazo_merge_on_update()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $function$
DECLARE candidate_key text;
BEGIN
  candidate_key := public.prazo_normalize_identity(NEW.nome) || '|'
    || public.prazo_normalize_identity(coalesce(NEW.numero_processo, '')) || '|'
    || coalesce(NEW.data_limite::text, '<null>');
  NEW.dedupe_key := candidate_key;
  IF candidate_key IS DISTINCT FROM OLD.dedupe_key THEN
    PERFORM pg_advisory_xact_lock(hashtextextended(candidate_key, 0));
    IF EXISTS (SELECT 1 FROM public.prazos WHERE dedupe_key = candidate_key AND id <> OLD.id) THEN
      RAISE EXCEPTION 'Já existe outro prazo com o mesmo nome, número do processo e data limite.' USING ERRCODE = '23505';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;