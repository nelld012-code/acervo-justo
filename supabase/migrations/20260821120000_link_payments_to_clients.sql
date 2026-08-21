-- Fase 3 Financeiro: vínculo direto entre pagamento e cliente.
-- Mantém document_id como vínculo opcional ao processo/documento.
-- Pagamentos sem processo continuam podendo pertencer a um cliente.

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_payments_client_id
  ON public.payments (client_id);

COMMENT ON COLUMN public.payments.client_id IS
  'Cliente vinculado ao pagamento; independente do vínculo opcional com document_id.';
