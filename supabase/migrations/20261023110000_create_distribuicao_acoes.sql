create table if not exists public.distribuicao_acoes (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  data_atendimento date,
  cliente text not null,
  data_passada_advogado date,
  classe text,
  natureza text,
  assinatura text,
  data_devolvida_advogado date,
  numero_processo text,
  assinatura_final text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists distribuicao_acoes_data_atendimento_idx
  on public.distribuicao_acoes (data_atendimento desc);

create index if not exists distribuicao_acoes_cliente_idx
  on public.distribuicao_acoes (cliente);

alter table public.distribuicao_acoes enable row level security;

drop policy if exists "Administradores gerenciam distribuicao_acoes"
  on public.distribuicao_acoes;

create policy "Administradores gerenciam distribuicao_acoes"
  on public.distribuicao_acoes
  for all
  to authenticated
  using (private.has_cargo(auth.uid(), array['administrador'::text]))
  with check (private.has_cargo(auth.uid(), array['administrador'::text]));

notify pgrst, 'reload schema';
