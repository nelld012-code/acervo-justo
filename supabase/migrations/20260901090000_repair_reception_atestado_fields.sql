ALTER TABLE public.reception_entries
  ADD COLUMN IF NOT EXISTS hora_saida text,
  ADD COLUMN IF NOT EXISTS assunto text,
  ADD COLUMN IF NOT EXISTS atestado_emitido boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS atestado_emitido_em timestamptz;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.reception_entries TO authenticated;

DROP POLICY IF EXISTS "Authenticated can update reception entries" ON public.reception_entries;
CREATE POLICY "Authenticated can update reception entries"
  ON public.reception_entries
  FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);
