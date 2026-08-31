ALTER TABLE public.reception_entries
  ADD COLUMN IF NOT EXISTS hora_saida text,
  ADD COLUMN IF NOT EXISTS assunto text,
  ADD COLUMN IF NOT EXISTS atestado_emitido boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS atestado_emitido_em timestamp with time zone;

ALTER TABLE public.prazos ALTER COLUMN data_limite DROP NOT NULL;