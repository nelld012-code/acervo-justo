CREATE OR REPLACE FUNCTION public.prazo_merge_on_insert()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  conflict_id uuid;
BEGIN
  NEW.dedupe_key :=
    public.prazo_normalize_identity(NEW.nome)
    || '|'
    || public.prazo_normalize_identity(coalesce(NEW.numero_processo, ''))
    || '|'
    || coalesce(NEW.data_limite::text, '<null>');

  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.dedupe_key, 0));

  SELECT id
  INTO conflict_id
  FROM public.prazos
  WHERE dedupe_key = NEW.dedupe_key
  LIMIT 1;

  IF conflict_id IS NOT NULL THEN
    UPDATE public.prazos
    SET
      observacao = public.prazo_merge_observations(ARRAY[observacao, NEW.observacao]),
      parte = CASE
        WHEN length(trim(coalesce(NEW.parte, ''))) > length(trim(coalesce(parte, '')))
          THEN NEW.parte ELSE parte END,
      advogado = CASE
        WHEN length(trim(coalesce(NEW.advogado, ''))) > length(trim(coalesce(advogado, '')))
          THEN NEW.advogado ELSE advogado END,
      status = CASE WHEN NEW.status = 'Concluído' THEN NEW.status ELSE status END,
      data_conclusao = coalesce(data_conclusao, NEW.data_conclusao),
      lembrete_ativo = coalesce(NEW.lembrete_ativo, lembrete_ativo),
      antecedencia_dias = coalesce(NEW.antecedencia_dias, antecedencia_dias),
      repetir_alerta_diariamente = coalesce(NEW.repetir_alerta_diariamente, repetir_alerta_diariamente),
      updated_at = now()
    WHERE id = conflict_id;

    RETURN NULL;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.prazo_merge_on_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  candidate_key text;
  conflict_id uuid;
BEGIN
  candidate_key :=
    public.prazo_normalize_identity(NEW.nome)
    || '|'
    || public.prazo_normalize_identity(coalesce(NEW.numero_processo, ''))
    || '|'
    || coalesce(NEW.data_limite::text, '<null>');

  NEW.dedupe_key := candidate_key;
  PERFORM pg_advisory_xact_lock(hashtextextended(candidate_key, 0));

  IF candidate_key IS DISTINCT FROM OLD.dedupe_key THEN
    SELECT id
    INTO conflict_id
    FROM public.prazos
    WHERE dedupe_key = candidate_key
      AND id <> OLD.id
    LIMIT 1;

    IF conflict_id IS NOT NULL THEN
      UPDATE public.prazos
      SET
        observacao = public.prazo_merge_observations(ARRAY[observacao, NEW.observacao]),
        parte = CASE
          WHEN length(trim(coalesce(NEW.parte, ''))) > length(trim(coalesce(parte, '')))
            THEN NEW.parte ELSE parte END,
        advogado = CASE
          WHEN length(trim(coalesce(NEW.advogado, ''))) > length(trim(coalesce(advogado, '')))
            THEN NEW.advogado ELSE advogado END,
        status = CASE WHEN NEW.status = 'Concluído' THEN NEW.status ELSE status END,
        data_conclusao = coalesce(data_conclusao, NEW.data_conclusao),
        lembrete_ativo = coalesce(NEW.lembrete_ativo, lembrete_ativo),
        antecedencia_dias = coalesce(NEW.antecedencia_dias, antecedencia_dias),
        repetir_alerta_diariamente = coalesce(NEW.repetir_alerta_diariamente, repetir_alerta_diariamente),
        updated_at = now()
      WHERE id = conflict_id;

      RETURN NULL;
    END IF;
  END IF;

  IF NEW.observacao IS DISTINCT FROM OLD.observacao THEN
    NEW.observacao := public.prazo_merge_observations(ARRAY[OLD.observacao, NEW.observacao]);
  END IF;

  RETURN NEW;
END;
$$;

NOTIFY pgrst, 'reload schema';