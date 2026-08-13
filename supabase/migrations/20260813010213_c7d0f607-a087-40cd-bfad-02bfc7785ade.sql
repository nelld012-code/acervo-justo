CREATE TABLE public.prazos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  numero_processo text,
  parte text NOT NULL DEFAULT 'Parte Autora',
  advogado text,
  data_limite date NOT NULL,
  observacao text,
  lembrete_ativo boolean NOT NULL DEFAULT true,
  antecedencia_dias integer NOT NULL DEFAULT 3,
  repetir_alerta_diariamente boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'Em andamento',
  data_conclusao date,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT prazos_parte_check CHECK (parte IN ('Parte Autora','Parte Ré')),
  CONSTRAINT prazos_status_check CHECK (status IN ('Em andamento','Concluído')),
  CONSTRAINT prazos_antecedencia_check CHECK (antecedencia_dias BETWEEN 1 AND 6)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.prazos TO authenticated;
GRANT ALL ON public.prazos TO service_role;

ALTER TABLE public.prazos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view prazos" ON public.prazos
  FOR SELECT TO authenticated
  USING (private.has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role, 'user'::app_role]));

CREATE POLICY "Staff can insert prazos" ON public.prazos
  FOR INSERT TO authenticated
  WITH CHECK ((created_by = auth.uid()) AND private.has_cargo(auth.uid(), ARRAY['administrador','advogado','secretaria']));

CREATE POLICY "Staff can update prazos" ON public.prazos
  FOR UPDATE TO authenticated
  USING (private.has_cargo(auth.uid(), ARRAY['administrador','advogado','secretaria']))
  WITH CHECK (private.has_cargo(auth.uid(), ARRAY['administrador','advogado','secretaria']));

CREATE POLICY "Owner or leadership can delete prazos" ON public.prazos
  FOR DELETE TO authenticated
  USING ((created_by = auth.uid()) OR private.has_cargo(auth.uid(), ARRAY['administrador','advogado']));

CREATE INDEX idx_prazos_data_limite ON public.prazos (data_limite);
CREATE INDEX idx_prazos_numero_processo ON public.prazos (numero_processo);
CREATE INDEX idx_prazos_advogado ON public.prazos (advogado);
CREATE INDEX idx_prazos_status ON public.prazos (status);

CREATE TRIGGER update_prazos_updated_at BEFORE UPDATE ON public.prazos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();