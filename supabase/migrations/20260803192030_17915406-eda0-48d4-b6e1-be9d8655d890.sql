-- =========== audit_logs ===========
DROP POLICY IF EXISTS "Authenticated can read audit logs" ON public.audit_logs;
CREATE POLICY "Own audit logs or admin/manager"
ON public.audit_logs FOR SELECT TO authenticated
USING (user_id = auth.uid() OR public.has_any_role(auth.uid(), ARRAY['admin','manager']::app_role[]));

-- =========== clients ===========
DROP POLICY IF EXISTS "Authenticated can update clients" ON public.clients;
DROP POLICY IF EXISTS "Authenticated can delete clients" ON public.clients;
DROP POLICY IF EXISTS "Authenticated can view clients" ON public.clients;

CREATE POLICY "Staff can view clients"
ON public.clients FOR SELECT TO authenticated
USING (public.has_any_role(auth.uid(), ARRAY['admin','manager','user']::app_role[]));

CREATE POLICY "Owners or admin/manager can update clients"
ON public.clients FOR UPDATE TO authenticated
USING (created_by = auth.uid() OR public.has_any_role(auth.uid(), ARRAY['admin','manager']::app_role[]))
WITH CHECK (created_by = auth.uid() OR public.has_any_role(auth.uid(), ARRAY['admin','manager']::app_role[]));

CREATE POLICY "Owners or admin/manager can delete clients"
ON public.clients FOR DELETE TO authenticated
USING (created_by = auth.uid() OR public.has_any_role(auth.uid(), ARRAY['admin','manager']::app_role[]));

-- =========== documents ===========
DROP POLICY IF EXISTS "Authenticated can view documents" ON public.documents;
CREATE POLICY "Staff can view non-confidential documents"
ON public.documents FOR SELECT TO authenticated
USING (
  public.has_any_role(auth.uid(), ARRAY['admin','manager','user']::app_role[])
  AND (
    confidencialidade <> 'Confidencial'
    OR created_by = auth.uid()
    OR public.has_any_role(auth.uid(), ARRAY['admin','manager']::app_role[])
  )
);

-- =========== payments ===========
DROP POLICY IF EXISTS "Authenticated can update payments" ON public.payments;
DROP POLICY IF EXISTS "Authenticated can delete payments" ON public.payments;

CREATE POLICY "Owners or admin/manager can update payments"
ON public.payments FOR UPDATE TO authenticated
USING (created_by = auth.uid() OR public.has_any_role(auth.uid(), ARRAY['admin','manager']::app_role[]))
WITH CHECK (created_by = auth.uid() OR public.has_any_role(auth.uid(), ARRAY['admin','manager']::app_role[]));

CREATE POLICY "Owners or admin/manager can delete payments"
ON public.payments FOR DELETE TO authenticated
USING (created_by = auth.uid() OR public.has_any_role(auth.uid(), ARRAY['admin','manager']::app_role[]));

-- =========== expenses ===========
DROP POLICY IF EXISTS "Authenticated can view expenses" ON public.expenses;
DROP POLICY IF EXISTS "Authenticated can insert expenses" ON public.expenses;
DROP POLICY IF EXISTS "Authenticated can update expenses" ON public.expenses;
DROP POLICY IF EXISTS "Authenticated can delete expenses" ON public.expenses;

CREATE POLICY "Own expenses or admin/manager can view"
ON public.expenses FOR SELECT TO authenticated
USING (user_id = auth.uid() OR public.has_any_role(auth.uid(), ARRAY['admin','manager']::app_role[]));

CREATE POLICY "Users insert their own expenses"
ON public.expenses FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Own expenses or admin/manager can update"
ON public.expenses FOR UPDATE TO authenticated
USING (user_id = auth.uid() OR public.has_any_role(auth.uid(), ARRAY['admin','manager']::app_role[]))
WITH CHECK (user_id = auth.uid() OR public.has_any_role(auth.uid(), ARRAY['admin','manager']::app_role[]));

CREATE POLICY "Own expenses or admin/manager can delete"
ON public.expenses FOR DELETE TO authenticated
USING (user_id = auth.uid() OR public.has_any_role(auth.uid(), ARRAY['admin','manager']::app_role[]));

-- =========== storage: legal_docs ===========
DROP POLICY IF EXISTS "Auth users read legal_docs" ON storage.objects;
DROP POLICY IF EXISTS "Auth users upload legal_docs" ON storage.objects;
DROP POLICY IF EXISTS "Auth users update legal_docs" ON storage.objects;

CREATE POLICY "Authorized read legal_docs"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'legal_docs'
  AND (
    owner = auth.uid()
    OR public.has_any_role(auth.uid(), ARRAY['admin','manager']::app_role[])
    OR EXISTS (
      SELECT 1 FROM public.documents d
      WHERE d.file_url = storage.objects.name
        AND (d.confidencialidade <> 'Confidencial' OR d.created_by = auth.uid())
    )
    OR EXISTS (
      SELECT 1 FROM public.document_versions v
      JOIN public.documents d ON d.id = v.document_id
      WHERE v.file_url = storage.objects.name
        AND (d.confidencialidade <> 'Confidencial' OR d.created_by = auth.uid())
    )
  )
);

CREATE POLICY "Staff upload legal_docs"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'legal_docs'
  AND owner = auth.uid()
  AND public.has_any_role(auth.uid(), ARRAY['admin','manager','user']::app_role[])
);

CREATE POLICY "Owner or admin/manager update legal_docs"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'legal_docs'
  AND (owner = auth.uid() OR public.has_any_role(auth.uid(), ARRAY['admin','manager']::app_role[]))
)
WITH CHECK (
  bucket_id = 'legal_docs'
  AND (owner = auth.uid() OR public.has_any_role(auth.uid(), ARRAY['admin','manager']::app_role[]))
);

-- =========== SECURITY DEFINER / trigger functions not callable from the API ===========
REVOKE ALL ON FUNCTION public.handle_new_user_role() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.recalc_document_received() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.generate_document_internal_id() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.has_any_role(uuid, app_role[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_any_role(uuid, app_role[]) TO authenticated;