ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS data_atendimento date,
  ADD COLUMN IF NOT EXISTS rg text,
  ADD COLUMN IF NOT EXISTS estado_civil text,
  ADD COLUMN IF NOT EXISTS profissao text,
  ADD COLUMN IF NOT EXISTS bairro text,
  ADD COLUMN IF NOT EXISTS cidade text,
  ADD COLUMN IF NOT EXISTS reu_nome text,
  ADD COLUMN IF NOT EXISTS reu_rg_cnpj text,
  ADD COLUMN IF NOT EXISTS reu_estado_civil text,
  ADD COLUMN IF NOT EXISTS reu_profissao text,
  ADD COLUMN IF NOT EXISTS reu_endereco text,
  ADD COLUMN IF NOT EXISTS reu_bairro text,
  ADD COLUMN IF NOT EXISTS reu_cidade text,
  ADD COLUMN IF NOT EXISTS resumo_atendimento text,
  ADD COLUMN IF NOT EXISTS tipo_acao text,
  ADD COLUMN IF NOT EXISTS numero_processo text;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS telefone text;