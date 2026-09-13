with functions as (
  select
    '상태 조회'::text as function_name,
    to_regprocedure('public.admin_get_app_control_summary()') as function_oid
  union all
  select
    '설정 저장',
    to_regprocedure('public.admin_set_app_controls(text,boolean,text)')
)
select
  function_name,
  function_oid is not null as function_ready,
  coalesce((select prosecdef from pg_proc where oid = function_oid), false) as security_definer_ready,
  coalesce((
    select exists (
      select 1
      from unnest(coalesce(proconfig, array[]::text[])) as setting
      where setting like 'search_path=%'
    )
    from pg_proc
    where oid = function_oid
  ), false) as search_path_locked,
  coalesce(has_function_privilege('authenticated', function_oid, 'EXECUTE'), false) as authenticated_can_execute,
  not coalesce(has_function_privilege('anon', function_oid, 'EXECUTE'), false) as anonymous_cannot_execute
from functions;
