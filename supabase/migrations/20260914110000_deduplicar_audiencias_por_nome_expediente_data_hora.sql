-- Regra de unicidade de Audiências:
-- mesma pessoa/nome + mesmo expediente/processo + mesmo dia + mesmo horário = uma única audiência.
-- Órgão, vara, modalidade, cidade, local e observação NÃO fazem parte da identidade.

CREATE OR REPLACE FUNCTION public.audiencia_normalize_identity(value text)
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

ALTER TABLE public.audiencias
  ADD COLUMN IF NOT EXISTS audiencia_key text;

-- Chave determinística: nome + processo + data + hora.
CREATE OR REPLACE FUNCTION public.audiencia_build_key(
  p_nome text,
  p_numero_processo text,
  p_data date,
  p_hora text
)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT public.audiencia_normalize_identity(coalesce(p_nome, ''))
    || '|'
    || regexp_replace(public.audiencia_normalize_identity(coalesce(p_numero_processo, '')), '[^[:alnum:]]+', '', 'g')
    || '|'
    || coalesce(p_data::text, '<null>')
    || '|'
    || public.audiencia_normalize_identity(coalesce(p_hora, ''));
$$;

CREATE OR REPLACE FUNCTION public.audiencia_sync_key()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.audiencia_key := public.audiencia_build_key(
    NEW.nome,
    NEW.numero_processo,
    NEW.data_audiencia,
    NEW.hora_audiencia
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS audiencia_sync_key_trg ON public.audiencias;
CREATE TRIGGER audiencia_sync_key_trg
BEFORE INSERT OR UPDATE OF nome, numero_processo, data_audiencia, hora_audiencia
ON public.audiencias
FOR EACH ROW
EXECUTE FUNCTION public.audiencia_sync_key();

-- Calcula as chaves atuais.
UPDATE public.audiencias
SET audiencia_key = public.audiencia_build_key(
  nome,
  numero_processo,
  data_audiencia,
  hora_audiencia
);

-- Consolida registros duplicados existentes sem descartar os principais dados opcionais.
WITH ranked AS (
  SELECT
    a.*,
    row_number() OVER (
      PARTITION BY audiencia_key
      ORDER BY
        ((nullif(trim(coalesce(parte, '')), '') IS NOT NULL)::int
         + (nullif(trim(coalesce(advogado, '')), '') IS NOT NULL)::int
         + (nullif(trim(coalesce(orgao_julgador, '')), '') IS NOT NULL)::int
         + (nullif(trim(coalesce(vara, '')), '') IS NOT NULL)::int
         + (nullif(trim(coalesce(cidade_lugar, '')), '') IS NOT NULL)::int
         + (nullif(trim(coalesce(local_audiencia, '')), '') IS NOT NULL)::int
         + (nullif(trim(coalesce(link_virtual, '')), '') IS NOT NULL)::int
         + (nullif(trim(coalesce(observacao, '')), '') IS NOT NULL)::int
        ) DESC,
        created_at ASC,
        id ASC
    ) AS rn
  FROM public.audiencias a
), keepers AS (
  SELECT
    audiencia_key,
    (array_agg(id ORDER BY rn))[1] AS keeper_id,
    (array_agg(nullif(trim(parte), '') ORDER BY length(trim(coalesce(parte, ''))) DESC, rn)
      FILTER (WHERE nullif(trim(parte), '') IS NOT NULL))[1] AS best_parte,
    (array_agg(nullif(trim(advogado), '') ORDER BY length(trim(coalesce(advogado, ''))) DESC, rn)
      FILTER (WHERE nullif(trim(advogado), '') IS NOT NULL))[1] AS best_advogado,
    (array_agg(nullif(trim(orgao_julgador), '') ORDER BY length(trim(coalesce(orgao_julgador, ''))) DESC, rn)
      FILTER (WHERE nullif(trim(orgao_julgador), '') IS NOT NULL))[1] AS best_orgao,
    (array_agg(nullif(trim(vara), '') ORDER BY length(trim(coalesce(vara, ''))) DESC, rn)
      FILTER (WHERE nullif(trim(vara), '') IS NOT NULL))[1] AS best_vara,
    (array_agg(nullif(trim(cidade_lugar), '') ORDER BY length(trim(coalesce(cidade_lugar, ''))) DESC, rn)
      FILTER (WHERE nullif(trim(cidade_lugar), '') IS NOT NULL))[1] AS best_cidade,
    (array_agg(nullif(trim(local_audiencia), '') ORDER BY length(trim(coalesce(local_audiencia, ''))) DESC, rn)
      FILTER (WHERE nullif(trim(local_audiencia, '')) IS NOT NULL))[1] AS best_local,
    (array_agg(nullif(trim(link_virtual), '') ORDER BY length(trim(coalesce(link_virtual, ''))) DESC, rn)
      FILTER (WHERE nullif(trim(link_virtual, '')) IS NOT NULL))[1] AS best_link,
    (array_agg(nullif(trim(observacao), '') ORDER BY length(trim(coalesce(observacao, ''))) DESC, rn)
      FILTER (WHERE nullif(trim(observacao, '')) IS NOT NULL))[1] AS best_observacao
  FROM ranked
  GROUP BY audiencia_key
  HAVING count(*) > 1
)
UPDATE public.audiencias a
SET
  parte = coalesce(nullif(trim(a.parte), ''), k.best_parte),
  advogado = coalesce(nullif(trim(a.advogado), ''), k.best_advogado),
  orgao_julgador = coalesce(nullif(trim(a.orgao_julgador), ''), k.best_orgao),
  vara = coalesce(nullif(trim(a.vara), ''), k.best_vara),
  cidade_lugar = coalesce(nullif(trim(a.cidade_lugar), ''), k.best_cidade),
  local_audiencia = coalesce(nullif(trim(a.local_audiencia), ''), k.best_local),
  link_virtual = coalesce(nullif(trim(a.link_virtual), ''), k.best_link),
  observacao = coalesce(nullif(trim(a.observacao), ''), k.best_observacao),
  updated_at = now()
FROM keepers k
WHERE a.id = k.keeper_id;

-- Mantém apenas uma audiência por chave.
WITH ranked AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY audiencia_key
      ORDER BY created_at ASC, id ASC
    ) AS rn
  FROM public.audiencias
)
DELETE FROM public.audiencias a
USING ranked r
WHERE a.id = r.id
  AND r.rn > 1;

DROP INDEX IF EXISTS audiencias_audiencia_key_unique;
CREATE UNIQUE INDEX audiencias_audiencia_key_unique
  ON public.audiencias (audiencia_key);

-- INSERT duplicado: não cria nova linha e não quebra a importação em lote.
CREATE OR REPLACE FUNCTION public.audiencia_prevent_duplicate_insert()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.audiencias
    WHERE audiencia_key = NEW.audiencia_key
  ) THEN
    RETURN NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS audiencia_prevent_duplicate_insert_trg ON public.audiencias;
CREATE TRIGGER audiencia_prevent_duplicate_insert_trg
BEFORE INSERT ON public.audiencias
FOR EACH ROW
EXECUTE FUNCTION public.audiencia_prevent_duplicate_insert();

-- UPDATE que tentaria transformar uma audiência em outra já existente: mantém a original.
CREATE OR REPLACE FUNCTION public.audiencia_prevent_duplicate_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.audiencia_key IS DISTINCT FROM OLD.audiencia_key
     AND EXISTS (
       SELECT 1 FROM public.audiencias
       WHERE audiencia_key = NEW.audiencia_key
         AND id <> OLD.id
     )
  THEN
    RETURN NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS audiencia_prevent_duplicate_update_trg ON public.audiencias;
CREATE TRIGGER audiencia_prevent_duplicate_update_trg
BEFORE UPDATE OF nome, numero_processo, data_audiencia, hora_audiencia
ON public.audiencias
FOR EACH ROW
EXECUTE FUNCTION public.audiencia_prevent_duplicate_update();

NOTIFY pgrst, 'reload schema';
