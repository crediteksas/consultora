from pathlib import Path
import json,hashlib
R=Path(__file__).resolve().parent
repo=R.parents[1];O=R/'candidate'
for name,wanted in json.loads((R/'baseline/release-gate-source-pins.json').read_text()).items():
    assert hashlib.sha256((repo/'scripts/supabase-compat'/name).read_bytes()).hexdigest()==wanted, 'Review gate pre-image drift first: '+name
(O/'cartera-managed-inventory.mjs').write_text('export const managedRelations='+json.dumps(json.loads((R/'baseline/managed-relations.json').read_text()),separators=(',',':'))+';\n')
q=(repo/'scripts/supabase-compat/catalog-query.sql').read_text()
needle="  'captured_at',now(), 'server_version',current_setting('server_version'),"
assert q.count(needle)==1
coverage="""
  'cartera_coverage',jsonb_build_object(
    'tables',(select coalesce(jsonb_agg(jsonb_build_object('schema',n.nspname,'name',c.relname,'kind',c.relkind,'rls',c.relrowsecurity,
      'authenticated_permissive',exists(select 1 from pg_policy pol where pol.polrelid=c.oid and pol.polpermissive and exists(select 1 from unnest(pol.polroles) r where r=0 or pg_has_role('authenticated',r,'USAGE'))),
      'policy',(select jsonb_build_object('name',p.polname,'command',p.polcmd,'permissive',p.polpermissive,
        'roles',(select jsonb_agg(pg_get_userbyid(r) order by r) from unnest(p.polroles) r),
        'using_md5',md5(pg_get_expr(p.polqual,p.polrelid)),'check_md5',md5(pg_get_expr(p.polwithcheck,p.polrelid)))
        from pg_policy p where p.polrelid=c.oid and p.polname='cartera_dedicated_deny')) order by n.nspname,c.relname),'[]')
      from pg_class c join pg_namespace n on n.oid=c.relnamespace where(n.nspname='public' and c.relkind in('r','p'))or(n.nspname in('storage','realtime') and c.relkind in('r','p','v','m','f'))),
    'publications',(select coalesce(jsonb_agg(jsonb_build_object('publication',pubname,'schema',schemaname,'table',tablename) order by pubname,schemaname,tablename),'[]') from pg_publication_tables)),
"""
(O/'catalog-query.sql').write_text(q.replace(needle,needle+coverage))
gate=(repo/'scripts/supabase-compat/check-permission-contract.mjs').read_text()
gate="import {checkCarteraCoverage} from './cartera-coverage-gate.mjs';\n"+gate
needle="  const previous = new Map(objects(before).map(o => [objectKey(o), o]));"
assert gate.count(needle)==1
gate=gate.replace(needle,"  errors.push(...checkCarteraCoverage(after));\n"+needle)
(O/'check-permission-contract.mjs').write_text(gate)
print('Prepared coverage query and mandatory contract-gate candidate only; no active files changed.')
