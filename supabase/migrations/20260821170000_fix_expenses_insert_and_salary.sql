-- Fix expense persistence for all authenticated finance users.
-- The application stores ownership in expenses.user_id, so INSERT must allow
-- an authenticated user to create their own expense, not only admin/manager.

ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS recebedor_salario text;

DROP POLICY IF EXISTS "Admins/managers can insert expenses" ON public.expenses;
DROP POLICY IF EXISTS "Authenticated can insert expenses" ON public.expenses;
DROP POLICY IF EXISTS "Users insert their own expenses" ON public.expenses;

CREATE POLICY "Users can insert their own expenses"
ON public.expenses FOR INSERT TO authenticated
WITH CHECK (
  user_id = auth.uid()
  OR private.has_any_role(auth.uid(), ARRAY['admin','manager']::public.app_role[])
);

COMMENT ON COLUMN public.expenses.recebedor_salario IS
  'Nome do recebedor quando a despesa for um salário.';
