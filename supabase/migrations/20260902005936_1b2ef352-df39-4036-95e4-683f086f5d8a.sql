CREATE TABLE IF NOT EXISTS public.audiencias (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nome text NOT NULL,
  numero_processo text,
  parte text,
  advogado text,
  data_audiencia date NOT NULL,
  hora_audiencia text,
  orgao_julgador text,
  vara text,
  tipo_audiencia text,
  modalidade text,
  local_audiencia text,
  link_virtual text,
  observacao text,
  status text,
  lembrete_5_dias boolean NOT NULL DEFAULT false,
  lembrete_3_dias boolean NOT NULL DEFAULT true,
  lembrete_1_dia boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.audiencias TO authenticated;
GRANT ALL ON public.audiencias TO service_role;
ALTER TABLE public.audiencias ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Autenticados gerenciam audiencias" ON public.audiencias FOR ALL TO authenticated USING (true) WITH CHECK (true);
NOTIFY pgrst, 'reload schema';