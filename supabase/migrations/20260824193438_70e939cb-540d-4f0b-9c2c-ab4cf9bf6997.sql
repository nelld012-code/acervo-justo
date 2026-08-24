GRANT DELETE ON public.messages TO authenticated;

DROP POLICY IF EXISTS "Remetente pode apagar a propria mensagem" ON public.messages;
CREATE POLICY "Remetente pode apagar a propria mensagem"
ON public.messages
FOR DELETE
TO authenticated
USING (sender_id = auth.uid());