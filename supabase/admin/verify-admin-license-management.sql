select
  to_regprocedure(
    'public.admin_set_member_license(uuid,text,timestamp with time zone,timestamp with time zone,text)'
  ) is not null as license_management_ready,
  coalesce((
    select prosecdef
    from pg_proc
    where oid = to_regprocedure(
      'public.admin_set_member_license(uuid,text,timestamp with time zone,timestamp with time zone,text)'
    )
  ), false) as security_definer_ready,
  coalesce((
    select exists (
      select 1
      from unnest(coalesce(proconfig, array[]::text[])) as setting
      where setting like 'search_path=%'
    )
    from pg_proc
    where oid = to_regprocedure(
      'public.admin_set_member_license(uuid,text,timestamp with time zone,timestamp with time zone,text)'
    )
  ), false) as search_path_locked,
  has_function_privilege(
    'authenticated',
    'public.admin_set_member_license(uuid,text,timestamp with time zone,timestamp with time zone,text)',
    'EXECUTE'
  ) as authenticated_can_execute,
  not has_function_privilege(
    'anon',
    'public.admin_set_member_license(uuid,text,timestamp with time zone,timestamp with time zone,text)',
    'EXECUTE'
  ) as anonymous_cannot_execute;

