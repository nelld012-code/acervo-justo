-- Security policy correction for internal case-management access.
-- All authenticated staff may CONSULT all hearings and legal documents,
-- including records marked confidential, as explicitly authorized by the office.
-- Mutations remain limited to the operational roles used by this application.
-- The legal_docs bucket remains PRIVATE; authenticated access is governed by RLS.

-- Hearings: replace the legacy blanket ALL policy with explicit operations.
DROP POLICY IF EXISTS "Autenticados gerenciam audiencias" ON public.audiencias;

CREATE POLICY "Authenticated staff can view all audiencias"
  ON public.audiencias
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authorized staff can insert audiencias"
  ON public.audiencias
  FOR INSERT
  TO authenticated
  WITH CHECK (
    private.has_cargo(auth.uid(), ARRAY['administrador','advogado','secretaria','assistente'])
  );

CREATE POLICY "Authorized staff can update audiencias"
  ON public.audiencias
  FOR UPDATE
  TO authenticated
  USING (
    private.has_cargo(auth.uid(), ARRAY['administrador','advogado','secretaria','assistente'])
  )
  WITH CHECK (
    private.has_cargo(auth.uid(), ARRAY['administrador','advogado','secretaria','assistente'])
  );

CREATE POLICY "Administrators and lawyers can delete audiencias"
  ON public.audiencias
  FOR DELETE
  TO authenticated
  USING (
    private.has_cargo(auth.uid(), ARRAY['administrador','advogado'])
  );

-- Documents: all authenticated staff may consult all records, including confidential.
DROP POLICY IF EXISTS "Staff can view non-confidential documents" ON public.documents;

CREATE POLICY "Authenticated staff can view all documents"
  ON public.documents
  FOR SELECT
  TO authenticated
  USING (true);

-- Document versions inherit the same office-wide consultation rule.
DROP POLICY IF EXISTS "Authenticated can view versions" ON public.document_versions;

CREATE POLICY "Authenticated staff can view all document versions"
  ON public.document_versions
  FOR SELECT
  TO authenticated
  USING (true);

-- Keep the legal_docs bucket private, but permit authenticated office users
-- to read files attached to any case. Upload/update/delete policies are unchanged.
DROP POLICY IF EXISTS "Authorized read legal_docs" ON storage.objects;

CREATE POLICY "Authenticated staff can read legal_docs"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (bucket_id = 'legal_docs');
