-- Corrige a política de INSERT de Prazos.
-- A política anterior dependia de private.has_cargo() com valores
-- ('administrador','advogado','secretaria'), enquanto a própria política
-- de leitura do módulo usa app_role ('admin','manager','user').
-- Isso podia permitir a leitura/checagem de duplicados e bloquear o INSERT.

DROP POLICY IF EXISTS "Staff can insert prazos" ON public.prazos;

CREATE POLICY "Staff can insert prazos"
ON public.prazos
FOR INSERT
TO authenticated
WITH CHECK (
  created_by = auth.uid()
  AND private.has_any_role(
    auth.uid(),
    ARRAY['admin'::app_role, 'manager'::app_role, 'user'::app_role]
  )
);

GRANT INSERT ON public.prazos TO authenticated;
