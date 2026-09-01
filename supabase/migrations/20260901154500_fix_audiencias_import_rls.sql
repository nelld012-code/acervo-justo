ALTER TABLE public.audiencias ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.audiencias TO authenticated;

DROP POLICY IF EXISTS "Authenticated can insert audiences" ON public.audiencias;
CREATE POLICY "Authenticated can insert audiences"
  ON public.audiencias
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);
