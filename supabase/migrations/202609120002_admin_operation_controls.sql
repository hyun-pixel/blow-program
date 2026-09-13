begin;

create or replace function public.admin_get_app_control_summary()
returns table (
  minimum_version text,
  automation_enabled boolean,
  updated_at timestamptz,
  active_member_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
set row_security = off
as $$
declare
  actor_id uuid := auth.uid();
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

  return query
  select
    controls.minimum_version,
    controls.automation_enabled,
    controls.updated_at,
    (
      select count(*)
      from public.profiles
      where profiles.account_status = 'active'
    )
  from public.app_controls as controls
  where controls.id = true;
end;
$$;

create or replace function public.admin_set_app_controls(
  next_minimum_version text,
  next_automation_enabled boolean,
  change_reason text
)
returns table (
  minimum_version text,
  automation_enabled boolean,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  actor_id uuid := auth.uid();
  normalized_version text := btrim(next_minimum_version);
  normalized_reason text := btrim(change_reason);
  previous_controls jsonb;
  updated_controls public.app_controls%rowtype;
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

  if normalized_version is null or normalized_version !~ '^[0-9]+[.][0-9]+[.][0-9]+$' then
    raise exception 'Minimum version must use major.minor.patch format.';
  end if;

  if next_automation_enabled is null then
    raise exception 'Automation state is required.';
  end if;

  if normalized_reason is null or char_length(normalized_reason) < 5 or char_length(normalized_reason) > 500 then
    raise exception 'Change reason must be between 5 and 500 characters.';
  end if;

  select to_jsonb(controls)
  into previous_controls
  from public.app_controls as controls
  where controls.id = true
  for update;

  if previous_controls is null then
    raise exception 'App controls not found.';
  end if;

  if previous_controls->>'minimum_version' = normalized_version
    and (previous_controls->>'automation_enabled')::boolean = next_automation_enabled then
    raise exception 'No changes requested.';
  end if;

  update public.app_controls as controls
  set minimum_version = normalized_version,
      automation_enabled = next_automation_enabled,
      updated_at = now()
  where controls.id = true
  returning controls.* into updated_controls;

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
    'app_controls.updated',
    null,
    previous_controls,
    to_jsonb(updated_controls),
    normalized_reason
  );

  return query
  select
    updated_controls.minimum_version,
    updated_controls.automation_enabled,
    updated_controls.updated_at;
end;
$$;

revoke all on function public.admin_get_app_control_summary()
from public, anon, authenticated;

revoke all on function public.admin_set_app_controls(text, boolean, text)
from public, anon, authenticated;

grant execute on function public.admin_get_app_control_summary()
to authenticated;

grant execute on function public.admin_set_app_controls(text, boolean, text)
to authenticated;

commit;
