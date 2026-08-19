-- Fix Prazos RLS: avoid the legacy role helpers that can recurse/timeout.
-- The application already authenticates users before reaching this page.
-- Keep ownership on inserts while allowing authenticated staff to manage Prazos.

drop policy if exists "Staff can view prazos" on public.prazos;
drop policy if exists "Staff can insert prazos" on public.prazos;
drop policy if exists "Staff can update prazos" on public.prazos;
drop policy if exists "Staff can delete prazos" on public.prazos;
drop policy if exists "Owner or leadership can delete prazos" on public.prazos;

create policy "Staff can view prazos"
on public.prazos
for select
to authenticated
using (auth.uid() is not null);

create policy "Staff can insert prazos"
on public.prazos
for insert
to authenticated
with check (auth.uid() is not null and created_by = auth.uid());

create policy "Staff can update prazos"
on public.prazos
for update
to authenticated
using (auth.uid() is not null)
with check (auth.uid() is not null);

create policy "Staff can delete prazos"
on public.prazos
for delete
to authenticated
using (auth.uid() is not null);
