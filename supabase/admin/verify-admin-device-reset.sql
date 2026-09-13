select
  to_regprocedure('public.admin_reset_member_device(uuid,text)') is not null
    as device_reset_ready,
  coalesce((
    select prosecdef
    from pg_proc
    where oid = to_regprocedure('public.admin_reset_member_device(uuid,text)')
  ), false) as security_definer_ready,
  coalesce((
    select exists (
      select 1
      from unnest(coalesce(proconfig, array[]::text[])) as setting
      where setting like 'search_path=%'
    )
    from pg_proc
    where oid = to_regprocedure('public.admin_reset_member_device(uuid,text)')
  ), false) as search_path_locked,
  has_function_privilege(
    'authenticated',
    'public.admin_reset_member_device(uuid,text)',
    'EXECUTE'
  ) as authenticated_can_execute,
  not has_function_privilege(
    'anon',
    'public.admin_reset_member_device(uuid,text)',
    'EXECUTE'
  ) as anonymous_cannot_execute;
