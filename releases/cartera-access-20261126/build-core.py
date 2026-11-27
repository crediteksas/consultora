from pathlib import Path
import json,re,hashlib
ROOT=Path(__file__).resolve().parent
# Repository-only, reviewed inputs. Refuse drift instead of regenerating pins.
pins=json.loads((ROOT/'baseline/build-source-pins.json').read_text())
for name,wanted in pins.items():
    assert hashlib.sha256((ROOT/'baseline'/name).read_bytes()).hexdigest()==wanted, 'Review changed baseline first: '+name
public=json.loads((ROOT/'baseline/public-relations.json').read_text())
old=(ROOT/'baseline/old-api-guard.sql').read_text()
a={'guard':(ROOT/'baseline/old-debt-guard.sql').read_text()}
old_check=json.loads((ROOT/'baseline/old-role-check.json').read_text())
template=(ROOT/'scope-core.sql.in').read_text().replace('__OLD_ROLE_CHECK__',"'"+old_check.replace("'","''")+"'")
new_check=old_check.replace("'asesor'::text]", "'asesor'::text, 'operador_cartera'::text]")
assert new_check!=old_check
template=template.replace('__NEW_ROLE_CHECK__',"'"+new_check.replace("'","''")+"'")
managed=json.dumps(json.loads((ROOT/'baseline/managed-relations.json').read_text()),separators=(',',':'))
managed_assert=(ROOT/'managed-coverage.sql.in').read_text().replace('__MANAGED_RELATIONS__',managed)
managed_body=managed_assert.split('as $$',1)[1].split('$$;',1)[0]
template=template.replace('__MANAGED_ASSERTION__',managed_assert).replace('__MANAGED_PREFLIGHT__',managed_body+';')
sql=template.replace('__PUBLIC_RELATIONS__',','.join("'"+p.replace("'","''")+"'" for p in public)).replace('__OLD_API_MD5__',hashlib.md5(old.encode()).hexdigest()).replace('__OLD_DEBT_MD5__',hashlib.md5(a['guard'].encode()).hexdigest())
(ROOT/'candidate').mkdir(exist_ok=True);(ROOT/'candidate/scope-core.sql').write_text(sql)
captured=json.loads((ROOT/'baseline/collection-callgraph.json').read_text())['functions']
rewrite_names={'tiene_capacidad_cartera','cobra_quality_operator','cobra_krediya_save_collection','cobra_krediya_validate_event'}
rewrites=[];assertions=[]
ready_assertions=[]
for f in captured:
    if f['name'] not in rewrite_names:continue
    original=f['definition'];assert 'auth.uid()' in original
    # Resolve by exact identity arguments, not overload name or a client value.
    signature={'tiene_capacidad_cartera':'public.tiene_capacidad_cartera(text)','cobra_quality_operator':'public.cobra_quality_operator()','cobra_krediya_save_collection':'public.cobra_krediya_save_collection(uuid,uuid,text,text,text,date,numeric)','cobra_krediya_validate_event':'public.cobra_krediya_validate_event()'}[f['name']]
    assertions.append(" if md5(pg_catalog.pg_get_functiondef('"+signature+"'::regprocedure))<>'"+hashlib.md5(original.encode()).hexdigest()+"' then raise exception 'cartera_identity_callsite_changed';end if;")
    rewrites.append(original.replace('auth.uid()','public.cartera_subject()').rstrip().rstrip(';')+';\n')
    ready_assertions.append(" if md5(pg_catalog.pg_get_functiondef('"+signature+"'::regprocedure))<>'"+hashlib.md5(original.replace('auth.uid()','public.cartera_subject()').encode()).hexdigest()+"' then raise exception 'cartera_identity_callsite_changed';end if;")
assert len(rewrites)==len(rewrite_names)
fund_sql=(ROOT.parents[1]/'supabase/migrations/20261126154810_cobra_krediya_evolution_provision_review.sql').read_text()
fund_before=json.loads((ROOT/'baseline/provision-identity-before.json').read_text())
assert hashlib.sha256(fund_sql.encode()).hexdigest()==fund_before['source_sha256'], 'Recompile and review fund function preconditions after changing the draft'
for f in fund_before['functions']:
    assertions.append(" if md5(pg_catalog.pg_get_functiondef('public."+f['signature']+"'::regprocedure))<>'"+hashlib.md5(f['definition'].encode()).hexdigest()+"' then raise exception 'cartera_fund_callsite_changed';end if;")
    ready_assertions.append(" if md5(pg_catalog.pg_get_functiondef('public."+f['signature']+"'::regprocedure))<>'"+hashlib.md5(f['definition'].replace('auth.uid()','public.cartera_subject()').encode()).hexdigest()+"' then raise exception 'cartera_fund_callsite_changed';end if;")
for name in ['cobra_provision_authorizer','cobra_provision_prepare_action']:
    original=re.search(r'create function public\.'+name+r'\([^\n]*[\s\S]*?\$\$;',fund_sql)[0]
    assert 'auth.uid()' in original
    rewrites.append(original.replace('create function','create or replace function',1).replace('auth.uid()','public.cartera_subject()'))
trust=json.loads((ROOT/'baseline/trust-dependencies.json').read_text())
trust_assertions=[]
for f in trust['functions']:
    trust_assertions.append(" if md5(pg_catalog.pg_get_functiondef('public."+f['signature']+"'::regprocedure))<>'"+f['md5']+"' then raise exception 'cartera_trusted_dependency_changed';end if;")
v=trust['view'];trust_assertions.append(" if md5(pg_catalog.pg_get_viewdef('"+v['signature']+"'::regclass,true))<>'"+v['md5']+"' then raise exception 'cartera_trusted_view_changed';end if;")
for f in json.loads((ROOT/'baseline/draft-trust-dependencies.json').read_text())['functions']:
    trust_assertions.append(" if md5(pg_catalog.pg_get_functiondef('public."+f['signature']+"'::regprocedure))<>'"+f['md5']+"' then raise exception 'cartera_draft_dependency_changed';end if;")
view_check=" if not coalesce((select reloptions @> array['security_invoker=true'] from pg_catalog.pg_class where oid='public.creditos_cartera_operaciones'::regclass),false) then raise exception 'cartera_view_must_be_invoker';end if;\n"
identity_sql="-- Exact same invoker functions, owners, ACLs and checks; only caller-UUID lookup changes.\ndo $identity_preflight$ begin\n"+view_check+'\n'.join(assertions+trust_assertions)+"\nend $identity_preflight$;\n"+'\n'.join(rewrites)
identity_sql+="\ncreate or replace function kora_private.cartera_assert_dependencies() returns void language plpgsql security invoker set search_path='' as $$begin\n"+view_check+'\n'.join(ready_assertions+trust_assertions)+"\nend$$;\n"
(ROOT/'candidate/identity-callsites.sql').write_text(identity_sql)
full=sql.replace('-- Enablement and the actual profile assignment require the separate reviewed activation.',identity_sql+'\n'+(ROOT/'scope-data.sql.in').read_text()+'\n-- Enablement and the actual profile assignment require the separate reviewed activation.')
(ROOT/'candidate/scope-full.sql').write_text(full)

print(json.dumps({'publicRelations':len(public),'productionWrites':0,'candidate':str(ROOT/'candidate/scope-core.sql')}))
