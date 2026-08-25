ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS attachment_path text,
  ADD COLUMN IF NOT EXISTS attachment_name text,
  ADD COLUMN IF NOT EXISTS attachment_type text,
  ADD COLUMN IF NOT EXISTS attachment_size integer;

ALTER TABLE public.messages ALTER COLUMN body SET DEFAULT '';

ALTER TABLE public.messages DROP CONSTRAINT IF EXISTS messages_body_or_attachment_check;
ALTER TABLE public.messages ADD CONSTRAINT messages_body_or_attachment_check
  CHECK (length(coalesce(body,'')) > 0 OR attachment_path IS NOT NULL);

ALTER TABLE public.messages DROP CONSTRAINT IF EXISTS messages_attachment_size_check;
ALTER TABLE public.messages ADD CONSTRAINT messages_attachment_size_check
  CHECK (attachment_size IS NULL OR attachment_size <= 10485760);

DROP POLICY IF EXISTS "msg_attach_insert_own" ON storage.objects;
CREATE POLICY "msg_attach_insert_own" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'message_attachments'
  AND (storage.foldername(name))[1] = auth.uid()::text
  AND lower(name) ~ '\.(jpg|jpeg|png|webp|pdf|doc|docx)$'
);

DROP POLICY IF EXISTS "msg_attach_select_participants" ON storage.objects;
CREATE POLICY "msg_attach_select_participants" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'message_attachments'
  AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR EXISTS (
      SELECT 1 FROM public.messages m
      WHERE m.attachment_path = storage.objects.name
        AND m.recipient_id = auth.uid()
    )
  )
);

DROP POLICY IF EXISTS "msg_attach_delete_own" ON storage.objects;
CREATE POLICY "msg_attach_delete_own" ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'message_attachments'
  AND (storage.foldername(name))[1] = auth.uid()::text
);