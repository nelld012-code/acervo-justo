-- Fase 3 Financeiro: vínculo direto entre pagamento e cliente.
-- Mantém document_id como vínculo opcional ao processo/documento.
-- Pagamentos sem processo continuam podendo pertencer a um cliente.

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_payments_client_id
  ON public.payments (client_id);

COMMENT ON COLUMN public.payments.client_id IS
  'Cliente vinculado ao pagamento; independente do vínculo opcional com document_id.';

-- Migra vínculos já existentes: pagamentos ligados a documentos cujo cliente
-- já está identificado passam a carregar também o vínculo direto ao cliente.
UPDATE public.payments p
SET client_id = d.cliente_id
FROM public.documents d
WHERE p.document_id = d.id
  AND p.client_id IS NULL
  AND d.cliente_id IS NOT NULL;
