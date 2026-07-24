DROP POLICY IF EXISTS "Owners or admin/manager can update clients" ON public.clients;
DROP POLICY IF EXISTS "Admin/manager can delete clients" ON public.clients;
CREATE POLICY "Authenticated can update clients" ON public.clients FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated can delete clients" ON public.clients FOR DELETE TO authenticated USING (true);

DROP POLICY IF EXISTS "Owners or admin/manager can update payments" ON public.payments;
DROP POLICY IF EXISTS "Admin/manager can delete payments" ON public.payments;
CREATE POLICY "Authenticated can update payments" ON public.payments FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated can delete payments" ON public.payments FOR DELETE TO authenticated USING (true);

DROP POLICY IF EXISTS "Admins/managers can insert expenses" ON public.expenses;
DROP POLICY IF EXISTS "Admins/managers can update expenses" ON public.expenses;
DROP POLICY IF EXISTS "Admins/managers can delete expenses" ON public.expenses;
CREATE POLICY "Authenticated can insert expenses" ON public.expenses FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update expenses" ON public.expenses FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated can delete expenses" ON public.expenses FOR DELETE TO authenticated USING (true);