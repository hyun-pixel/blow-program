begin;

alter table public.profiles
add column if not exists admin_alias text
  check (
    admin_alias is null
    or char_length(btrim(admin_alias)) between 1 and 80
  );

create or replace function public.admin_search_members(
  search_text text default null,
  result_limit integer default 50
)
returns table (
  user_id uuid,
  email text,
  admin_alias text,
  account_status text,
  created_at timestamptz,
  license_status text,
  license_starts_at timestamptz,
  license_ends_at timestamptz,
  device_registered_at timestamptz,
  device_changed_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
set row_security = off
as $$
declare
  normalized_search text := nullif(btrim(search_text), '');
  safe_limit integer := least(greatest(coalesce(result_limit, 50), 1), 100);
begin
  if (select auth.uid()) is null
    or coalesce((select auth.jwt()->>'aal'), '') <> 'aal2'
    or not exists (
      select 1
      from public.admin_users
      where admin_users.user_id = (select auth.uid())
    )
  then
    raise exception using
      errcode = '42501',
      message = 'Administrator MFA is required.';
  end if;

  if char_length(coalesce(normalized_search, '')) > 100 then
    raise exception using
      errcode = '22023',
      message = 'Search text is too long.';
  end if;

  return query
  select
    profiles.id,
    users.email::text,
    profiles.admin_alias,
    profiles.account_status,
    profiles.created_at,
    licenses.status,
    licenses.starts_at,
    licenses.ends_at,
    device_registrations.registered_at,
    device_registrations.changed_at
  from public.profiles
  join auth.users on users.id = profiles.id
  left join public.licenses on licenses.user_id = profiles.id
  left join public.device_registrations
    on device_registrations.user_id = profiles.id
  where normalized_search is null
    or position(lower(normalized_search) in lower(coalesce(users.email, ''))) > 0
    or position(lower(normalized_search) in lower(coalesce(profiles.admin_alias, ''))) > 0
    or position(lower(normalized_search) in lower(profiles.id::text)) > 0
  order by profiles.created_at desc, profiles.id
  limit safe_limit;
end;
$$;

revoke all on function public.admin_search_members(text, integer)
from public, anon, authenticated;

grant execute on function public.admin_search_members(text, integer)
to authenticated;

comment on function public.admin_search_members(text, integer) is
  'Returns a limited member summary only to an AAL2 application administrator.';

commit;