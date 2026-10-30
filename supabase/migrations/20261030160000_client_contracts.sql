-- Contratos individuais vinculados ao cadastro do cliente.
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS nacionalidade text,
  ADD COLUMN IF NOT EXISTS uf text,
  ADD COLUMN IF NOT EXISTS cep text;

CREATE TABLE IF NOT EXISTS public.client_contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE RESTRICT,
  objeto_servico text NOT NULL,
  representado_nome text,
  honorarios_total numeric(12,2) NOT NULL CHECK (honorarios_total >= 0),
  entrada_valor numeric(12,2) NOT NULL DEFAULT 0 CHECK (entrada_valor >= 0),
  entrada_data date,
  parcelas_quantidade integer NOT NULL DEFAULT 0 CHECK (parcelas_quantidade >= 0),
  parcela_valor numeric(12,2) NOT NULL DEFAULT 0 CHECK (parcela_valor >= 0),
  parcelas_vencimentos jsonb NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(parcelas_vencimentos) = 'array'),
  cidade_assinatura text NOT NULL DEFAULT 'Belo Horizonte',
  data_assinatura date NOT NULL DEFAULT CURRENT_DATE,
  testemunha_1 text,
  testemunha_2 text,
  contrato_html text NOT NULL,
  dados_snapshot jsonb NOT NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS client_contracts_client_id_idx ON public.client_contracts(client_id);
CREATE INDEX IF NOT EXISTS client_contracts_created_at_idx ON public.client_contracts(created_at DESC);

REVOKE ALL ON TABLE public.client_contracts FROM anon, authenticated, PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.client_contracts TO authenticated;
ALTER TABLE public.client_contracts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff can view client contracts" ON public.client_contracts;
CREATE POLICY "Staff can view client contracts" ON public.client_contracts
  FOR SELECT TO authenticated
  USING (private.has_cargo(auth.uid(), ARRAY['administrador','advogado','secretaria']::text[]));

DROP POLICY IF EXISTS "Staff can insert client contracts" ON public.client_contracts;
CREATE POLICY "Staff can insert client contracts" ON public.client_contracts
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND private.has_cargo(auth.uid(), ARRAY['administrador','advogado','secretaria']::text[])
  );

DROP POLICY IF EXISTS "Staff can update client contracts" ON public.client_contracts;
CREATE POLICY "Staff can update client contracts" ON public.client_contracts
  FOR UPDATE TO authenticated
  USING (private.has_cargo(auth.uid(), ARRAY['administrador','advogado','secretaria']::text[]))
  WITH CHECK (private.has_cargo(auth.uid(), ARRAY['administrador','advogado','secretaria']::text[]));

DROP POLICY IF EXISTS "Leadership can delete client contracts" ON public.client_contracts;
CREATE POLICY "Leadership can delete client contracts" ON public.client_contracts
  FOR DELETE TO authenticated
  USING (private.has_cargo(auth.uid(), ARRAY['administrador','advogado']::text[]));

DROP TRIGGER IF EXISTS client_contracts_set_updated_at ON public.client_contracts;
CREATE TRIGGER client_contracts_set_updated_at
  BEFORE UPDATE ON public.client_contracts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

NOTIFY pgrst, 'reload schema';
