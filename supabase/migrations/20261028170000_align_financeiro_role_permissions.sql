-- Align the supported "financeiro" profile with the permissions exposed by the app.
-- Review and apply only after checking the current production schema and user roles.

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_cargo_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_cargo_check
  CHECK (cargo IN ('administrador', 'advogado', 'secretaria', 'assistente', 'financeiro'));

-- Finance access in the UI is administrator + financeiro. Replace the older
-- administrator + advogado policies so the database and UI agree.
DROP POLICY IF EXISTS "Finance staff can view payments" ON public.payments;
CREATE POLICY "Finance staff can view payments" ON public.payments
  FOR SELECT TO authenticated
  USING (private.has_cargo(auth.uid(), ARRAY['administrador','financeiro']::text[]));

DROP POLICY IF EXISTS "Finance staff can insert payments" ON public.payments;
CREATE POLICY "Finance staff can insert payments" ON public.payments
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND private.has_cargo(auth.uid(), ARRAY['administrador','financeiro']::text[])
  );

DROP POLICY IF EXISTS "Finance staff can update payments" ON public.payments;
CREATE POLICY "Finance staff can update payments" ON public.payments
  FOR UPDATE TO authenticated
  USING (private.has_cargo(auth.uid(), ARRAY['administrador','financeiro']::text[]))
  WITH CHECK (private.has_cargo(auth.uid(), ARRAY['administrador','financeiro']::text[]));

DROP POLICY IF EXISTS "Finance staff can delete payments" ON public.payments;
CREATE POLICY "Finance staff can delete payments" ON public.payments
  FOR DELETE TO authenticated
  USING (private.has_cargo(auth.uid(), ARRAY['administrador','financeiro']::text[]));

DROP POLICY IF EXISTS "Finance staff can view expenses" ON public.expenses;
CREATE POLICY "Finance staff can view expenses" ON public.expenses
  FOR SELECT TO authenticated
  USING (private.has_cargo(auth.uid(), ARRAY['administrador','financeiro']::text[]));

DROP POLICY IF EXISTS "Finance staff can insert expenses" ON public.expenses;
CREATE POLICY "Finance staff can insert expenses" ON public.expenses
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND private.has_cargo(auth.uid(), ARRAY['administrador','financeiro']::text[])
  );

DROP POLICY IF EXISTS "Finance staff can update expenses" ON public.expenses;
CREATE POLICY "Finance staff can update expenses" ON public.expenses
  FOR UPDATE TO authenticated
  USING (private.has_cargo(auth.uid(), ARRAY['administrador','financeiro']::text[]))
  WITH CHECK (private.has_cargo(auth.uid(), ARRAY['administrador','financeiro']::text[]));

DROP POLICY IF EXISTS "Finance staff can delete expenses" ON public.expenses;
CREATE POLICY "Finance staff can delete expenses" ON public.expenses
  FOR DELETE TO authenticated
  USING (private.has_cargo(auth.uid(), ARRAY['administrador','financeiro']::text[]));

-- Keep client/document permissions consistent with permissionsFor() while
-- preserving the existing least-privilege rules for assistants and secretaries.
DROP POLICY IF EXISTS "Staff can insert clients" ON public.clients;
CREATE POLICY "Staff can insert clients" ON public.clients
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND private.has_cargo(auth.uid(), ARRAY['administrador','advogado','secretaria','financeiro']::text[])
  );

DROP POLICY IF EXISTS "Staff can update clients" ON public.clients;
CREATE POLICY "Staff can update clients" ON public.clients
  FOR UPDATE TO authenticated
  USING (private.has_cargo(auth.uid(), ARRAY['administrador','advogado','secretaria','financeiro']::text[]))
  WITH CHECK (private.has_cargo(auth.uid(), ARRAY['administrador','advogado','secretaria','financeiro']::text[]));

DROP POLICY IF EXISTS "Staff can insert documents" ON public.documents;
CREATE POLICY "Staff can insert documents" ON public.documents
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND private.has_cargo(auth.uid(), ARRAY['administrador','advogado','secretaria','financeiro']::text[])
  );

DROP POLICY IF EXISTS "Staff can update documents" ON public.documents;
CREATE POLICY "Staff can update documents" ON public.documents
  FOR UPDATE TO authenticated
  USING (
    (created_by = auth.uid() AND private.has_cargo(auth.uid(), ARRAY['administrador','advogado','secretaria','financeiro']::text[]))
    OR private.has_cargo(auth.uid(), ARRAY['administrador','advogado']::text[])
  )
  WITH CHECK (
    (created_by = auth.uid() AND private.has_cargo(auth.uid(), ARRAY['administrador','advogado','secretaria','financeiro']::text[]))
    OR private.has_cargo(auth.uid(), ARRAY['administrador','advogado']::text[])
  );

NOTIFY pgrst, 'reload schema';
