update public.app_controls
set automation_enabled = false,
    updated_at = now()
where id = true;

select automation_enabled, updated_at
from public.app_controls
where id = true;
