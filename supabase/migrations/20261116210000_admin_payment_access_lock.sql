-- Temporary system-wide access suspension controlled by administrators.
-- Existing records are preserved. Administrators retain access at all times.

CREATE TABLE IF NOT EXISTS public.system_settings (
  id text PRIMARY KEY CHECK (id = 'global'),
  is_active boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

INSERT INTO public.system_settings (id, is_active)
VALUES ('global', true)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.system_settings FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.system_settings TO authenticated;

DROP POLICY IF EXISTS "Authenticated users can read system access status" ON public.system_settings;
CREATE POLICY "Authenticated users can read system access status"
  ON public.system_settings FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Only administrators can create system settings" ON public.system_settings;
CREATE POLICY "Only administrators can create system settings"
  ON public.system_settings FOR INSERT TO authenticated
  WITH CHECK (private.has_cargo(auth.uid(), ARRAY['administrador']::text[]));

DROP POLICY IF EXISTS "Only administrators can update system settings" ON public.system_settings;
CREATE POLICY "Only administrators can update system settings"
  ON public.system_settings FOR UPDATE TO authenticated
  USING (private.has_cargo(auth.uid(), ARRAY['administrador']::text[]))
  WITH CHECK (private.has_cargo(auth.uid(), ARRAY['administrador']::text[]));

CREATE OR REPLACE FUNCTION private.system_access_is_active()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, private
AS $$
  SELECT COALESCE(
    (SELECT is_active FROM public.system_settings WHERE id = 'global'),
    true
  );
$$;

GRANT USAGE ON SCHEMA private TO authenticated;
REVOKE ALL ON FUNCTION private.system_access_is_active() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.system_access_is_active() TO authenticated;

-- Restrictive policies are combined with each table's existing policies.
-- When suspended, only administrators can read or change application data.
DO $$
DECLARE
  table_name text;
  app_tables text[] := ARRAY[
    'audiencias',
    'audit_logs',
    'client_contracts',
    'clients',
    'crm_activities',
    'crm_leads',
    'distribuicao_acoes',
    'djen_sync_runs',
    'document_versions',
    'documents',
    'expenses',
    'intimacoes_djen',
    'messages',
    'payments',
    'prazos',
    'profiles',
    'reception_entries',
    'tasks',
    'user_roles'
  ];
BEGIN
  FOREACH table_name IN ARRAY app_tables LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('DROP POLICY IF EXISTS "System access gate" ON public.%I', table_name);
    EXECUTE format(
      'CREATE POLICY "System access gate" ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING (private.system_access_is_active() OR private.has_cargo(auth.uid(), ARRAY[''administrador'']::text[])) WITH CHECK (private.system_access_is_active() OR private.has_cargo(auth.uid(), ARRAY[''administrador'']::text[]))',
      table_name
    );
  END LOOP;
END;
$$;

