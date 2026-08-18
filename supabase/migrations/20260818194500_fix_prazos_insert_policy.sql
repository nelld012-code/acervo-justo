-- Fixa a política de INSERT do módulo Prazos para usar o mesmo
-- sistema de roles que a política de leitura do módulo.
-- Mantém a proteção de que o registro pertence ao usuário autenticado.
ALTER TABLE public.prazos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff can insert prazos" ON public.prazos;

CREATE POLICY "Authenticated users can insert prazos" ON public.prazos
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND private.has_any_role(
      auth.uid(),
      ARRAY['admin'::app_role, 'manager'::app_role, 'user'::app_role]
    )
  );

-- O campo Parte vem do Excel como texto livre (nome da parte/pessoa/empresa).
ALTER TABLE public.prazos DROP CONSTRAINT IF EXISTS prazos_parte_check;

-- O importador normaliza os estados do Excel para estes dois valores.
ALTER TABLE public.prazos DROP CONSTRAINT IF EXISTS prazos_status_check;
ALTER TABLE public.prazos
  ADD CONSTRAINT prazos_status_check
  CHECK (status IN ('Em andamento', 'Concluído'));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.prazos TO authenticated;
