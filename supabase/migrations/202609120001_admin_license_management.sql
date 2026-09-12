begin;

create or replace function public.admin_set_member_license(
  target_user_id uuid,
  next_status text,
  next_starts_at timestamptz,
  next_ends_at timestamptz,
  change_reason text
)
returns table (
  user_id uuid,
  status text,
  starts_at timestamptz,
  ends_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  actor_id uuid := auth.uid();
  previous_license jsonb;
  updated_license public.licenses%rowtype;
  normalized_reason text := btrim(change_reason);
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

  if next_status not in ('active', 'inactive') then
    raise exception 'Invalid license status.';
  end if;

  if next_starts_at is null or next_ends_at is null or next_ends_at <= next_starts_at then
    raise exception 'License end must be after its start.';
  end if;

  if normalized_reason is null or char_length(normalized_reason) < 5 or char_length(normalized_reason) > 500 then
    raise exception 'Change reason must be between 5 and 500 characters.';
  end if;

  select to_jsonb(licenses)
  into previous_license
  from public.licenses
  where licenses.user_id = target_user_id
  for update;

  insert into public.licenses (user_id, status, starts_at, ends_at, updated_at)
  values (target_user_id, next_status, next_starts_at, next_ends_at, now())
  on conflict on constraint licenses_pkey do update
  set status = excluded.status,
      starts_at = excluded.starts_at,
      ends_at = excluded.ends_at,
      updated_at = excluded.updated_at
  returning * into updated_license;

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
    'license.updated',
    target_user_id,
    previous_license,
    to_jsonb(updated_license),
    normalized_reason
  );

  return query
  select
    updated_license.user_id,
    updated_license.status,
    updated_license.starts_at,
    updated_license.ends_at,
    updated_license.updated_at;
end;
$$;

revoke all on function public.admin_set_member_license(uuid, text, timestamptz, timestamptz, text)
from public, anon, authenticated;

grant execute on function public.admin_set_member_license(uuid, text, timestamptz, timestamptz, text)
to authenticated;

commit;

