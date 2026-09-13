begin;

create or replace function public.admin_reset_member_device(
  target_user_id uuid,
  change_reason text
)
returns table (
  user_id uuid,
  device_registered boolean
)
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  actor_id uuid := auth.uid();
  normalized_reason text := btrim(change_reason);
  previous_device public.device_registrations%rowtype;
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

  if not exists (
    select 1
    from public.profiles
    where profiles.id = target_user_id
  ) then
    raise exception 'Target member not found.';
  end if;

  if normalized_reason is null
    or char_length(normalized_reason) < 5
    or char_length(normalized_reason) > 500 then
    raise exception 'Change reason must be between 5 and 500 characters.';
  end if;

  select registrations.*
  into previous_device
  from public.device_registrations as registrations
  where registrations.user_id = target_user_id
  for update;

  if not found then
    raise exception 'Registered device not found.';
  end if;

  delete from public.device_registrations as registrations
  where registrations.user_id = target_user_id;

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
    'device.registration_reset',
    target_user_id,
    to_jsonb(previous_device),
    null,
    normalized_reason
  );

  return query select target_user_id, false;
end;
$$;

revoke all on function public.admin_reset_member_device(uuid, text)
from public, anon, authenticated;

grant execute on function public.admin_reset_member_device(uuid, text)
to authenticated;

commit;
