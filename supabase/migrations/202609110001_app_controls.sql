begin;

create table if not exists public.app_controls (
  id boolean primary key default true check (id),
  minimum_version text not null default '0.1.0'
    check (minimum_version ~ '^[0-9]+[.][0-9]+[.][0-9]+$'),
  automation_enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table public.app_controls enable row level security;

revoke all on table public.app_controls from anon, authenticated;
grant select on table public.app_controls to authenticated;
grant select, insert, update, delete on table public.app_controls to service_role;

drop policy if exists "Authenticated users can read app controls"
on public.app_controls;

create policy "Authenticated users can read app controls"
on public.app_controls
for select
to authenticated
using (true);

insert into public.app_controls (
  id,
  minimum_version,
  automation_enabled
)
values (true, '0.1.0', true)
on conflict (id) do nothing;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'app_controls'
  ) then
    alter publication supabase_realtime add table public.app_controls;
  end if;
end;
$$;

commit;
