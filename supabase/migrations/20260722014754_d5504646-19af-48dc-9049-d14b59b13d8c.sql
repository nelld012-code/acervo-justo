
-- Clients table
CREATE TABLE public.clients (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nome text NOT NULL,
  cpf_cnpj text UNIQUE,
  email text,
  telefone text NOT NULL,
  endereco text,
  observacoes text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.clients TO authenticated;
GRANT ALL ON public.clients TO service_role;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can view clients" ON public.clients FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert clients" ON public.clients FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);
CREATE POLICY "Owners or admin/manager can update clients" ON public.clients FOR UPDATE TO authenticated
  USING (created_by = auth.uid() OR public.has_any_role(auth.uid(), ARRAY['admin'::app_role,'manager'::app_role]))
  WITH CHECK (created_by = auth.uid() OR public.has_any_role(auth.uid(), ARRAY['admin'::app_role,'manager'::app_role]));
CREATE POLICY "Admin/manager can delete clients" ON public.clients FOR DELETE TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin'::app_role,'manager'::app_role]));
CREATE TRIGGER update_clients_updated_at BEFORE UPDATE ON public.clients FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX idx_clients_nome ON public.clients (nome);
CREATE INDEX idx_clients_telefone ON public.clients (telefone);

-- Extend documents with financial + client link
ALTER TABLE public.documents
  ADD COLUMN cliente_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  ADD COLUMN valor_total_processo numeric(15,2),
  ADD COLUMN valor_recebido_total numeric(15,2) NOT NULL DEFAULT 0;
CREATE INDEX idx_documents_cliente_id ON public.documents (cliente_id);

-- Payments table
CREATE TABLE public.payments (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  document_id uuid NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  valor numeric(15,2) NOT NULL CHECK (valor > 0),
  data_pagamento date NOT NULL,
  responsavel_recebimento text NOT NULL,
  metodo_pagamento text NOT NULL,
  descricao text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payments TO authenticated;
GRANT ALL ON public.payments TO service_role;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can view payments" ON public.payments FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert payments" ON public.payments FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);
CREATE POLICY "Owners or admin/manager can update payments" ON public.payments FOR UPDATE TO authenticated
  USING (created_by = auth.uid() OR public.has_any_role(auth.uid(), ARRAY['admin'::app_role,'manager'::app_role]))
  WITH CHECK (created_by = auth.uid() OR public.has_any_role(auth.uid(), ARRAY['admin'::app_role,'manager'::app_role]));
CREATE POLICY "Admin/manager can delete payments" ON public.payments FOR DELETE TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin'::app_role,'manager'::app_role]));
CREATE INDEX idx_payments_document_id ON public.payments (document_id);
CREATE INDEX idx_payments_data ON public.payments (data_pagamento);

-- Trigger: keep documents.valor_recebido_total in sync
CREATE OR REPLACE FUNCTION public.recalc_document_received()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_doc uuid;
BEGIN
  target_doc := COALESCE(NEW.document_id, OLD.document_id);
  UPDATE public.documents d
    SET valor_recebido_total = COALESCE((SELECT SUM(valor) FROM public.payments WHERE document_id = target_doc), 0),
        updated_at = now()
    WHERE d.id = target_doc;
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER payments_recalc_after_ins AFTER INSERT ON public.payments FOR EACH ROW EXECUTE FUNCTION public.recalc_document_received();
CREATE TRIGGER payments_recalc_after_upd AFTER UPDATE ON public.payments FOR EACH ROW EXECUTE FUNCTION public.recalc_document_received();
CREATE TRIGGER payments_recalc_after_del AFTER DELETE ON public.payments FOR EACH ROW EXECUTE FUNCTION public.recalc_document_received();
