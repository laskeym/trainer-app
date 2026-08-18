select grantee, privilege_type
from information_schema.role_table_grants
where table_name = 'client'
and grantee = 'authenticated'
order by privilege_type;