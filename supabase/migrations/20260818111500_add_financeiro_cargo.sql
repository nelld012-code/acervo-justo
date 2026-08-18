-- Add the Financeiro role to the existing profiles.cargo check constraint.
-- The role is intentionally separate from leadership/admin permissions.
DO $$
DECLARE
  constraint_name text;
BEGIN
  FOR constraint_name IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'profiles'
      AND c.contype = 'c'
      AND pg_get_constraintdef(c.oid) ILIKE '%cargo%'
  LOOP
    EXECUTE format('ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS %I', constraint_name);
  END LOOP;
END $$;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_cargo_check
  CHECK (cargo IN ('administrador', 'advogado', 'secretaria', 'assistente', 'financeiro'));
