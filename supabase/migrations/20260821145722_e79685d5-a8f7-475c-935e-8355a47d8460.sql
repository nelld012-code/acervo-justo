ALTER TABLE public.payments
  ALTER COLUMN document_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS pagador_nome text,
  ADD COLUMN IF NOT EXISTS pagador_cpf text,
  ADD COLUMN IF NOT EXISTS cliente_id uuid REFERENCES public.clients(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.only_digits(v text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$ SELECT regexp_replace(coalesce(v,''), '[^0-9]', '', 'g') $$;

CREATE INDEX IF NOT EXISTS idx_payments_pagador_cpf_digits
  ON public.payments (public.only_digits(pagador_cpf));

CREATE INDEX IF NOT EXISTS idx_payments_cliente_id
  ON public.payments (cliente_id);

CREATE OR REPLACE FUNCTION public.recalc_document_received()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  target_doc uuid;
BEGIN
  target_doc := COALESCE(NEW.document_id, OLD.document_id);
  IF target_doc IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  UPDATE public.documents d
    SET valor_recebido_total = COALESCE((SELECT SUM(valor) FROM public.payments WHERE document_id = target_doc), 0),
        updated_at = now()
    WHERE d.id = target_doc;
  RETURN COALESCE(NEW, OLD);
END;
$function$;