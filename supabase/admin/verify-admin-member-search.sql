select
  exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'admin_alias'
  ) as admin_alias_ready,
  to_regprocedure('public.admin_search_members(text,integer)') is not null
    as member_search_ready,
  coalesce((
    select prosecdef
    from pg_proc
    where oid = to_regprocedure('public.admin_search_members(text,integer)')
  ), false) as security_definer_ready,
  coalesce((
    select exists (
      select 1
      from unnest(coalesce(proconfig, array[]::text[])) as setting
      where setting like 'search_path=%'
    )
    from pg_proc
    where oid = to_regprocedure('public.admin_search_members(text,integer)')
  ), false) as search_path_locked,
  has_function_privilege(
    'authenticated',
    'public.admin_search_members(text,integer)',
    'EXECUTE'
  ) as authenticated_can_execute,
  not has_function_privilege(
    'anon',
    'public.admin_search_members(text,integer)',
    'EXECUTE'
  ) as anonymous_cannot_execute;