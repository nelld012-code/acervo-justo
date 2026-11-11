-- Secretary full CRUD access to Finance and admin visibility of retained messages.
-- RLS policies only; no application data is modified or deleted.

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

DROP POLICY IF EXISTS "Administrators can view all messages" ON public.messages;
CREATE POLICY "Administrators can view all messages"
ON public.messages FOR SELECT TO authenticated
USING (
  expires_at > now()
  AND private.has_cargo(auth.uid(), ARRAY['administrador']::text[])
);

DROP POLICY IF EXISTS "Administrators can read all message attachments" ON storage.objects;
CREATE POLICY "Administrators can read all message attachments"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'message_attachments'
  AND private.has_cargo(auth.uid(), ARRAY['administrador']::text[])
);
