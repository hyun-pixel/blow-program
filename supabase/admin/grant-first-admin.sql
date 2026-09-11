begin;

do $$
declare
  target_user_id_text constant text := 'PASTE_USER_UID_HERE';
  target_user_id uuid;
begin
  if target_user_id_text !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
    raise exception 'Replace PASTE_USER_UID_HERE with the intended user UID.';
  end if;

  target_user_id := target_user_id_text::uuid;

  if exists (select 1 from public.admin_users) then
    raise exception 'The first administrator is already assigned.';
  end if;

  if not exists (
    select 1
    from auth.users
    where id = target_user_id
      and email_confirmed_at is not null
  ) then
    raise exception 'The target user does not exist or has not confirmed email.';
  end if;

  insert into public.admin_users (user_id)
  values (target_user_id);

  insert into public.admin_audit_logs (
    actor_user_id,
    action,
    target_user_id,
    after_value,
    reason
  ) values (
    target_user_id,
    'admin.bootstrap',
    target_user_id,
    jsonb_build_object('role', 'admin'),
    'Initial administrator assignment'
  );
end;
$$;

commit;

select
  (select count(*) = 1 from public.admin_users) as first_admin_ready,
  (
    select count(*) = 1
    from public.admin_audit_logs
    where action = 'admin.bootstrap'
  ) as audit_record_ready;