begin;

do $$
declare
  beta_user_id uuid;
  beta_user_count bigint;
begin
  select count(*) into beta_user_count from auth.users;

  if beta_user_count <> 1 then
    raise exception 'Expected exactly one auth user, found %.', beta_user_count;
  end if;

  select id into beta_user_id from auth.users;

  insert into public.licenses (user_id, status, starts_at, ends_at)
  values (beta_user_id, 'active', now(), now() + interval '30 days')
  on conflict (user_id) do nothing;
end;
$$;

commit;

select status, starts_at, ends_at
from public.licenses;