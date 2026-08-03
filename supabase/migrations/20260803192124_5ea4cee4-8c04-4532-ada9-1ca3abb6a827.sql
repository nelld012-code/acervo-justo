CREATE SCHEMA IF NOT EXISTS private;
GRANT USAGE ON SCHEMA private TO authenticated;

CREATE OR REPLACE FUNCTION private.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role) $$;

CREATE OR REPLACE FUNCTION private.has_any_role(_user_id uuid, _roles public.app_role[])
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = ANY(_roles)) $$;

REVOKE ALL ON FUNCTION private.has_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.has_any_role(uuid, public.app_role[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION private.has_any_role(uuid, public.app_role[]) TO authenticated;

-- audit_logs
DROP POLICY IF EXISTS "Own audit logs or admin/manager" ON public.audit_logs;
CREATE POLICY "Own audit logs or admin/manager" ON public.audit_logs FOR SELECT TO authenticated
USING (user_id = auth.uid() OR private.has_any_role(auth.uid(), ARRAY['admin','manager']::public.app_role[]));

-- clients
DROP POLICY IF EXISTS "Staff can view clients" ON public.clients;
CREATE POLICY "Staff can view clients" ON public.clients FOR SELECT TO authenticated
USING (private.has_any_role(auth.uid(), ARRAY['admin','manager','user']::public.app_role[]));

DROP POLICY IF EXISTS "Owners or admin/manager can update clients" ON public.clients;
CREATE POLICY "Owners or admin/manager can update clients" ON public.clients FOR UPDATE TO authenticated
USING (created_by = auth.uid() OR private.has_any_role(auth.uid(), ARRAY['admin','manager']::public.app_role[]))
WITH CHECK (created_by = auth.uid() OR private.has_any_role(auth.uid(), ARRAY['admin','manager']::public.app_role[]));

DROP POLICY IF EXISTS "Owners or admin/manager can delete clients" ON public.clients;
CREATE POLICY "Owners or admin/manager can delete clients" ON public.clients FOR DELETE TO authenticated
USING (created_by = auth.uid() OR private.has_any_role(auth.uid(), ARRAY['admin','manager']::public.app_role[]));

-- documents
DROP POLICY IF EXISTS "Staff can view non-confidential documents" ON public.documents;
CREATE POLICY "Staff can view non-confidential documents" ON public.documents FOR SELECT TO authenticated
USING (
  private.has_any_role(auth.uid(), ARRAY['admin','manager','user']::public.app_role[])
  AND (confidencialidade <> 'Confidencial' OR created_by = auth.uid()
       OR private.has_any_role(auth.uid(), ARRAY['admin','manager']::public.app_role[]))
);

DROP POLICY IF EXISTS "Only admin/manager can delete" ON public.documents;
CREATE POLICY "Only admin/manager can delete" ON public.documents FOR DELETE TO authenticated
USING (private.has_any_role(auth.uid(), ARRAY['admin','manager']::public.app_role[]));

DROP POLICY IF EXISTS "Owners or admin/manager can update" ON public.documents;
CREATE POLICY "Owners or admin/manager can update" ON public.documents FOR UPDATE TO authenticated
USING (created_by = auth.uid() OR private.has_any_role(auth.uid(), ARRAY['admin','manager']::public.app_role[]))
WITH CHECK (created_by = auth.uid() OR private.has_any_role(auth.uid(), ARRAY['admin','manager']::public.app_role[]));

-- payments
DROP POLICY IF EXISTS "Owners or admin/manager can update payments" ON public.payments;
CREATE POLICY "Owners or admin/manager can update payments" ON public.payments FOR UPDATE TO authenticated
USING (created_by = auth.uid() OR private.has_any_role(auth.uid(), ARRAY['admin','manager']::public.app_role[]))
WITH CHECK (created_by = auth.uid() OR private.has_any_role(auth.uid(), ARRAY['admin','manager']::public.app_role[]));

DROP POLICY IF EXISTS "Owners or admin/manager can delete payments" ON public.payments;
CREATE POLICY "Owners or admin/manager can delete payments" ON public.payments FOR DELETE TO authenticated
USING (created_by = auth.uid() OR private.has_any_role(auth.uid(), ARRAY['admin','manager']::public.app_role[]));

-- expenses
DROP POLICY IF EXISTS "Own expenses or admin/manager can view" ON public.expenses;
CREATE POLICY "Own expenses or admin/manager can view" ON public.expenses FOR SELECT TO authenticated
USING (user_id = auth.uid() OR private.has_any_role(auth.uid(), ARRAY['admin','manager']::public.app_role[]));

DROP POLICY IF EXISTS "Own expenses or admin/manager can update" ON public.expenses;
CREATE POLICY "Own expenses or admin/manager can update" ON public.expenses FOR UPDATE TO authenticated
USING (user_id = auth.uid() OR private.has_any_role(auth.uid(), ARRAY['admin','manager']::public.app_role[]))
WITH CHECK (user_id = auth.uid() OR private.has_any_role(auth.uid(), ARRAY['admin','manager']::public.app_role[]));

DROP POLICY IF EXISTS "Own expenses or admin/manager can delete" ON public.expenses;
CREATE POLICY "Own expenses or admin/manager can delete" ON public.expenses FOR DELETE TO authenticated
USING (user_id = auth.uid() OR private.has_any_role(auth.uid(), ARRAY['admin','manager']::public.app_role[]));

-- storage
DROP POLICY IF EXISTS "Authorized read legal_docs" ON storage.objects;
CREATE POLICY "Authorized read legal_docs" ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'legal_docs' AND (
    owner = auth.uid()
    OR private.has_any_role(auth.uid(), ARRAY['admin','manager']::public.app_role[])
    OR EXISTS (SELECT 1 FROM public.documents d WHERE d.file_url = storage.objects.name
               AND (d.confidencialidade <> 'Confidencial' OR d.created_by = auth.uid()))
    OR EXISTS (SELECT 1 FROM public.document_versions v JOIN public.documents d ON d.id = v.document_id
               WHERE v.file_url = storage.objects.name
               AND (d.confidencialidade <> 'Confidencial' OR d.created_by = auth.uid()))
  )
);

DROP POLICY IF EXISTS "Staff upload legal_docs" ON storage.objects;
CREATE POLICY "Staff upload legal_docs" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'legal_docs' AND owner = auth.uid()
  AND private.has_any_role(auth.uid(), ARRAY['admin','manager','user']::public.app_role[]));

DROP POLICY IF EXISTS "Owner or admin/manager update legal_docs" ON storage.objects;
CREATE POLICY "Owner or admin/manager update legal_docs" ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'legal_docs' AND (owner = auth.uid() OR private.has_any_role(auth.uid(), ARRAY['admin','manager']::public.app_role[])))
WITH CHECK (bucket_id = 'legal_docs' AND (owner = auth.uid() OR private.has_any_role(auth.uid(), ARRAY['admin','manager']::public.app_role[])));

DROP POLICY IF EXISTS "Admin/manager delete legal_docs" ON storage.objects;
CREATE POLICY "Admin/manager delete legal_docs" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'legal_docs' AND private.has_any_role(auth.uid(), ARRAY['admin','manager']::public.app_role[]));

DROP FUNCTION IF EXISTS public.has_role(uuid, public.app_role);
DROP FUNCTION IF EXISTS public.has_any_role(uuid, public.app_role[]);