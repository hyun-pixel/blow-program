begin;

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  account_status text not null default 'active'
    check (account_status in ('active', 'suspended')),
  created_at timestamptz not null default now()
);

create table public.licenses (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  status text not null default 'inactive'
    check (status in ('active', 'inactive')),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  updated_at timestamptz not null default now(),
  constraint licenses_valid_period check (ends_at > starts_at)
);

create table public.device_registrations (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  device_hash text not null
    check (char_length(device_hash) between 32 and 128),
  registered_at timestamptz not null default now(),
  changed_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.licenses enable row level security;
alter table public.device_registrations enable row level security;

revoke all on table public.profiles from anon, authenticated;
revoke all on table public.licenses from anon, authenticated;
revoke all on table public.device_registrations from anon, authenticated;

grant select on table public.profiles to authenticated;
grant select on table public.licenses to authenticated;
grant select on table public.device_registrations to authenticated;

grant select, insert, update, delete on table public.profiles to service_role;
grant select, insert, update, delete on table public.licenses to service_role;
grant select, insert, update, delete on table public.device_registrations to service_role;

create policy "Users can read own profile"
on public.profiles
for select
to authenticated
using ((select auth.uid()) = id);

create policy "Users can read own license"
on public.licenses
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can read own device"
on public.device_registrations
for select
to authenticated
using ((select auth.uid()) = user_id);

create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id) values (new.id);
  return new;
end;
$$;

revoke all on function public.handle_new_user() from public, anon, authenticated;
grant execute on function public.handle_new_user() to supabase_auth_admin;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

commit;