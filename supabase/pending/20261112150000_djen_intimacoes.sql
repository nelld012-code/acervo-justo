-- DJEN — Intimações (OAB 37610/MG, busca nacional). NÃO APLICADA.
-- Aditiva: adiciona 2 colunas anuláveis/default em public.prazos sem reescrever linhas;
-- para os prazos existentes (djen_hash NULL) a identidade e o comportamento ficam idênticos.

-- 1) Prazos: vínculo com DJEN e marcação "Pendente de revisão" (status continua compatível com prazos_status_check).
ALTER TABLE public.prazos ADD COLUMN IF NOT EXISTS djen_hash text;
ALTER TABLE public.prazos ADD COLUMN IF NOT EXISTS revisao_pendente boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.prazos.djen_hash IS 'Hash da comunicação DJEN de origem; quando presente, dedupe_key = djen:<hash>.';
COMMENT ON COLUMN public.prazos.revisao_pendente IS 'Rascunho criado automaticamente pelo DJEN; só sai deste estado via djen_confirmar_prazo.';

CREATE OR REPLACE FUNCTION public.prazo_identity_key(p_nome text, p_processo text, p_data date, p_djen_hash text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE WHEN p_djen_hash IS NOT NULL THEN 'djen:' || p_djen_hash
    ELSE public.prazo_normalize_identity(p_nome) || '|' || public.prazo_normalize_identity(coalesce(p_processo, '')) || '|' || coalesce(p_data::text, '<null>') END
$$;


CREATE OR REPLACE FUNCTION public.prazo_merge_on_insert()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $function$
BEGIN
  NEW.dedupe_key := public.prazo_identity_key(NEW.nome, NEW.numero_processo, NEW.data_limite, NEW.djen_hash);
  IF NEW.revisao_pendente AND (NEW.data_limite IS NOT NULL OR NEW.lembrete_ativo OR NEW.repetir_alerta_diariamente) THEN
    RAISE EXCEPTION 'Rascunho DJEN não pode ter vencimento nem lembretes antes da revisão.';
  END IF;
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
  IF NEW.djen_hash IS DISTINCT FROM OLD.djen_hash THEN
    RAISE EXCEPTION 'O vínculo DJEN do prazo não pode ser alterado.';
  END IF;
  IF NEW.revisao_pendente AND NOT OLD.revisao_pendente THEN
    RAISE EXCEPTION 'Um prazo revisado não pode voltar a rascunho.';
  END IF;
  IF NEW.revisao_pendente AND (NEW.data_limite IS NOT NULL OR NEW.lembrete_ativo OR NEW.repetir_alerta_diariamente) THEN
    RAISE EXCEPTION 'Confirme a revisão na página Intimações antes de definir vencimento ou lembretes.';
  END IF;
  candidate_key := public.prazo_identity_key(NEW.nome, NEW.numero_processo, NEW.data_limite, NEW.djen_hash);
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

CREATE OR REPLACE FUNCTION public.prazo_sync_dedupe_key()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $function$
BEGIN
  NEW.dedupe_key := public.prazo_identity_key(NEW.nome, NEW.numero_processo, NEW.data_limite, NEW.djen_hash);
  RETURN NEW;
END;
$function$;

-- 2) Comunicações DJEN (texto original e payload integral imutáveis)
CREATE TABLE public.intimacoes_djen (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hash text NOT NULL UNIQUE CHECK (hash ~ '^[0-9a-f]{64}$'),
  djen_id bigint, numero_processo text, sigla_tribunal text, orgao text,
  tipo_comunicacao text, tipo_documento text, meio text,
  data_disponibilizacao date, link text, destinatarios jsonb, advogados jsonb,
  texto text NOT NULL, payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'nova' CHECK (status IN ('nova','revisada','convertida_em_prazo')),
  revisada_por uuid, revisada_em timestamptz,
  prazo_id uuid UNIQUE REFERENCES public.prazos(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX intimacoes_djen_data_idx ON public.intimacoes_djen (data_disponibilizacao DESC);
CREATE INDEX intimacoes_djen_status_idx ON public.intimacoes_djen (status);
CREATE INDEX intimacoes_djen_processo_idx ON public.intimacoes_djen (numero_processo);

CREATE TABLE public.djen_sync_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), inicio date, fim date, origem text,
  started_at timestamptz NOT NULL DEFAULT now(), finished_at timestamptz,
  encontrados int NOT NULL DEFAULT 0, inseridos int NOT NULL DEFAULT 0,
  rascunhos int NOT NULL DEFAULT 0, erro text
);

GRANT SELECT, UPDATE ON public.intimacoes_djen TO authenticated;
GRANT SELECT ON public.djen_sync_runs TO authenticated;
GRANT ALL ON public.intimacoes_djen, public.djen_sync_runs TO service_role;
ALTER TABLE public.intimacoes_djen ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.djen_sync_runs ENABLE ROW LEVEL SECURITY;

-- Mesmos cargos que podem editar prazos. Sem INSERT/DELETE para usuários.
CREATE POLICY "Staff view intimacoes" ON public.intimacoes_djen FOR SELECT TO authenticated
  USING (private.has_cargo(auth.uid(), ARRAY['administrador','advogado','secretaria']));
CREATE POLICY "Staff review intimacoes" ON public.intimacoes_djen FOR UPDATE TO authenticated
  USING (private.has_cargo(auth.uid(), ARRAY['administrador','advogado','secretaria']))
  WITH CHECK (private.has_cargo(auth.uid(), ARRAY['administrador','advogado','secretaria']));
CREATE POLICY "Admins view sync runs" ON public.djen_sync_runs FOR SELECT TO authenticated
  USING (private.has_cargo(auth.uid(), ARRAY['administrador']));

CREATE FUNCTION public.intimacoes_protect() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF (NEW.hash, NEW.texto, NEW.payload, NEW.djen_id, NEW.numero_processo, NEW.data_disponibilizacao)
     IS DISTINCT FROM (OLD.hash, OLD.texto, OLD.payload, OLD.djen_id, OLD.numero_processo, OLD.data_disponibilizacao) THEN
    RAISE EXCEPTION 'Conteúdo original da intimação não pode ser alterado';
  END IF;
  IF OLD.prazo_id IS NOT NULL AND NEW.prazo_id IS NOT NULL AND NEW.prazo_id <> OLD.prazo_id THEN
    RAISE EXCEPTION 'Intimação já vinculada a outro prazo';
  END IF;
  IF NEW.status = 'convertida_em_prazo' AND NEW.prazo_id IS NULL AND OLD.prazo_id IS NULL THEN
    RAISE EXCEPTION 'Conversão exige prazo_id';
  END IF;
  NEW.updated_at := now(); RETURN NEW;
END $$;
CREATE TRIGGER intimacoes_protect_trg BEFORE UPDATE ON public.intimacoes_djen
  FOR EACH ROW EXECUTE FUNCTION public.intimacoes_protect();

-- 3) Ingestão atômica (tudo ou nada). Só service_role.
CREATE FUNCTION public.djen_ingest(p_items jsonb, p_inicio date, p_fim date, p_origem text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE it jsonb; v_int uuid; v_prazo uuid; v_ins int := 0; v_dr int := 0; v_nome text;
BEGIN
  FOR it IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    INSERT INTO public.intimacoes_djen (hash, djen_id, numero_processo, sigla_tribunal, orgao, tipo_comunicacao,
      tipo_documento, meio, data_disponibilizacao, link, destinatarios, advogados, texto, payload)
    VALUES (it->>'hash', (it->>'djen_id')::bigint, it->>'numero_processo', it->>'sigla_tribunal', it->>'orgao',
      it->>'tipo_comunicacao', it->>'tipo_documento', it->>'meio', (it->>'data_disponibilizacao')::date,
      it->>'link', it->'destinatarios', it->'advogados', it->>'texto', it->'payload')
    ON CONFLICT (hash) DO NOTHING RETURNING id INTO v_int;
    CONTINUE WHEN v_int IS NULL;
    v_ins := v_ins + 1;
    v_nome := 'DJEN · ' || coalesce(it->>'tipo_comunicacao', 'Comunicação') || ' · ' || coalesce(it->>'sigla_tribunal', '—');
    INSERT INTO public.prazos (nome, numero_processo, parte, advogado, data_limite, observacao, lembrete_ativo,
      repetir_alerta_diariamente, status, djen_hash, revisao_pendente)
    VALUES (v_nome, it->>'numero_processo', '', NULL, NULL, it->>'observacao', false, false, 'Em andamento', it->>'hash', true)
    RETURNING id INTO v_prazo;
    IF v_prazo IS NULL THEN
      SELECT id INTO v_prazo FROM public.prazos WHERE djen_hash = it->>'hash' LIMIT 1;
    ELSE v_dr := v_dr + 1; END IF;
    UPDATE public.intimacoes_djen SET prazo_id = v_prazo WHERE id = v_int;
  END LOOP;
  INSERT INTO public.djen_sync_runs (inicio, fim, origem, encontrados, inseridos, rascunhos, finished_at)
  VALUES (p_inicio, p_fim, p_origem, jsonb_array_length(p_items), v_ins, v_dr, now());
  RETURN jsonb_build_object('inseridos', v_ins, 'rascunhos', v_dr);
END $$;
REVOKE ALL ON FUNCTION public.djen_ingest(jsonb, date, date, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.djen_ingest(jsonb, date, date, text) TO service_role;

-- 4) Confirmação humana: reutiliza o rascunho vinculado; nunca cria prazo. Roda com RLS do usuário.
CREATE FUNCTION public.djen_confirmar_prazo(p_intimacao uuid, p_data_limite date, p_parte text, p_advogado text,
  p_lembrete_ativo boolean, p_antecedencia_dias int, p_repetir boolean)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE v_prazo uuid; v_hash text; n int;
BEGIN
  IF p_data_limite IS NULL THEN RAISE EXCEPTION 'Informe a data limite revisada.'; END IF;
  SELECT prazo_id, hash INTO v_prazo, v_hash FROM public.intimacoes_djen WHERE id = p_intimacao;
  IF v_hash IS NULL THEN RAISE EXCEPTION 'Intimação não encontrada ou sem permissão.'; END IF;
  IF v_prazo IS NULL THEN RAISE EXCEPTION 'Rascunho de prazo vinculado não encontrado.'; END IF;
  UPDATE public.prazos SET data_limite = p_data_limite, parte = coalesce(p_parte, parte),
    advogado = coalesce(p_advogado, advogado), lembrete_ativo = coalesce(p_lembrete_ativo, false),
    antecedencia_dias = coalesce(p_antecedencia_dias, antecedencia_dias),
    repetir_alerta_diariamente = coalesce(p_repetir, false), revisao_pendente = false
  WHERE id = v_prazo AND djen_hash = v_hash;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 0 THEN RAISE EXCEPTION 'Sem permissão para atualizar o prazo vinculado.'; END IF;
  UPDATE public.intimacoes_djen SET status = 'convertida_em_prazo', revisada_por = auth.uid(), revisada_em = now()
  WHERE id = p_intimacao;
  RETURN v_prazo;
END $$;
REVOKE ALL ON FUNCTION public.djen_confirmar_prazo(uuid, date, text, text, boolean, int, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.djen_confirmar_prazo(uuid, date, text, text, boolean, int, boolean) TO authenticated;

NOTIFY pgrst, 'reload schema';

-- REVERTER (ordem): DROP FUNCTION public.djen_confirmar_prazo(uuid,date,text,text,boolean,int,boolean);
--   DROP FUNCTION public.djen_ingest(jsonb,date,date,text); DROP TABLE public.djen_sync_runs; DROP TABLE public.intimacoes_djen;
--   DROP FUNCTION public.intimacoes_protect(); restaurar as 3 funções prazo_* (definições em 20260918191014 + versão aditiva atual);
--   os rascunhos DJEN em prazos podem ser listados por djen_hash IS NOT NULL antes de remover as colunas.
