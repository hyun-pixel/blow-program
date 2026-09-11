update public.app_controls
set minimum_version = '0.1.0',
    updated_at = now()
where id = true;

select minimum_version, updated_at
from public.app_controls
where id = true;
