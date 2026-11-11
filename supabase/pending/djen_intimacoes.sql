-- NÃO APLICADA. Aplicar somente após backup verificado. Aditiva: não altera public.prazos.
CREATE TABLE public.intimacoes_djen (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hash text NOT NULL UNIQUE,
  djen_id bigint, numero_processo text, sigla_tribunal text, orgao text,
  tipo_comunicacao text, tipo_documento text, meio text,
  data_disponibilizacao date, link text, destinatarios jsonb, advogados jsonb,
  texto text NOT NULL, payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'nova' CHECK (status IN ('nova','revisada','convertida_em_prazo')),
  revisada_por uuid, revisada_em timestamptz,
  prazo_id uuid REFERENCES public.prazos(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.djen_sync_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), inicio date, fim date,
  started_at timestamptz NOT NULL DEFAULT now(), finished_at timestamptz,
  encontrados int NOT NULL DEFAULT 0, inseridos int NOT NULL DEFAULT 0, erro text
);
GRANT SELECT, UPDATE ON public.intimacoes_djen TO authenticated;
GRANT SELECT ON public.djen_sync_runs TO authenticated;
GRANT ALL ON public.intimacoes_djen, public.djen_sync_runs TO service_role;
ALTER TABLE public.intimacoes_djen ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.djen_sync_runs ENABLE ROW LEVEL SECURITY;
-- Mesmo critério de leitura de public.prazos.
CREATE POLICY "Staff view intimacoes" ON public.intimacoes_djen FOR SELECT TO authenticated
  USING (private.has_any_role(auth.uid(), ARRAY['admin','manager','user']::app_role[]));
CREATE POLICY "Staff review intimacoes" ON public.intimacoes_djen FOR UPDATE TO authenticated
  USING (private.has_any_role(auth.uid(), ARRAY['admin','manager','user']::app_role[]))
  WITH CHECK (private.has_any_role(auth.uid(), ARRAY['admin','manager','user']::app_role[]));
CREATE POLICY "Admins view sync runs" ON public.djen_sync_runs FOR SELECT TO authenticated
  USING (private.has_any_role(auth.uid(), ARRAY['admin']::app_role[]));
-- Só permite mudar status/revisão/prazo_id; conteúdo original é imutável.
CREATE FUNCTION public.intimacoes_protect() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
  IF (NEW.hash, NEW.texto, NEW.payload) IS DISTINCT FROM (OLD.hash, OLD.texto, OLD.payload) THEN
    RAISE EXCEPTION 'Conteúdo original da intimação não pode ser alterado';
  END IF;
  IF NEW.status = 'convertida_em_prazo' AND NEW.prazo_id IS NULL THEN
    RAISE EXCEPTION 'Conversão exige prazo_id';
  END IF;
  NEW.updated_at := now(); RETURN NEW;
END $$;
CREATE TRIGGER intimacoes_protect_trg BEFORE UPDATE ON public.intimacoes_djen FOR EACH ROW EXECUTE FUNCTION public.intimacoes_protect();
-- Reverter: DROP TABLE public.djen_sync_runs; DROP TABLE public.intimacoes_djen; DROP FUNCTION public.intimacoes_protect();
