begin;

create or replace function public.register_device(requested_device_hash text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  registered_device_hash text;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication is required.' using errcode = '28000';
  end if;

  if requested_device_hash is null
    or requested_device_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid device hash.' using errcode = '22023';
  end if;

  insert into public.device_registrations (user_id, device_hash)
  values ((select auth.uid()), requested_device_hash)
  on conflict (user_id) do nothing;

  select registration.device_hash
  into registered_device_hash
  from public.device_registrations as registration
  where registration.user_id = (select auth.uid());

  return registered_device_hash;
end;
$$;

revoke all on function public.register_device(text) from public, anon;
grant execute on function public.register_device(text) to authenticated;

commit;
