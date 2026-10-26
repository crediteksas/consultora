-- Read-only application-schema dependencies, including private helpers.
WITH application_schemas AS (
  SELECT oid,nspname FROM pg_namespace
  WHERE nspname !~ '^pg_'
    AND nspname NOT IN ('information_schema','auth','storage','realtime',
      'supabase_migrations','extensions','graphql','graphql_public','vault',
      'net','cron','pgbouncer','pgsodium','pgsodium_masks','supabase_functions')
)
SELECT jsonb_build_object(
  'schemas',(SELECT coalesce(jsonb_agg(jsonb_build_object(
    'schema',n.nspname,'owner',pg_get_userbyid(n.nspowner),'acl',n.nspacl::text,
    'grants',(SELECT coalesce(jsonb_agg(jsonb_build_object(
      'grantor',pg_get_userbyid(x.grantor),
      'grantee',CASE WHEN x.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(x.grantee) END,
      'privilege',x.privilege_type,'grantable',x.is_grantable)
      ORDER BY x.grantee,x.privilege_type),'[]'::jsonb)
      FROM aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner))) x))
    ORDER BY n.nspname),'[]'::jsonb)
    FROM pg_namespace n JOIN application_schemas a ON a.oid=n.oid),
  'view_dependencies',(SELECT coalesce(jsonb_agg(item ORDER BY item::text),'[]'::jsonb) FROM (
    SELECT DISTINCT jsonb_build_object('schema',nv.nspname,'view',v.relname,
      'target_schema',nt.nspname,'target',t.relname,'column',a.attname) AS item
    FROM pg_rewrite r JOIN pg_class v ON v.oid=r.ev_class JOIN application_schemas nv ON nv.oid=v.relnamespace
    JOIN pg_depend d ON d.objid=r.oid AND d.classid='pg_rewrite'::regclass AND d.refclassid='pg_class'::regclass
    JOIN pg_class t ON t.oid=d.refobjid JOIN pg_namespace nt ON nt.oid=t.relnamespace
    LEFT JOIN pg_attribute a ON a.attrelid=t.oid AND a.attnum=d.refobjsubid
    WHERE v.relkind IN ('v','m') AND v.oid<>t.oid) dependencies),
  'sequence_ownership',(SELECT coalesce(jsonb_agg(jsonb_build_object(
    'schema',ns.nspname,'sequence',s.relname,'table_schema',nt.nspname,'table',t.relname,
    'column',a.attname,'dependency_type',d.deptype) ORDER BY ns.nspname,s.relname),'[]'::jsonb)
    FROM pg_class s JOIN application_schemas ns ON ns.oid=s.relnamespace
    JOIN pg_depend d ON d.objid=s.oid AND d.classid='pg_class'::regclass AND d.refclassid='pg_class'::regclass AND d.deptype IN ('a','i')
    JOIN pg_class t ON t.oid=d.refobjid JOIN pg_namespace nt ON nt.oid=t.relnamespace
    JOIN pg_attribute a ON a.attrelid=t.oid AND a.attnum=d.refobjsubid WHERE s.relkind='S'),
  'policy_dependencies',(SELECT coalesce(jsonb_agg(item ORDER BY item::text),'[]'::jsonb) FROM (
    SELECT DISTINCT jsonb_build_object('schema',n.nspname,'table',c.relname,'policy',p.polname,
      'function_schema',nf.nspname,'function',f.proname,'identity',pg_get_function_identity_arguments(f.oid)) AS item
    FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid JOIN application_schemas n ON n.oid=c.relnamespace
    JOIN pg_depend d ON d.classid='pg_policy'::regclass AND d.objid=p.oid AND d.refclassid='pg_proc'::regclass
    JOIN pg_proc f ON f.oid=d.refobjid JOIN pg_namespace nf ON nf.oid=f.pronamespace) dependencies)
) AS metadata;
