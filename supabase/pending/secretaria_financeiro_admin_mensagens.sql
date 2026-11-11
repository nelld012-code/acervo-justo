-- Pending permission change for the secretary role and administrator message oversight.
-- Intentionally stored outside supabase/migrations: do not apply until a verified
-- Lovable Cloud database backup exists and the user explicitly approves the DB change.

-- Finance: allow secretaria to view, create, edit and delete all financial records.
-- Inserts remain attributable to the signed-in secretary.
DROP POLICY IF EXISTS "Secretaria full access to payments" ON public.payments;
CREATE POLICY "Secretaria full access to payments"
ON public.payments FOR SELECT TO authenticated
USING (private.has_cargo(auth.uid(), ARRAY['secretaria']::text[]));

DROP POLICY IF EXISTS "Secretaria insert payments" ON public.payments;
CREATE POLICY "Secretaria insert payments"
ON public.payments FOR INSERT TO authenticated
WITH CHECK (
  created_by = auth.uid()
  AND private.has_cargo(auth.uid(), ARRAY['secretaria']::text[])
);

DROP POLICY IF EXISTS "Secretaria update payments" ON public.payments;
CREATE POLICY "Secretaria update payments"
ON public.payments FOR UPDATE TO authenticated
USING (private.has_cargo(auth.uid(), ARRAY['secretaria']::text[]))
WITH CHECK (private.has_cargo(auth.uid(), ARRAY['secretaria']::text[]));

DROP POLICY IF EXISTS "Secretaria delete payments" ON public.payments;
CREATE POLICY "Secretaria delete payments"
ON public.payments FOR DELETE TO authenticated
USING (private.has_cargo(auth.uid(), ARRAY['secretaria']::text[]));

DROP POLICY IF EXISTS "Secretaria full access to expenses" ON public.expenses;
CREATE POLICY "Secretaria full access to expenses"
ON public.expenses FOR SELECT TO authenticated
USING (private.has_cargo(auth.uid(), ARRAY['secretaria']::text[]));

DROP POLICY IF EXISTS "Secretaria insert expenses" ON public.expenses;
CREATE POLICY "Secretaria insert expenses"
ON public.expenses FOR INSERT TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND private.has_cargo(auth.uid(), ARRAY['secretaria']::text[])
);

DROP POLICY IF EXISTS "Secretaria update expenses" ON public.expenses;
CREATE POLICY "Secretaria update expenses"
ON public.expenses FOR UPDATE TO authenticated
USING (private.has_cargo(auth.uid(), ARRAY['secretaria']::text[]))
WITH CHECK (private.has_cargo(auth.uid(), ARRAY['secretaria']::text[]));

DROP POLICY IF EXISTS "Secretaria delete expenses" ON public.expenses;
CREATE POLICY "Secretaria delete expenses"
ON public.expenses FOR DELETE TO authenticated
USING (private.has_cargo(auth.uid(), ARRAY['secretaria']::text[]));

-- Administrator can read all unexpired internal messages, while other users
-- retain the existing sender/recipient-only policy. No edit/delete privilege is added.
DROP POLICY IF EXISTS "Administrators can view all messages" ON public.messages;
CREATE POLICY "Administrators can view all messages"
ON public.messages FOR SELECT TO authenticated
USING (
  expires_at > now()
  AND private.has_cargo(auth.uid(), ARRAY['administrador']::text[])
);

-- Allow administrators to open/download attachments belonging to any message.
DROP POLICY IF EXISTS "Administrators can read all message attachments" ON storage.objects;
CREATE POLICY "Administrators can read all message attachments"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'message_attachments'
  AND private.has_cargo(auth.uid(), ARRAY['administrador']::text[])
);
