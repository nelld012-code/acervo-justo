-- ============ PROFILES (cargos) ============
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nome text NOT NULL DEFAULT '',
  email text,
  cargo text NOT NULL DEFAULT 'assistente' CHECK (cargo IN ('administrador','advogado','secretaria','assistente')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION private.get_cargo(_user_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT cargo FROM public.profiles WHERE id = _user_id
$$;

CREATE OR REPLACE FUNCTION private.has_cargo(_user_id uuid, _cargos text[])
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = _user_id AND cargo = ANY(_cargos))
$$;

CREATE POLICY "Users view own profile or admin views all" ON public.profiles
  FOR SELECT TO authenticated
  USING (id = auth.uid() OR private.has_cargo(auth.uid(), ARRAY['administrador','advogado']));

CREATE POLICY "Users insert own profile" ON public.profiles
  FOR INSERT TO authenticated WITH CHECK (id = auth.uid());

CREATE POLICY "Users update own profile or admin" ON public.profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid() OR private.has_cargo(auth.uid(), ARRAY['administrador']))
  WITH CHECK (id = auth.uid() OR private.has_cargo(auth.uid(), ARRAY['administrador']));

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- create profile on signup, taking cargo from signup metadata
CREATE OR REPLACE FUNCTION public.handle_new_user_profile()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_cargo text;
BEGIN
  v_cargo := COALESCE(NEW.raw_user_meta_data ->> 'cargo', 'assistente');
  IF v_cargo NOT IN ('administrador','advogado','secretaria','assistente') THEN
    v_cargo := 'assistente';
  END IF;
  INSERT INTO public.profiles (id, nome, email, cargo)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data ->> 'nome', ''), NEW.email, v_cargo)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created_add_profile
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_profile();

-- keep user_roles in sync with cargo
CREATE OR REPLACE FUNCTION public.sync_role_from_cargo()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_role app_role;
BEGIN
  v_role := CASE NEW.cargo
    WHEN 'administrador' THEN 'admin'::app_role
    WHEN 'advogado' THEN 'manager'::app_role
    ELSE 'user'::app_role
  END;
  DELETE FROM public.user_roles WHERE user_id = NEW.id;
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, v_role)
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER profiles_sync_role
  AFTER INSERT OR UPDATE OF cargo ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.sync_role_from_cargo();

-- backfill profiles for existing users
INSERT INTO public.profiles (id, nome, email, cargo)
SELECT u.id, COALESCE(u.raw_user_meta_data ->> 'nome',''), u.email, 'administrador'
FROM auth.users u
ON CONFLICT (id) DO NOTHING;

-- ============ TASKS (agenda semanal) ============
CREATE TABLE public.tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo text NOT NULL,
  descricao text,
  data_tarefa date NOT NULL,
  hora_tarefa time,
  prioridade text NOT NULL DEFAULT 'media' CHECK (prioridade IN ('baixa','media','alta')),
  status text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','concluida','cancelada')),
  assigned_to uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  document_id uuid REFERENCES public.documents(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tasks TO authenticated;
GRANT ALL ON public.tasks TO service_role;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View own tasks or leadership views all" ON public.tasks
  FOR SELECT TO authenticated
  USING (assigned_to = auth.uid() OR created_by = auth.uid()
         OR private.has_cargo(auth.uid(), ARRAY['administrador','advogado']));

CREATE POLICY "Create own tasks; leadership assigns to others" ON public.tasks
  FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid()
    AND (assigned_to = auth.uid() OR private.has_cargo(auth.uid(), ARRAY['administrador','advogado'])));

CREATE POLICY "Update own or assigned tasks" ON public.tasks
  FOR UPDATE TO authenticated
  USING (assigned_to = auth.uid() OR created_by = auth.uid() OR private.has_cargo(auth.uid(), ARRAY['administrador']))
  WITH CHECK (assigned_to = auth.uid() OR created_by = auth.uid() OR private.has_cargo(auth.uid(), ARRAY['administrador']));

CREATE POLICY "Delete own created tasks or admin" ON public.tasks
  FOR DELETE TO authenticated
  USING (created_by = auth.uid() OR private.has_cargo(auth.uid(), ARRAY['administrador']));

CREATE TRIGGER update_tasks_updated_at BEFORE UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX tasks_assigned_date_idx ON public.tasks (assigned_to, data_tarefa);

-- ============ FINANCE RESTRICTED TO ADMIN/ADVOGADO ============
DROP POLICY IF EXISTS "Authenticated can insert payments" ON public.payments;
DROP POLICY IF EXISTS "Authenticated can view payments" ON public.payments;
DROP POLICY IF EXISTS "Owners or admin/manager can update payments" ON public.payments;
DROP POLICY IF EXISTS "Owners or admin/manager can delete payments" ON public.payments;

CREATE POLICY "Finance staff can view payments" ON public.payments
  FOR SELECT TO authenticated
  USING (private.has_cargo(auth.uid(), ARRAY['administrador','advogado']));

CREATE POLICY "Finance staff can insert payments" ON public.payments
  FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid() AND private.has_cargo(auth.uid(), ARRAY['administrador','advogado']));

CREATE POLICY "Finance staff can update payments" ON public.payments
  FOR UPDATE TO authenticated
  USING (private.has_cargo(auth.uid(), ARRAY['administrador','advogado']))
  WITH CHECK (private.has_cargo(auth.uid(), ARRAY['administrador','advogado']));

CREATE POLICY "Finance staff can delete payments" ON public.payments
  FOR DELETE TO authenticated
  USING (private.has_cargo(auth.uid(), ARRAY['administrador','advogado']));

DROP POLICY IF EXISTS "Own expenses or admin/manager can view" ON public.expenses;
DROP POLICY IF EXISTS "Users insert their own expenses" ON public.expenses;
DROP POLICY IF EXISTS "Own expenses or admin/manager can update" ON public.expenses;
DROP POLICY IF EXISTS "Own expenses or admin/manager can delete" ON public.expenses;

CREATE POLICY "Finance staff can view expenses" ON public.expenses
  FOR SELECT TO authenticated
  USING (private.has_cargo(auth.uid(), ARRAY['administrador','advogado']));

CREATE POLICY "Finance staff can insert expenses" ON public.expenses
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND private.has_cargo(auth.uid(), ARRAY['administrador','advogado']));

CREATE POLICY "Finance staff can update expenses" ON public.expenses
  FOR UPDATE TO authenticated
  USING (private.has_cargo(auth.uid(), ARRAY['administrador','advogado']))
  WITH CHECK (private.has_cargo(auth.uid(), ARRAY['administrador','advogado']));

CREATE POLICY "Finance staff can delete expenses" ON public.expenses
  FOR DELETE TO authenticated
  USING (private.has_cargo(auth.uid(), ARRAY['administrador','advogado']));

-- ============ ASSISTENTE = READ ONLY on clients/documents ============
DROP POLICY IF EXISTS "Authenticated can insert clients" ON public.clients;
CREATE POLICY "Staff can insert clients" ON public.clients
  FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid()
    AND private.has_cargo(auth.uid(), ARRAY['administrador','advogado','secretaria']));

DROP POLICY IF EXISTS "Owners or admin/manager can update clients" ON public.clients;
CREATE POLICY "Staff can update clients" ON public.clients
  FOR UPDATE TO authenticated
  USING (private.has_cargo(auth.uid(), ARRAY['administrador','advogado','secretaria']))
  WITH CHECK (private.has_cargo(auth.uid(), ARRAY['administrador','advogado','secretaria']));

DROP POLICY IF EXISTS "Authenticated can insert documents" ON public.documents;
CREATE POLICY "Staff can insert documents" ON public.documents
  FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid()
    AND private.has_cargo(auth.uid(), ARRAY['administrador','advogado','secretaria']));

DROP POLICY IF EXISTS "Owners or admin/manager can update" ON public.documents;
CREATE POLICY "Staff can update documents" ON public.documents
  FOR UPDATE TO authenticated
  USING ((created_by = auth.uid() AND private.has_cargo(auth.uid(), ARRAY['administrador','advogado','secretaria']))
         OR private.has_cargo(auth.uid(), ARRAY['administrador','advogado']))
  WITH CHECK ((created_by = auth.uid() AND private.has_cargo(auth.uid(), ARRAY['administrador','advogado','secretaria']))
         OR private.has_cargo(auth.uid(), ARRAY['administrador','advogado']));