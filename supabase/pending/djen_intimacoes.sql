-- NÃO APLICADA. Aplicar somente após confirmar backup restaurável.
-- Migração aditiva: não altera, atualiza nem exclui registros de public.prazos.

CREATE TABLE public.intimacoes_djen (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hash text NOT NULL UNIQUE,
  djen_id text,
  numero_processo text,
  sigla_tribunal text,
  orgao text,
  tipo_comunicacao text,
  tipo_documento text,
  meio text,
  data_disponibilizacao date,
  link text,
  destinatarios jsonb,
  advogados jsonb,
  texto text NOT NULL DEFAULT '',
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'nova'
    CHECK (status IN ('nova', 'revisada', 'convertida_em_prazo')),
  revisada_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  revisada_em timestamptz,
  prazo_id uuid REFERENCES public.prazos(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX intimacoes_djen_data_idx
  ON public.intimacoes_djen (data_disponibilizacao DESC);
CREATE INDEX intimacoes_djen_status_idx
  ON public.intimacoes_djen (status);
CREATE INDEX intimacoes_djen_processo_idx
  ON public.intimacoes_djen (numero_processo);

CREATE TABLE public.djen_sync_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inicio date,
  fim date,
  total_cnj integer NOT NULL DEFAULT 0,
  encontrados integer NOT NULL DEFAULT 0,
  inseridos integer NOT NULL DEFAULT 0,
  origem text,
  erro text,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);

ALTER TABLE public.intimacoes_djen ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.djen_sync_runs ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.intimacoes_djen TO authenticated;
REVOKE INSERT, DELETE, UPDATE ON public.intimacoes_djen FROM authenticated;
GRANT UPDATE (status, revisada_por, revisada_em, prazo_id)
  ON public.intimacoes_djen TO authenticated;
GRANT SELECT ON public.djen_sync_runs TO authenticated;
GRANT ALL ON public.intimacoes_djen, public.djen_sync_runs TO service_role;

CREATE POLICY "Staff view intimacoes"
  ON public.intimacoes_djen
  FOR SELECT TO authenticated
  USING (private.has_any_role(auth.uid(), ARRAY['admin', 'manager', 'user']));

CREATE POLICY "Staff review intimacoes"
  ON public.intimacoes_djen
  FOR UPDATE TO authenticated
  USING (private.has_any_role(auth.uid(), ARRAY['admin', 'manager', 'user']))
  WITH CHECK (private.has_any_role(auth.uid(), ARRAY['admin', 'manager', 'user']));

CREATE POLICY "Admins view DJEN sync runs"
  ON public.djen_sync_runs
  FOR SELECT TO authenticated
  USING (private.has_any_role(auth.uid(), ARRAY['admin']));

CREATE FUNCTION public.intimacoes_protect()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF ROW(
    NEW.hash, NEW.djen_id, NEW.numero_processo, NEW.sigla_tribunal,
    NEW.orgao, NEW.tipo_comunicacao, NEW.tipo_documento, NEW.meio,
    NEW.data_disponibilizacao, NEW.link, NEW.destinatarios, NEW.advogados,
    NEW.texto, NEW.payload
  ) IS DISTINCT FROM ROW(
    OLD.hash, OLD.djen_id, OLD.numero_processo, OLD.sigla_tribunal,
    OLD.orgao, OLD.tipo_comunicacao, OLD.tipo_documento, OLD.meio,
    OLD.data_disponibilizacao, OLD.link, OLD.destinatarios, OLD.advogados,
    OLD.texto, OLD.payload
  ) THEN
    RAISE EXCEPTION 'O conteúdo original da intimação é imutável';
  END IF;

  IF OLD.status = 'convertida_em_prazo' AND NEW.status <> OLD.status THEN
    RAISE EXCEPTION 'Uma intimação já convertida não pode voltar de status';
  END IF;

  IF NEW.status = 'revisada'
     AND (NEW.revisada_por IS NULL OR NEW.revisada_em IS NULL) THEN
    RAISE EXCEPTION 'A revisão exige usuário e data';
  END IF;

  IF NEW.status = 'convertida_em_prazo' AND NEW.prazo_id IS NULL THEN
    RAISE EXCEPTION 'A conversão exige prazo_id';
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER intimacoes_protect_trg
  BEFORE UPDATE ON public.intimacoes_djen
  FOR EACH ROW EXECUTE FUNCTION public.intimacoes_protect();

REVOKE ALL ON FUNCTION public.intimacoes_protect() FROM PUBLIC, anon, authenticated;

-- ROLLBACK (somente se for necessário remover esta integração):
-- DROP TABLE public.djen_sync_runs;
-- DROP TABLE public.intimacoes_djen;
-- DROP FUNCTION public.intimacoes_protect();
