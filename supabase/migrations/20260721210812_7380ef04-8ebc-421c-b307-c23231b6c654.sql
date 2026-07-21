
-- Roles
CREATE TYPE public.app_role AS ENUM ('admin', 'manager', 'user');

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL DEFAULT 'user',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own roles" ON public.user_roles
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role
  );
$$;

CREATE OR REPLACE FUNCTION public.has_any_role(_user_id uuid, _roles app_role[])
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = ANY(_roles)
  );
$$;

-- Auto-assign default role on signup
CREATE OR REPLACE FUNCTION public.handle_new_user_role()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user')
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created_add_role
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_role();

-- updated_at helper
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public
AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

-- Documents
CREATE TABLE public.documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  internal_id text UNIQUE NOT NULL,
  advogado text NOT NULL,
  numero_processo text NOT NULL,
  data_documento date NOT NULL,
  data_ingresso date NOT NULL DEFAULT CURRENT_DATE,
  data_processo date,
  tipo_documento text NOT NULL,
  cliente text NOT NULL,
  parte_autora text,
  parte_re text,
  orgao_judicial text,
  materia text NOT NULL,
  estado_processual text NOT NULL DEFAULT 'Aberto'
    CHECK (estado_processual IN ('Aberto','Em revisão','Arquivado','Encerrado')),
  confidencialidade text NOT NULL DEFAULT 'Público'
    CHECK (confidencialidade IN ('Público','Restrito','Confidencial')),
  palavras_chave text[] DEFAULT '{}',
  file_url text NOT NULL,
  file_name text NOT NULL,
  file_size integer,
  current_version integer NOT NULL DEFAULT 1,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_documents_advogado ON public.documents (advogado);
CREATE INDEX idx_documents_numero_processo ON public.documents (numero_processo);
CREATE INDEX idx_documents_data_documento ON public.documents (data_documento);
CREATE INDEX idx_documents_tipo ON public.documents (tipo_documento);
CREATE INDEX idx_documents_estado ON public.documents (estado_processual);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.documents TO authenticated;
GRANT ALL ON public.documents TO service_role;
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view documents" ON public.documents
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated can insert documents" ON public.documents
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Owners or admin/manager can update" ON public.documents
  FOR UPDATE TO authenticated
  USING (created_by = auth.uid() OR public.has_any_role(auth.uid(), ARRAY['admin','manager']::app_role[]))
  WITH CHECK (created_by = auth.uid() OR public.has_any_role(auth.uid(), ARRAY['admin','manager']::app_role[]));

CREATE POLICY "Only admin/manager can delete" ON public.documents
  FOR DELETE TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','manager']::app_role[]));

CREATE TRIGGER update_documents_updated_at BEFORE UPDATE ON public.documents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Auto internal_id generator: DOC-YYYY-000XXX
CREATE SEQUENCE IF NOT EXISTS public.documents_internal_seq;

CREATE OR REPLACE FUNCTION public.generate_document_internal_id()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public
AS $$
DECLARE
  next_val bigint;
BEGIN
  IF NEW.internal_id IS NULL OR NEW.internal_id = '' THEN
    next_val := nextval('public.documents_internal_seq');
    NEW.internal_id := 'DOC-' || to_char(now(),'YYYY') || '-' || lpad(next_val::text, 6, '0');
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER documents_set_internal_id
  BEFORE INSERT ON public.documents
  FOR EACH ROW EXECUTE FUNCTION public.generate_document_internal_id();

-- Document versions
CREATE TABLE public.document_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  version_number integer NOT NULL,
  file_url text NOT NULL,
  file_name text NOT NULL,
  file_size integer,
  uploaded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  change_notes text
);
CREATE INDEX idx_document_versions_document_id ON public.document_versions (document_id);

GRANT SELECT, INSERT ON public.document_versions TO authenticated;
GRANT ALL ON public.document_versions TO service_role;
ALTER TABLE public.document_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view versions" ON public.document_versions
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert versions" ON public.document_versions
  FOR INSERT TO authenticated WITH CHECK (uploaded_by = auth.uid());

-- Audit logs
CREATE TABLE public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  document_id uuid REFERENCES public.documents(id) ON DELETE SET NULL,
  action text NOT NULL CHECK (action IN ('viewed','uploaded','edited','deleted','downloaded')),
  details jsonb,
  ip_address text,
  timestamp timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_logs_timestamp ON public.audit_logs (timestamp DESC);
CREATE INDEX idx_audit_logs_document_id ON public.audit_logs (document_id);

GRANT SELECT, INSERT ON public.audit_logs TO authenticated;
GRANT ALL ON public.audit_logs TO service_role;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read audit logs" ON public.audit_logs
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can log their own actions" ON public.audit_logs
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

-- Storage policies for legal_docs bucket
CREATE POLICY "Auth users read legal_docs"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'legal_docs');

CREATE POLICY "Auth users upload legal_docs"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'legal_docs');

CREATE POLICY "Auth users update legal_docs"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'legal_docs');

CREATE POLICY "Admin/manager delete legal_docs"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'legal_docs' AND public.has_any_role(auth.uid(), ARRAY['admin','manager']::app_role[]));
