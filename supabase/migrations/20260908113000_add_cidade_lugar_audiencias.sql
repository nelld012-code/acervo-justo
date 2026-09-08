ALTER TABLE public.audiencias
  ADD COLUMN IF NOT EXISTS cidade_lugar text;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.audiencias TO authenticated;

NOTIFY pgrst, 'reload schema';
