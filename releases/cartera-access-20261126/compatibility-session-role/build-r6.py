from pathlib import Path
import hashlib,json
R=Path(__file__).resolve().parent;B=R.parent;O=R/'candidate';O.mkdir(exist_ok=True)
m=json.loads((B/'claude-r5-input-manifest.json').read_text())
def pin(name):
 s=(B/name).read_text();assert hashlib.sha256(s.encode()).hexdigest()==m['sources'][name],name;return s
def one(s,a,b):
 assert s.count(a)==1,(a[:80],s.count(a));return s.replace(a,b,1)
managed='''create function kora_private.cartera_assert_managed() returns void language plpgsql security definer set search_path='' as $$
declare expected jsonb:='__INV__'::jsonb;actual jsonb;
begin
 select coalesce(jsonb_agg(jsonb_build_object('schema',n.nspname,'name',c.relname,'kind',c.relkind) order by n.nspname,c.relname),'[]') into actual from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace where n.nspname in('storage','realtime') and c.relkind in('r','p','v','m','f');
 if actual is distinct from expected then raise exception 'cartera_managed_inventory_changed';end if;
 if exists(select 1 from pg_namespace where nspname in('storage','realtime') and (has_schema_privilege('kora_cartera_session',oid,'USAGE') or has_schema_privilege('kora_cartera_session',oid,'CREATE'))) then raise exception 'cartera_managed_surface_not_isolated';end if;
 if exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in('storage','realtime') and ((c.relkind in('r','p','v','m','f') and (has_table_privilege('kora_cartera_session',c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') or has_any_column_privilege('kora_cartera_session',c.oid,'SELECT,INSERT,UPDATE,REFERENCES'))) or(c.relkind='S' and has_sequence_privilege('kora_cartera_session',c.oid,'USAGE,SELECT,UPDATE')) or c.relowner='kora_cartera_session'::regrole)) then raise exception 'cartera_managed_surface_not_isolated';end if;
end$$;
revoke all on function kora_private.cartera_assert_managed() from public,anon,authenticated,service_role,kora_cartera_operator,kora_cartera_session;
'''.replace('__INV__',json.dumps(json.loads((B/'baseline/managed-relations.json').read_text()),separators=(',',':')))
safe=(R/'safe-message-partition.sql.fragment').read_text().strip()
managed=managed.replace("where n.nspname in('storage','realtime') and c.relkind in('r','p','v','m','f');","where n.nspname in('storage','realtime') and c.relkind in('r','p','v','m','f') and not ("+safe+");")
old_managed=pin('managed-coverage.sql.in').replace('__MANAGED_RELATIONS__',json.dumps(json.loads((B/'baseline/managed-relations.json').read_text()),separators=(',',':')))
old_pre=old_managed.split('as $$',1)[1].split('$$;',1)[0]+';'
new_pre=managed.split('as $$',1)[1].split(" if exists(select 1 from pg_namespace",1)[0]+'end;'
role="""create role kora_cartera_session nologin noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls;
grant kora_cartera_session to authenticator with admin false,inherit false,set true;
alter role kora_cartera_session set statement_timeout='8s';
alter role kora_cartera_session set lock_timeout='2s';
grant usage on schema public to kora_cartera_session;
"""
wrapper="""create or replace function public.kora_confirmacion_deuda_pre_request() returns void language plpgsql security definer set search_path='' as $$
begin
 if current_setting('role',true)='kora_cartera_session' or kora_cartera_policy.cartera_principal_restringido() then
  perform kora_private.cartera_api_pre_request();return;
 end if;
 if current_setting('request.method',true)='POST' and current_setting('request.path',true) in('/rpc/cartera_operador_inicio','rpc/cartera_operador_inicio') then
  perform kora_private.cartera_api_pre_request();return;
 end if;
 perform kora_private.exigir_confirmacion_deuda_api();
 perform kora_private.cartera_api_pre_request();
end$$;
grant execute on function public.kora_confirmacion_deuda_pre_request() to kora_cartera_session;
"""
actor_check=""" if current_setting('role',true) is distinct from 'kora_cartera_session' or coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb->>'role' is distinct from 'kora_cartera_session' or coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb->>'sub' is distinct from public.cartera_subject()::text or coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb->>'is_anonymous'='true' then raise sqlstate 'PT403' using message='cartera_session_role_required';end if;
"""
for filename in ['scope-core.sql','scope-full.sql']:
 s=pin('candidate/'+filename)
 s=one(s,old_pre,new_pre)
 s=one(s,old_managed,managed)
 s=one(s,'create function kora_private.cartera_catalog_fingerprint()', (R/'safe-message-partition.sql.in').read_text()+'\ncreate function kora_private.cartera_catalog_fingerprint()')
 s=one(s,"create role kora_cartera_operator nologin",role+"create role kora_cartera_operator nologin")
 s=one(s," if exists(select 1 from pg_catalog.pg_roles where rolname='kora_cartera_operator')", " if current_setting('createrole_self_grant')<>'' or exists(select 1 from pg_roles where rolname='kora_cartera_session') then raise exception 'cartera_session_creation_precondition';end if;\n if exists(select 1 from pg_catalog.pg_roles where rolname='kora_cartera_operator')")
 s=one(s,'grant execute on function public.cartera_subject() to public;',"revoke all on function public.cartera_subject() from public,anon,authenticated,service_role,kora_cartera_session;\ngrant execute on function public.cartera_subject() to anon,authenticated,service_role,kora_cartera_operator;")
 s=one(s," if not kora_cartera_policy.cartera_principal_restringido() then raise sqlstate 'PT403' using message='cartera_dedicated_actor_required';end if;",actor_check+" if not kora_cartera_policy.cartera_principal_restringido() then raise sqlstate 'PT403' using message='cartera_dedicated_actor_required';end if;")
 s=one(s," if not kora_cartera_policy.cartera_principal_restringido() then return jsonb_build_object('restricted',false);end if;", " if not kora_cartera_policy.cartera_principal_restringido() then\n  if current_setting('role',true)='kora_cartera_session' then raise sqlstate 'PT403' using message='cartera_dedicated_actor_required';end if;\n  return jsonb_build_object('restricted',false);\n end if;\n"+actor_check)
 s=one(s," if not kora_cartera_policy.cartera_principal_restringido() then return;end if;", " if current_setting('role',true) is distinct from 'kora_cartera_session' and not kora_cartera_policy.cartera_principal_restringido() then return;end if;\n"+actor_check+" if not kora_cartera_policy.cartera_principal_restringido() then raise sqlstate 'PT403' using message='cartera_dedicated_actor_required';end if;")
 # Preserve the old debt guard exactly and replace only its reviewed wrapper.
 start=s.index('create or replace function public.kora_confirmacion_deuda_pre_request()')
 end=s.index('end$$;',start)+len('end$$;')
 s=s[:start]+wrapper+s[end:]
 oldcheck="md5(pg_catalog.pg_get_functiondef('public.kora_confirmacion_deuda_pre_request()'::regprocedure))<>'5a549a460deb7bc53e16d13f52c40cf1'"
 expected=hashlib.md5(wrapper.split('as $$',1)[1].split('$$;',1)[0].encode()).hexdigest()
 s=one(s,oldcheck,"(select md5(prosrc) from pg_proc where oid='public.kora_confirmacion_deuda_pre_request()'::regprocedure)<>'"+expected+"'")
 s=one(s,"'postgres','kora_cartera_operator'))", "'postgres','kora_cartera_operator','kora_cartera_session'))")
 s=one(s,"where n.nspname in('public','kora_private','kora_cartera_policy') or(p.oid='auth.uid()'::regprocedure)","where n.nspname in('public','kora_private','kora_cartera_policy','storage','realtime') or(p.oid='auth.uid()'::regprocedure)")
 s=one(s,"where n.nspname='public' or(n.nspname='kora_private' and c.relname like 'cartera_%') or n.nspname in('storage','realtime')", "where n.nspname not in('pg_catalog','information_schema') and n.nspname !~ '^pg_(toast|temp)' and c.relkind in('r','p','v','m','f','S') and not kora_private.cartera_safe_message_partition(c.oid)")
 s=one(s," 'members',", " 'role_settings',(select jsonb_agg(jsonb_build_object('database',setdatabase,'role',setrole,'settings',setconfig) order by setdatabase,setrole) from pg_db_role_setting),\n 'members',")
 s=one(s,"perform kora_private.cartera_assert_coverage();perform kora_private.cartera_assert_dependencies();", "perform kora_private.cartera_assert_coverage();perform kora_private.cartera_assert_dependencies();perform kora_private.cartera_assert_session_surface();")
 s=one(s,"create function kora_private.cartera_assert_ready()",(R/'session-surface.sql.in').read_text()+"\ncreate function kora_private.cartera_assert_ready()")
 # Grant from final owner, neutralizing Supabase default ACL including installer.
 signatures=['cartera_operador_inicio()']
 if filename=='scope-full.sql':signatures+=['cartera_operador_datos(text,date,uuid,uuid,integer,integer,uuid)','cartera_operador_guardar_gestion(uuid,uuid,text,text,text,date,numeric)','cartera_operador_solicitar_provision(uuid,jsonb)']
 grants='set local role kora_cartera_operator;\n'
 for sig in signatures:
  grants+=f'revoke all on function public.{sig} from public,anon,authenticated,service_role,postgres,kora_cartera_session;\n'
  grants+=f'grant execute on function public.{sig} to kora_cartera_operator,kora_cartera_session'+(',authenticated' if sig=='cartera_operador_inicio()' else '')+';\n'
 grants+='reset role;\n'
 s=one(s,'revoke create on schema public,kora_private from kora_cartera_operator;',grants+'revoke create on schema public,kora_private from kora_cartera_operator;')
 (O/filename).write_text(s)
(R/'r6-build-manifest.json').write_text(json.dumps({'preparation_only':True,'base_source_manifest_sha256':hashlib.sha256((B/'claude-r5-input-manifest.json').read_bytes()).hexdigest(),'outputs':{f.name:hashlib.sha256(f.read_bytes()).hexdigest() for f in O.glob('*.sql')},'production_writes':0},indent=2)+'\n')
print('R6 SQL candidates generated without changing R5 or production')
