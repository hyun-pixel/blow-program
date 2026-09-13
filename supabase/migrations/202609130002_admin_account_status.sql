begin;

create or replace function public.admin_set_member_account_status(
  target_user_id uuid,
  next_status text,
  change_reason text
)
returns table (
  user_id uuid,
  account_status text
)
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  actor_id uuid := auth.uid();
  normalized_reason text := btrim(change_reason);
  previous_profile jsonb;
  updated_profile public.profiles%rowtype;
begin
  if actor_id is null then
    raise exception 'Authentication required.';
  end if;

  if coalesce(auth.jwt()->>'aal', '') <> 'aal2' then
    raise exception 'AAL2 authentication required.';
  end if;

  if not exists (
    select 1
    from public.admin_users
    where admin_users.user_id = actor_id
  ) then
    raise exception 'Administrator role required.';
  end if;

  if next_status not in ('active', 'suspended') then
    raise exception 'Invalid account status.';
  end if;

  if normalized_reason is null
    or char_length(normalized_reason) < 5
    or char_length(normalized_reason) > 500 then
    raise exception 'Change reason must be between 5 and 500 characters.';
  end if;

  select to_jsonb(profiles)
  into previous_profile
  from public.profiles
  where profiles.id = target_user_id
  for update;

  if previous_profile is null then
    raise exception 'Target member not found.';
  end if;

  if previous_profile->>'account_status' = next_status then
    raise exception 'No changes requested.';
  end if;

  update public.profiles as profiles
  set account_status = next_status
  where profiles.id = target_user_id
  returning profiles.* into updated_profile;

  insert into public.admin_audit_logs (
    actor_user_id,
    action,
    target_user_id,
    before_value,
    after_value,
    reason
  )
  values (
    actor_id,
    'account.status_updated',
    target_user_id,
    previous_profile,
    to_jsonb(updated_profile),
    normalized_reason
  );

  return query select updated_profile.id, updated_profile.account_status;
end;
$$;

revoke all on function public.admin_set_member_account_status(uuid, text, text)
from public, anon, authenticated;

grant execute on function public.admin_set_member_account_status(uuid, text, text)
to authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'profiles'
  ) then
    alter publication supabase_realtime add table public.profiles;
  end if;
end
$$;

commit;
