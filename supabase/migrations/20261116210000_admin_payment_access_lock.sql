-- Temporary system-wide access suspension controlled by administrators.
-- Existing records are preserved. Administrators retain access at all times.

CREATE TABLE IF NOT EXISTS public.system_settings (
  id text PRIMARY KEY CHECK (id = 'global'),
  is_active boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

INSERT INTO public.system_settings (id, is_active)
VALUES ('global', false)
ON CONFLICT (id) DO UPDATE SET is_active = false, updated_at = now();

ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.system_settings FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.system_settings TO authenticated;
GRANT SELECT (is_active) ON TABLE public.system_settings TO anon;

DROP POLICY IF EXISTS "Authenticated users can read system access status" ON public.system_settings;
DROP POLICY IF EXISTS "Public can read system access status" ON public.system_settings;
CREATE POLICY "Public can read system access status"
  ON public.system_settings FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Only administrators can create system settings" ON public.system_settings;
CREATE POLICY "Only administrators can create system settings"
  ON public.system_settings FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = '89d9645a-6916-4788-8935-5a492d17db19'::uuid);

DROP POLICY IF EXISTS "Only administrators can update system settings" ON public.system_settings;
CREATE POLICY "Only administrators can update system settings"
  ON public.system_settings FOR UPDATE TO authenticated
  USING (auth.uid() = '89d9645a-6916-4788-8935-5a492d17db19'::uuid)
  WITH CHECK (auth.uid() = '89d9645a-6916-4788-8935-5a492d17db19'::uuid);

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
      'CREATE POLICY "System access gate" ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING (private.system_access_is_active() OR auth.uid() = ''89d9645a-6916-4788-8935-5a492d17db19''::uuid) WITH CHECK (private.system_access_is_active() OR auth.uid() = ''89d9645a-6916-4788-8935-5a492d17db19''::uuid)',
      table_name
    );
  END LOOP;
END;
$$;

