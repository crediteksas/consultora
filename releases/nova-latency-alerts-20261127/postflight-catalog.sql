select c.relrowsecurity as rls_enabled,
 (select count(*) from pg_policies where schemaname='public' and tablename='nova_platform_delay_alerts') as user_policies,
 exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='nova_platform_delay_alerts') as realtime_published,
 has_table_privilege('anon','public.nova_platform_delay_alerts','SELECT,INSERT,UPDATE,DELETE') as anon_access,
 has_table_privilege('authenticated','public.nova_platform_delay_alerts','SELECT,INSERT,UPDATE,DELETE') as authenticated_access
from pg_class c where c.oid='public.nova_platform_delay_alerts'::regclass;
select p.proname,p.prosecdef as security_definer,p.proconfig,
 has_function_privilege('anon',p.oid,'EXECUTE') as anon_execute,
 has_function_privilege('authenticated',p.oid,'EXECUTE') as authenticated_execute,
 has_function_privilege('service_role',p.oid,'EXECUTE') as service_execute
from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('nova_platform_delay_claim','nova_platform_delay_finish','nova_platform_delay_status','nova_platform_delay_candidates','nova_platform_delay_suppress') order by p.proname;
