-- CRM do Acervo Justo: oportunidades, funil e histórico de relacionamento.
create table if not exists public.crm_leads (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  telefone text,
  email text,
  origem text not null default 'Indicação',
  servico_interesse text,
  status text not null default 'Novo'
    check (status in ('Novo', 'Em contato', 'Em negociação', 'Convertido', 'Perdido')),
  prioridade text not null default 'Normal'
    check (prioridade in ('Baixa', 'Normal', 'Alta')),
  valor_estimado numeric(12,2) check (valor_estimado is null or valor_estimado >= 0),
  next_follow_up date,
  notas text,
  last_contact_at timestamptz,
  client_id uuid references public.clients(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists crm_leads_status_idx on public.crm_leads(status);
create index if not exists crm_leads_next_follow_up_idx on public.crm_leads(next_follow_up);
create index if not exists crm_leads_updated_at_idx on public.crm_leads(updated_at desc);

create table if not exists public.crm_activities (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.crm_leads(id) on delete cascade,
  tipo text not null check (tipo in ('Ligação', 'WhatsApp', 'E-mail', 'Reunião', 'Observação')),
  descricao text not null,
  data_atividade timestamptz not null default now(),
  proximo_contato date,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists crm_activities_lead_date_idx on public.crm_activities(lead_id, data_atividade desc);

grant select, insert, update, delete on public.crm_leads to authenticated;
grant select, insert, update, delete on public.crm_activities to authenticated;

alter table public.crm_leads enable row level security;
alter table public.crm_activities enable row level security;

drop policy if exists "CRM staff can read leads" on public.crm_leads;
create policy "CRM staff can read leads" on public.crm_leads
  for select to authenticated
  using (private.has_cargo(auth.uid(), array['administrador','advogado','secretaria','assistente']::text[]));

drop policy if exists "CRM staff can insert leads" on public.crm_leads;
create policy "CRM staff can insert leads" on public.crm_leads
  for insert to authenticated
  with check (
    created_by = auth.uid()
    and private.has_cargo(auth.uid(), array['administrador','advogado','secretaria','assistente']::text[])
  );

drop policy if exists "CRM staff can update leads" on public.crm_leads;
create policy "CRM staff can update leads" on public.crm_leads
  for update to authenticated
  using (private.has_cargo(auth.uid(), array['administrador','advogado','secretaria','assistente']::text[]))
  with check (private.has_cargo(auth.uid(), array['administrador','advogado','secretaria','assistente']::text[]));

drop policy if exists "CRM leadership can delete leads" on public.crm_leads;
create policy "CRM leadership can delete leads" on public.crm_leads
  for delete to authenticated
  using (private.has_cargo(auth.uid(), array['administrador','advogado']::text[]));

drop policy if exists "CRM staff can read activities" on public.crm_activities;
create policy "CRM staff can read activities" on public.crm_activities
  for select to authenticated
  using (private.has_cargo(auth.uid(), array['administrador','advogado','secretaria','assistente']::text[]));

drop policy if exists "CRM staff can insert activities" on public.crm_activities;
create policy "CRM staff can insert activities" on public.crm_activities
  for insert to authenticated
  with check (
    created_by = auth.uid()
    and private.has_cargo(auth.uid(), array['administrador','advogado','secretaria','assistente']::text[])
  );

drop policy if exists "CRM leadership can delete activities" on public.crm_activities;
create policy "CRM leadership can delete activities" on public.crm_activities
  for delete to authenticated
  using (private.has_cargo(auth.uid(), array['administrador','advogado']::text[]));

drop trigger if exists crm_leads_set_updated_at on public.crm_leads;
create trigger crm_leads_set_updated_at
  before update on public.crm_leads
  for each row execute function public.update_updated_at_column();

notify pgrst, 'reload schema';
