select
  to_regclass('public.admin_users') is not null as admin_users_ready,
  to_regclass('public.admin_audit_logs') is not null as audit_logs_ready;

select tablename, rowsecurity
from pg_tables
where schemaname = 'public'
  and tablename in ('admin_users', 'admin_audit_logs')
order by tablename;

select tablename, policyname, cmd
from pg_policies
where schemaname = 'public'
  and tablename in ('admin_users', 'admin_audit_logs')
order by tablename, policyname;