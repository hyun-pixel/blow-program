begin;

create table public.admin_users (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.admin_audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid not null,
  action text not null check (char_length(action) between 1 and 80),
  target_user_id uuid,
  before_value jsonb,
  after_value jsonb,
  reason text check (reason is null or char_length(reason) <= 500),
  created_at timestamptz not null default now()
);

alter table public.admin_users enable row level security;
alter table public.admin_audit_logs enable row level security;

revoke all on table public.admin_users from anon, authenticated;
revoke all on table public.admin_audit_logs from anon, authenticated;

grant select on table public.admin_users to authenticated;
grant select on table public.admin_audit_logs to authenticated;

grant select, insert, delete on table public.admin_users to service_role;
grant select, insert on table public.admin_audit_logs to service_role;

create policy "Users can read own admin role"
on public.admin_users
for select
to authenticated
using ((select auth.uid()) is not null and (select auth.uid()) = user_id);

create policy "MFA admins can read audit logs"
on public.admin_audit_logs
for select
to authenticated
using (
  (select auth.uid()) is not null
  and (select auth.jwt()->>'aal') = 'aal2'
  and exists (
    select 1
    from public.admin_users
    where admin_users.user_id = (select auth.uid())
  )
);

commit;