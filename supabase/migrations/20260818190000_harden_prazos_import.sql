-- Garante que a tabela de Prazos aceite o modelo real de importação do Excel.
-- A coluna Parte representa texto livre (nome da pessoa/empresa/parte), portanto
-- não pode ficar limitada a "Parte Autora"/"Parte Ré".
ALTER TABLE public.prazos DROP CONSTRAINT IF EXISTS prazos_parte_check;

-- Mantém os únicos estados internos usados pelo módulo.
-- O importador normaliza os valores externos do Excel para estes estados.
ALTER TABLE public.prazos DROP CONSTRAINT IF EXISTS prazos_status_check;
ALTER TABLE public.prazos
  ADD CONSTRAINT prazos_status_check
  CHECK (status IN ('Em andamento', 'Concluído'));

-- A importação sempre grava o usuário autenticado. Mantemos a política
-- alinhada com a permissão de gerenciamento do módulo.
DROP POLICY IF EXISTS "Staff can insert prazos" ON public.prazos;
CREATE POLICY "Staff can insert prazos" ON public.prazos
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND private.has_cargo(auth.uid(), ARRAY['administrador','advogado','secretaria'])
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.prazos TO authenticated;
