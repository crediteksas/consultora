-- Read-only catalog capture. No business rows or raw SQL definitions.
-- Include every application schema: a public invoker RPC can call a private
-- helper which needs its own schema USAGE and function EXECUTE privileges.
WITH application_schemas AS (
  SELECT oid,nspname,nspowner,nspacl FROM pg_namespace
  WHERE nspname !~ '^pg_'
    AND nspname NOT IN ('information_schema','auth','storage','realtime',
      'supabase_migrations','extensions','graphql','graphql_public','vault',
      'net','cron','pgbouncer','pgsodium','pgsodium_masks','supabase_functions')
), catalog_snapshot AS (
SELECT jsonb_build_object(
  'captured_at',now(), 'server_version',current_setting('server_version'),
  'cartera_coverage',jsonb_build_object(
    'graphql_installed',exists(select 1 from pg_extension where extname='pg_graphql'),
    'session_role',(select jsonb_build_object('login',rolcanlogin,'inherit',rolinherit,'super',rolsuper,'create_db',rolcreatedb,'create_role',rolcreaterole,'replication',rolreplication,'bypass',rolbypassrls) from pg_roles where rolname='kora_cartera_session'),
    'session_schema_privilege',case when to_regrole('kora_cartera_session') is null then null else exists(select 1 from pg_namespace where nspname in('auth','kora_private','kora_cartera_policy','storage','realtime') and (has_schema_privilege('kora_cartera_session',oid,'USAGE') or has_schema_privilege('kora_cartera_session',oid,'CREATE'))) end,
    'session_settings',(select setconfig from pg_db_role_setting where setrole=to_regrole('kora_cartera_session') and setdatabase=0),
    'session_memberships',(select coalesce(jsonb_agg(jsonb_build_object('role',pg_get_userbyid(roleid),'member',pg_get_userbyid(member),'grantor',pg_get_userbyid(grantor),'bootstrap_grantor',grantor=10,'admin',admin_option,'inherit',inherit_option,'set',set_option) order by roleid,member,grantor),'[]') from pg_auth_members where roleid=to_regrole('kora_cartera_session') or member=to_regrole('kora_cartera_session')),
    'rpc_returns',(select coalesce(jsonb_agg(jsonb_build_object('name',p.proname,'returns',format_type(p.prorettype,null),'set',p.proretset) order by p.proname),'[]') from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in('cartera_operador_inicio','cartera_operador_datos','cartera_operador_guardar_gestion','cartera_operador_solicitar_provision')),

    'tables',(select coalesce(jsonb_agg(jsonb_build_object('schema',n.nspname,'name',c.relname,'kind',c.relkind,'rls',c.relrowsecurity,'safe_message_partition',(c.relispartition and c.relkind in('r','p') and n.nspname='realtime'
 and c.oid in(select relid from pg_catalog.pg_partition_tree(to_regclass('realtime.messages')) where level>0)
 and c.relowner=(select relowner from pg_class where oid=to_regclass('realtime.messages'))
 and not exists(select 1 from aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a where a.grantee=0)
 and not exists(select 1 from pg_attribute ca cross join lateral aclexplode(ca.attacl) a where ca.attrelid=c.oid and ca.attnum>0 and not ca.attisdropped and a.grantee=0)
 and not exists(select 1 from aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner))) a where a.grantee=0 and a.privilege_type in('USAGE','CREATE'))
 and case when to_regrole('kora_cartera_session') is null then true else
 not has_schema_privilege('kora_cartera_session',n.oid,'USAGE') and not has_schema_privilege('kora_cartera_session',n.oid,'CREATE')
 and not has_table_privilege('kora_cartera_session',c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
 and not has_any_column_privilege('kora_cartera_session',c.oid,'SELECT,INSERT,UPDATE,REFERENCES') end),
      'session_privileged',case when to_regrole('kora_cartera_session') is null then null else (has_table_privilege('kora_cartera_session',c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') or has_any_column_privilege('kora_cartera_session',c.oid,'SELECT,INSERT,UPDATE,REFERENCES') or c.relowner=to_regrole('kora_cartera_session')) end,
      'authenticated_permissive',exists(select 1 from pg_policy pol where pol.polrelid=c.oid and pol.polpermissive and exists(select 1 from unnest(pol.polroles) r where r=0 or pg_has_role('authenticated',r,'USAGE'))),
      'policy',(select jsonb_build_object('name',p.polname,'command',p.polcmd,'permissive',p.polpermissive,
        'roles',(select jsonb_agg(pg_get_userbyid(r) order by r) from unnest(p.polroles) r),
        'using_md5',md5(pg_get_expr(p.polqual,p.polrelid)),'check_md5',md5(pg_get_expr(p.polwithcheck,p.polrelid)))
        from pg_policy p where p.polrelid=c.oid and p.polname='cartera_dedicated_deny')) order by n.nspname,c.relname),'[]')
      from pg_class c join pg_namespace n on n.oid=c.relnamespace where(n.nspname='public' and c.relkind in('r','p'))or(n.nspname in('storage','realtime') and c.relkind in('r','p','v','m','f'))),
    'publications',(select coalesce(jsonb_agg(jsonb_build_object('publication',pubname,'schema',schemaname,'table',tablename) order by pubname,schemaname,tablename),'[]') from pg_publication_tables)),

  'schema_grants',(
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'schema',n.nspname,'owner',pg_get_userbyid(n.nspowner),'acl',n.nspacl::text,
      'grants',(SELECT coalesce(jsonb_agg(jsonb_build_object(
        'grantor',pg_get_userbyid(x.grantor),
        'grantee',CASE WHEN x.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(x.grantee) END,
        'privilege',x.privilege_type,'grantable',x.is_grantable)
        ORDER BY x.grantee,x.privilege_type),'[]'::jsonb)
        FROM aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner))) x)
      ) ORDER BY n.nspname),'[]'::jsonb) FROM application_schemas n
  ),
  'relations',(
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'schema',n.nspname,'name',c.relname,'kind',c.relkind,
      'owner',pg_get_userbyid(c.relowner),'rls',c.relrowsecurity,
      'force_rls',c.relforcerowsecurity,'options',c.reloptions,'acl',c.relacl::text,
      'definition_md5',CASE WHEN c.relkind IN ('v','m') THEN md5(pg_get_viewdef(c.oid,true)) END,
      'policy_count',(SELECT count(*) FROM pg_policy p WHERE p.polrelid=c.oid),
      'columns',(SELECT coalesce(jsonb_agg(jsonb_build_object(
        'name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'acl',a.attacl::text,
        'identity',a.attidentity,'generated',a.attgenerated) ORDER BY a.attnum),'[]'::jsonb)
        FROM pg_attribute a WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped),
      'grants',(SELECT coalesce(jsonb_agg(jsonb_build_object(
        'grantor',pg_get_userbyid(x.grantor),
        'grantee',CASE WHEN x.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(x.grantee) END,
        'privilege',x.privilege_type,'grantable',x.is_grantable)
        ORDER BY x.grantee,x.privilege_type),'[]'::jsonb)
        FROM aclexplode(coalesce(c.relacl,acldefault(
          CASE WHEN c.relkind='S' THEN 'S'::"char" ELSE 'r'::"char" END,c.relowner))) x)
      ) ORDER BY n.nspname,c.relname),'[]'::jsonb)
    FROM pg_class c JOIN application_schemas n ON n.oid=c.relnamespace
    WHERE c.relkind IN ('r','p','v','m','S','f')
  ),
  'functions',(
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'schema',n.nspname,'name',p.proname,'identity',pg_get_function_identity_arguments(p.oid),
      'routine_kind',p.prokind,'owner',pg_get_userbyid(p.proowner),'security_definer',p.prosecdef,
      'config',(SELECT coalesce(jsonb_agg(v ORDER BY v),'[]'::jsonb) FROM unnest(p.proconfig) v
        WHERE split_part(v,'=',1) IN ('search_path','row_security','statement_timeout','lock_timeout')),
      'config_md5',md5(coalesce(array_to_string(p.proconfig,E'\n'),'')),
      'acl',p.proacl::text,'definition_md5',md5(pg_get_functiondef(p.oid)),
      'grants',(SELECT coalesce(jsonb_agg(jsonb_build_object(
        'grantor',pg_get_userbyid(x.grantor),
        'grantee',CASE WHEN x.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(x.grantee) END,
        'privilege',x.privilege_type,'grantable',x.is_grantable)
        ORDER BY x.grantee,x.privilege_type),'[]'::jsonb)
        FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) x)
      ) ORDER BY n.nspname,p.proname,pg_get_function_identity_arguments(p.oid)),'[]'::jsonb)
    FROM pg_proc p JOIN application_schemas n ON n.oid=p.pronamespace
    WHERE p.prokind IN ('f','p')
  ),
  'defaults',(
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'owner',pg_get_userbyid(d.defaclrole),'schema',coalesce(n.nspname,'*global*'),
      'kind',d.defaclobjtype,'acl',d.defaclacl::text,
      'grants',(SELECT coalesce(jsonb_agg(jsonb_build_object(
        'grantor',pg_get_userbyid(x.grantor),
        'grantee',CASE WHEN x.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(x.grantee) END,
        'privilege',x.privilege_type,'grantable',x.is_grantable)
        ORDER BY x.grantee,x.privilege_type),'[]'::jsonb) FROM aclexplode(d.defaclacl) x)
      ) ORDER BY d.defaclrole,d.defaclnamespace,d.defaclobjtype),'[]'::jsonb)
    FROM pg_default_acl d LEFT JOIN application_schemas n ON n.oid=d.defaclnamespace
    WHERE n.oid IS NOT NULL OR d.defaclnamespace=0
  ),
  'policies',(
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'schema',n.nspname,'table',c.relname,'name',p.polname,'command',p.polcmd,
      'permissive',p.polpermissive,
      'roles',(SELECT jsonb_agg(CASE WHEN roleid=0 THEN 'PUBLIC' ELSE pg_get_userbyid(roleid) END ORDER BY roleid)
        FROM unnest(p.polroles) roleid),
      'using_md5',md5(pg_get_expr(p.polqual,p.polrelid)),
      'check_md5',md5(pg_get_expr(p.polwithcheck,p.polrelid)))
      ORDER BY n.nspname,c.relname,p.polname),'[]'::jsonb)
    FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid JOIN application_schemas n ON n.oid=c.relnamespace
  ),
  'triggers',(
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'schema',n.nspname,'table',c.relname,'name',t.tgname,'enabled',t.tgenabled,
      'definition_md5',md5(pg_get_triggerdef(t.oid,true)),
      'function_schema',fn.nspname,'function_name',f.proname,
      'function_identity',pg_get_function_identity_arguments(f.oid)
      ) ORDER BY n.nspname,c.relname,t.tgname),'[]'::jsonb)
    FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
      JOIN application_schemas n ON n.oid=c.relnamespace
      JOIN pg_proc f ON f.oid=t.tgfoid JOIN pg_namespace fn ON fn.oid=f.pronamespace
    WHERE NOT t.tgisinternal
  ),
  'role_config',(
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'role',pg_get_userbyid(s.setrole),
      'settings',(SELECT jsonb_agg(v ORDER BY v) FROM unnest(s.setconfig) v
        WHERE split_part(v,'=',1) IN ('pgrst.db_pre_request','pgrst.db_schemas')))
      ORDER BY s.setrole,s.setdatabase),'[]'::jsonb)
    FROM pg_db_role_setting s WHERE EXISTS(SELECT 1 FROM unnest(s.setconfig) v
      WHERE split_part(v,'=',1) IN ('pgrst.db_pre_request','pgrst.db_schemas'))
  )
) AS snapshot)
SELECT CASE WHEN to_regprocedure('public.cartera_operador_inicio()') IS NULL AND to_regrole('kora_cartera_session') IS NULL THEN snapshot - 'cartera_coverage' ELSE snapshot END AS snapshot FROM catalog_snapshot;
