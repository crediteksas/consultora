-- Read-only catalog capture. No business rows or raw SQL definitions.
-- Include every application schema: a public invoker RPC can call a private
-- helper which needs its own schema USAGE and function EXECUTE privileges.
WITH application_schemas AS (
  SELECT oid,nspname,nspowner,nspacl FROM pg_namespace
  WHERE nspname !~ '^pg_'
    AND nspname NOT IN ('information_schema','auth','storage','realtime',
      'supabase_migrations','extensions','graphql','graphql_public','vault',
      'net','cron','pgbouncer','pgsodium','pgsodium_masks','supabase_functions')
)
SELECT jsonb_build_object(
  'captured_at',now(), 'server_version',current_setting('server_version'),
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
) AS snapshot;
