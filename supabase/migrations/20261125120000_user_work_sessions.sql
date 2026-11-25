-- Registro de jornada por sessões, com pausa automática após 5 minutos sem atividade.
CREATE TABLE IF NOT EXISTS public.user_work_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  started_at timestamptz NOT NULL DEFAULT now(),
  last_activity_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  active_seconds integer NOT NULL DEFAULT 0 CHECK (active_seconds >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS user_work_sessions_user_started_idx
  ON public.user_work_sessions (user_id, started_at DESC);
ALTER TABLE public.user_work_sessions ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.user_work_sessions TO authenticated;
DROP POLICY IF EXISTS "Users create own work sessions" ON public.user_work_sessions;
CREATE POLICY "Users create own work sessions" ON public.user_work_sessions
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "Users update own work sessions" ON public.user_work_sessions;
CREATE POLICY "Users update own work sessions" ON public.user_work_sessions
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "Users read own sessions and admins read all" ON public.user_work_sessions;
CREATE POLICY "Users read own sessions and admins read all" ON public.user_work_sessions
  FOR SELECT TO authenticated USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.cargo = 'administrador')
  );
DROP POLICY IF EXISTS "System access gate" ON public.user_work_sessions;
CREATE POLICY "System access gate" ON public.user_work_sessions AS RESTRICTIVE
  FOR ALL TO authenticated
  USING (private.system_access_is_active() OR auth.uid() = '89d9645a-6916-4788-8935-5a492d17db19'::uuid)
  WITH CHECK (private.system_access_is_active() OR auth.uid() = '89d9645a-6916-4788-8935-5a492d17db19'::uuid);
