CREATE TABLE IF NOT EXISTS public.audiencias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  numero_processo text,
  parte text,
  advogado text,
  data_audiencia date NOT NULL,
  hora_audiencia text,
  orgao_julgador text,
  vara text,
  tipo_audiencia text NOT NULL DEFAULT 'Civil' CHECK (tipo_audiencia IN ('Civil','Criminal','Administrativo')),
  modalidade text NOT NULL DEFAULT 'Presencial' CHECK (modalidade IN ('Presencial','Virtual')),
  local_audiencia text,
  link_virtual text,
  observacao text,
  status text NOT NULL DEFAULT 'Agendada' CHECK (status IN ('Agendada','Realizada','Cancelada')),
  lembrete_5_dias boolean NOT NULL DEFAULT false,
  lembrete_3_dias boolean NOT NULL DEFAULT false,
  lembrete_1_dia boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audiencias_data_hora ON public.audiencias (data_audiencia, hora_audiencia);
CREATE INDEX IF NOT EXISTS idx_audiencias_advogado ON public.audiencias (advogado);
CREATE INDEX IF NOT EXISTS idx_audiencias_status ON public.audiencias (status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.audiencias TO authenticated;

ALTER TABLE public.audiencias ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can view audiences" ON public.audiencias;
CREATE POLICY "Authenticated can view audiences"
  ON public.audiencias FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated can insert audiences" ON public.audiencias;
CREATE POLICY "Authenticated can insert audiences"
  ON public.audiencias FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);

DROP POLICY IF EXISTS "Authenticated can update audiences" ON public.audiencias;
CREATE POLICY "Authenticated can update audiences"
  ON public.audiencias FOR UPDATE TO authenticated
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated can delete audiences" ON public.audiencias;
CREATE POLICY "Authenticated can delete audiences"
  ON public.audiencias FOR DELETE TO authenticated USING (true);

