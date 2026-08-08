CREATE TABLE public.reception_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  data date NOT NULL DEFAULT CURRENT_DATE,
  advogado text NOT NULL,
  nome_cliente text NOT NULL,
  cpf text,
  telefone text NOT NULL,
  atendente text NOT NULL,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.reception_entries TO authenticated;
GRANT ALL ON public.reception_entries TO service_role;

ALTER TABLE public.reception_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view reception entries" ON public.reception_entries
FOR SELECT TO authenticated USING (private.has_any_role(auth.uid(), ARRAY['admin'::app_role,'manager'::app_role,'user'::app_role]));

CREATE POLICY "Authenticated can insert reception entries" ON public.reception_entries
FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());

CREATE POLICY "Owner or leadership can update reception entries" ON public.reception_entries
FOR UPDATE TO authenticated
USING (created_by = auth.uid() OR private.has_cargo(auth.uid(), ARRAY['administrador'::text,'advogado'::text]))
WITH CHECK (created_by = auth.uid() OR private.has_cargo(auth.uid(), ARRAY['administrador'::text,'advogado'::text]));

CREATE POLICY "Owner or leadership can delete reception entries" ON public.reception_entries
FOR DELETE TO authenticated
USING (created_by = auth.uid() OR private.has_cargo(auth.uid(), ARRAY['administrador'::text,'advogado'::text]));

CREATE TRIGGER update_reception_entries_updated_at BEFORE UPDATE ON public.reception_entries
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();