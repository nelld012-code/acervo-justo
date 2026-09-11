-- Consolidacao de Prazos por identidade deterministica:
-- nome normalizado + numero_processo normalizado + data_limite (NULL = <null>)
-- Nao une registros com identidade diferente.

CREATE OR REPLACE FUNCTION public.prazo_normalize_identity(value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
STRICT
SET search_path = public
AS $$
  SELECT lower(
    regexp_replace(
      translate(
        trim(value),
        'ÁÀÂÃÄáàâãäÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇç',
        'AAAAAaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCc'
      ),
      '[[:space:]]+',
      ' ',
      'g'
    )
  )
$$;

CREATE OR REPLACE FUNCTION public.prazo_observation_signature(value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
STRICT
SET search_path = public
AS $$
  SELECT trim(
    regexp_replace(
      public.prazo_normalize_identity(
        regexp_replace(value, '[^[:alnum:][:space:]]+', ' ', 'g')
      ),
      '[[:space:]]+',
      ' ',
      'g'
    )
  )
$$;

CREATE OR REPLACE FUNCTION public.prazo_merge_observations(values_to_merge text[])
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  candidate text;
  candidate_sig text;
  existing_sig text;
  selected_texts text[] := ARRAY[]::text[];
  selected_sigs text[] := ARRAY[]::text[];
  redundant boolean;
BEGIN
  FOR candidate IN
    SELECT trim(v)
    FROM unnest(coalesce(values_to_merge, ARRAY[]::text[])) AS t(v)
    WHERE nullif(trim(v), '') IS NOT NULL
    ORDER BY length(trim(v)) DESC, trim(v)
  LOOP
    candidate_sig := public.prazo_observation_signature(candidate);
    redundant := false;

    FOREACH existing_sig IN ARRAY selected_sigs LOOP
      IF candidate_sig = existing_sig
         OR strpos(existing_sig, candidate_sig) > 0
         OR strpos(candidate_sig, existing_sig) > 0
      THEN
        redundant := true;
        EXIT;
      END IF;
    END LOOP;

    IF NOT redundant THEN
      selected_texts := array_append(selected_texts, candidate);
      selected_sigs := array_append(selected_sigs, candidate_sig);
    END IF;
  END LOOP;

  RETURN nullif(array_to_string(selected_texts, ' • '), '');
END;
$$;

ALTER TABLE public.prazos
  ADD COLUMN IF NOT EXISTS dedupe_key text;

CREATE OR REPLACE FUNCTION public.prazo_sync_dedupe_key()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.dedupe_key :=
    public.prazo_normalize_identity(NEW.nome)
    || '|'
    || public.prazo_normalize_identity(coalesce(NEW.numero_processo, ''))
    || '|'
    || coalesce(NEW.data_limite::text, '<null>');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prazo_sync_dedupe_key_trg ON public.prazos;
CREATE TRIGGER prazo_sync_dedupe_key_trg
BEFORE INSERT OR UPDATE OF nome, numero_processo, data_limite
ON public.prazos
FOR EACH ROW
EXECUTE FUNCTION public.prazo_sync_dedupe_key();

UPDATE public.prazos
SET dedupe_key =
  public.prazo_normalize_identity(nome)
  || '|'
  || public.prazo_normalize_identity(coalesce(numero_processo, ''))
  || '|'
  || coalesce(data_limite::text, '<null>');

-- Primeiro consolida informacoes no registro principal de cada grupo.
WITH ranked AS (
  SELECT
    p.*,
    row_number() OVER (
      PARTITION BY dedupe_key
      ORDER BY
        (
          (((nullif(trim(coalesce(observacao, '')), '') IS NOT NULL)::int) * 8)
          + (((nullif(trim(coalesce(parte, '')), '') IS NOT NULL)::int) * 4)
          + (((nullif(trim(coalesce(advogado, '')), '') IS NOT NULL)::int) * 4)
          + ((data_conclusao IS NOT NULL)::int)
          + ((created_by IS NOT NULL)::int)
        ) DESC,
        length(coalesce(observacao, '')) DESC,
        created_at ASC,
        id ASC
    ) AS rn
  FROM public.prazos p
), grouped AS (
  SELECT
    dedupe_key,
    (array_agg(id ORDER BY rn))[1] AS keeper_id,
    public.prazo_merge_observations(array_agg(observacao ORDER BY rn)) AS merged_observacao,
    (array_agg(nullif(trim(parte), '') ORDER BY length(trim(coalesce(parte, ''))) DESC, rn)
      FILTER (WHERE nullif(trim(parte), '') IS NOT NULL))[1] AS best_parte,
    (array_agg(nullif(trim(advogado), '') ORDER BY length(trim(coalesce(advogado, ''))) DESC, rn)
      FILTER (WHERE nullif(trim(advogado), '') IS NOT NULL))[1] AS best_advogado,
    (array_agg(data_conclusao ORDER BY (data_conclusao IS NULL), rn)
      FILTER (WHERE data_conclusao IS NOT NULL))[1] AS best_data_conclusao
  FROM ranked
  GROUP BY dedupe_key
  HAVING count(*) > 1
)
UPDATE public.prazos p
SET
  observacao = g.merged_observacao,
  parte = coalesce(nullif(trim(p.parte), ''), g.best_parte, 'Parte Autora'),
  advogado = coalesce(nullif(trim(p.advogado), ''), g.best_advogado),
  data_conclusao = coalesce(p.data_conclusao, g.best_data_conclusao),
  updated_at = now()
FROM grouped g
WHERE p.id = g.keeper_id;

-- Depois remove somente as linhas redundantes ja absorvidas.
WITH ranked AS (
  SELECT
    id,
    row_number() OVER (PARTITION BY dedupe_key ORDER BY created_at ASC, id ASC) AS rn
  FROM public.prazos
)
DELETE FROM public.prazos p
USING ranked r
WHERE p.id = r.id
  AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS prazos_dedupe_key_unique
ON public.prazos (dedupe_key);

-- Importacoes e criacoes manuais duplicadas passam a consolidar automaticamente.
CREATE OR REPLACE FUNCTION public.prazo_merge_on_insert()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  conflict_id uuid;
BEGIN
  IF NEW.dedupe_key IS NULL THEN
    NEW.dedupe_key :=
      public.prazo_normalize_identity(NEW.nome)
      || '|'
      || public.prazo_normalize_identity(coalesce(NEW.numero_processo, ''))
      || '|'
      || coalesce(NEW.data_limite::text, '<null>');
  END IF;

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

DROP TRIGGER IF EXISTS prazo_merge_on_insert_trg ON public.prazos;
CREATE TRIGGER prazo_merge_on_insert_trg
BEFORE INSERT ON public.prazos
FOR EACH ROW
EXECUTE FUNCTION public.prazo_merge_on_insert();

CREATE OR REPLACE FUNCTION public.prazo_merge_on_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  conflict_id uuid;
BEGIN
  IF NEW.dedupe_key IS NULL THEN
    NEW.dedupe_key :=
      public.prazo_normalize_identity(NEW.nome)
      || '|'
      || public.prazo_normalize_identity(coalesce(NEW.numero_processo, ''))
      || '|'
      || coalesce(NEW.data_limite::text, '<null>');
  END IF;

  IF NEW.dedupe_key IS DISTINCT FROM OLD.dedupe_key THEN
    SELECT id
    INTO conflict_id
    FROM public.prazos
    WHERE dedupe_key = NEW.dedupe_key
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
        data_conclusao = coalesce(data_conclusao, NEW.data_conclusao),
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

DROP TRIGGER IF EXISTS prazo_merge_on_update_trg ON public.prazos;
CREATE TRIGGER prazo_merge_on_update_trg
BEFORE UPDATE ON public.prazos
FOR EACH ROW
EXECUTE FUNCTION public.prazo_merge_on_update();

NOTIFY pgrst, 'reload schema';