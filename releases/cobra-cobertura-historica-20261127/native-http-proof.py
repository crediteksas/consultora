"""Official local services + complete R6 SQL + fictional scoped dependency model.
No production database/network/records. Does not certify the hosted gateway.
"""
from pathlib import Path
import importlib.util,sys,json,hashlib,time,subprocess
spec=importlib.util.spec_from_file_location('local_runtime',Path(__file__).with_name('local-test-runtime.py'));rt=importlib.util.module_from_spec(spec);spec.loader.exec_module(rt)
OUT=rt.OUT;fixture=Path(sys.argv[2]).read_text();fund=Path(sys.argv[3]).read_text();candidate=Path(sys.argv[4]).read_text()
checks=[];created=rt.created;network_created=False
scenario=sys.argv[5] if len(sys.argv)>5 else 'upgrade'
assert scenario in ('upgrade','rebuild')
catalog=(Path(__file__).resolve().parent.parent.parent/'scripts/supabase-compat/catalog-query.sql').read_text()
def capture(name):
 data=json.loads(sql(catalog));data.pop('captured_at',None)
 (OUT/(name+'.json')).write_text(json.dumps(data,indent=2)+'\n')
 return data

def check(name,ok):
 if not ok:raise RuntimeError('Failed assertion: '+name)
 checks.append(name);rt.checks.append(name)
def sql(source,role='supabase_admin'):
 p=subprocess.run(rt.DOCKER+['exec','-i',rt.db_name,'psql','-X','-q','-t','-A','-U',role,'-d','postgres','-v','ON_ERROR_STOP=1'],input=source,text=True,capture_output=True,timeout=45)
 if p.returncode:
  f=OUT/'sql-error.log';f.write_text(p.stderr);f.chmod(0o600)
  raise RuntimeError('Local R6 SQL failed; private diagnostic saved')
 return p.stdout.strip().splitlines()[-1] if p.stdout.strip() else ''
def request(path,body=None,token=None,method='POST',headers=None):return rt.request(rt.rest_url,path,method,body,token,headers)
def value(path,args,token):
 status,data=request(path,args,token)
 if status!=200:raise RuntimeError('R6 API status '+str(status)+' code '+str(data.get('code') if isinstance(data,dict) else 'unknown'))
 if isinstance(data,dict) and '__cartera_error'in data:raise RuntimeError('R6 controlled API error '+data['__cartera_error']['code']+' '+data['__cartera_error']['message'])
 return data
try:
 rt.emit('starting local official stack for complete R6 SQL')
 rt.command(['network','create','--internal','--label','cartera.role-proof='+rt.suffix,rt.network]);network_created=True
 rt.launch(rt.db_name,rt.images['db'],{'POSTGRES_PASSWORD':rt.password})
 deadline=time.time()+60
 while time.time()<deadline:
  p=subprocess.run(rt.DOCKER+['exec',rt.db_name,'pg_isready','-h','127.0.0.1','-U','postgres'],capture_output=True,timeout=10)
  if p.returncode==0:break
  time.sleep(.5)
 else:raise RuntimeError('Local PostgreSQL bootstrap timeout')
 sql("alter role supabase_auth_admin password '"+rt.password+"';alter role authenticator password '"+rt.password+"';")
 rt.launch(rt.auth_name,rt.images['auth'],{'GOTRUE_API_HOST':'0.0.0.0','GOTRUE_API_PORT':9999,'API_EXTERNAL_URL':rt.auth_url,'GOTRUE_DB_DRIVER':'postgres','GOTRUE_DB_DATABASE_URL':'postgres://supabase_auth_admin:'+rt.password+'@'+rt.db_name+':5432/postgres','GOTRUE_SITE_URL':rt.auth_url,'GOTRUE_DISABLE_SIGNUP':'true','GOTRUE_JWT_ADMIN_ROLES':'service_role','GOTRUE_JWT_DEFAULT_GROUP_NAME':'authenticated','GOTRUE_JWT_AUD':'authenticated','GOTRUE_JWT_EXP':120,'GOTRUE_JWT_SECRET':rt.jwt_secret,'GOTRUE_EXTERNAL_EMAIL_ENABLED':'true','GOTRUE_MAILER_AUTOCONFIRM':'true','GOTRUE_SMTP_HOST':''})
 rt.wait_http(rt.auth_url,'/health')
 admin=rt.sign({'aud':'authenticated','role':'service_role','iat':int(time.time()),'exp':int(time.time())+600})
 people=[]
 for i in range(2):
  email='full-r6-'+rt.suffix+'-'+str(i)+'@example.invalid';password=rt.secrets.token_hex(16)
  status,data=rt.request(rt.auth_url,'/admin/users','POST',{'email':email,'password':password,'email_confirm':True},admin)
  check('fictional Auth user created '+str(i),status==200 and data.get('role')=='authenticated')
  people.append({'id':data['id'],'email':email,'password':password})
 status,data=rt.request(rt.auth_url,'/admin/users/'+people[0]['id'],'PUT',{'role':'kora_cartera_session'},admin)
 check('dedicated Auth role assigned before first login',status==200 and data['role']=='kora_cartera_session')
 fixture=fixture.replace('11111111-1111-4111-8111-111111111111',people[0]['id']).replace('22222222-2222-4222-8222-222222222222',people[1]['id'])
 # Preparation may own the local provider skeleton; production ownership is
 # independently precondition-checked, never changed by the candidate SQL.
 fixture=fixture.replace('create schema if not exists realtime authorization postgres;','create schema if not exists realtime authorization postgres;alter schema realtime owner to postgres;').replace('create schema if not exists storage authorization postgres;','create schema if not exists storage authorization postgres;alter schema storage owner to postgres;')
 sql(fixture)
 # The fixture models this existing column used by the read-only coverage query.
 sql('alter table public.aliados_reversiones add column original_operation_id uuid;')
 check('before phase has exact 197 public table names',sql("select count(*)=197 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in('r','p')")=='t')
 rt.launch(rt.rest_name,rt.images['rest'],{'PGRST_DB_URI':'postgres://authenticator:'+rt.password+'@'+rt.db_name+':5432/postgres','PGRST_DB_SCHEMAS':'public','PGRST_DB_PRE_REQUEST':'public.kora_confirmacion_deuda_pre_request','PGRST_DB_ANON_ROLE':'anon','PGRST_JWT_SECRET':rt.jwt_secret,'PGRST_JWT_AUD':'authenticated','PGRST_SERVER_PORT':3000})
 rt.wait_http(rt.rest_url,'/')

 dedicated=rt.signin(people[0]['email'],people[0]['password']);ordinary=rt.signin(people[1]['email'],people[1]['password'])
 status,missing=request('/rpc/cartera_operador_inicio',{},ordinary)
 check('new bootstrap absent in already-running API before install',status==404 and missing.get('code')=='PGRST202')
 if scenario=='rebuild':sql('alter default privileges for role postgres in schema public revoke all on tables from anon,authenticated,service_role;alter default privileges for role postgres in schema public revoke execute on functions from anon,authenticated,service_role;alter default privileges for role postgres revoke execute on functions from public;')
 capture('before')
 sql(fund,'postgres')
 public_acl=sql("select coalesce(jsonb_agg(jsonb_build_object('schema',n.nspname,'name',c.relname,'kind',c.relkind)),'[]') from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname not in('pg_catalog','information_schema') and n.nspname !~ '^pg_(toast|temp)' and exists(select 1 from aclexplode(coalesce(c.relacl,acldefault(case when c.relkind='S' then 'S'::\"char\" else 'r'::\"char\" end,c.relowner))) a where a.grantee=0)")
 (OUT/'public-relation-acl-diagnostic.json').write_text(public_acl+'\n')
 sql(candidate,'postgres')
 # This fictional database has different definitions for the surrounding
 # guards. Substitute only their fixture hashes, as in the isolated tests;
 # the actual function replacement and postcondition remain byte-identical.
 migration=Path(sys.argv[6]).read_text()
 pins=[('public.kora_confirmacion_deuda_pre_request()','8c27a5975628606baa2093c610f3474c'),('kora_private.exigir_confirmacion_deuda_api()','a8aad0e67f70551625e9ede1937b92cd'),('kora_private.cartera_api_pre_request()','52da4eb5ffd077c6fb702fb0325ffd52'),('public.cobra_quality_operator()','367477a866771c9bf1cb8bed602fbbbb')]
 for signature, expected in pins:
  actual=sql("select md5(pg_get_functiondef('"+signature+"'::regprocedure))")
  check('fixture pin resolved '+signature,len(actual)==32)
  migration=migration.replace(expected,actual)
 fixture_acl=sql("select p.proacl::text from pg_proc p where p.oid='public.kora_confirmacion_deuda_pre_request()'::regprocedure")
 fixture_owner=sql("select pg_get_userbyid(p.proowner) from pg_proc p where p.oid='public.kora_confirmacion_deuda_pre_request()'::regprocedure")
 fixture_config=sql("select p.proconfig::text from pg_proc p where p.oid='public.kora_confirmacion_deuda_pre_request()'::regprocedure")
 (OUT/'fixture-guard-diagnostic.json').write_text(json.dumps({'acl':fixture_acl,'owner':fixture_owner,'config':fixture_config}))
 migration=migration.replace('{postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres,kora_cartera_session=X/postgres}',fixture_acl)
 sql('begin;'+migration+'commit;','postgres')
 check('independent store-debt guard installed' ,sql("select md5(pg_get_functiondef('public.kora_confirmacion_deuda_pre_request()'::regprocedure))")=='9bed256af7305c4752bdde1a865bcb6e')
 store_migration=Path(sys.argv[8]).read_text()
 actual=sql("select md5(pg_get_functiondef('public.cobra_krediya_prepare_cut()'::regprocedure))")
 store_migration=store_migration.replace('068b76530485172733853b40bf54df43',actual)
 sql(store_migration,'postgres')
 check('provider store migration installed',"'store',btrim(r->>'store')" in json.loads(sql("select to_json(pg_get_functiondef('public.cobra_krediya_prepare_cut()'::regprocedure))")))
 capture('after')
 check('R6 installed without enabling its contract',sql('select not enabled from kora_private.cartera_contract')=='t')
 # The existing dedicated-session seal correctly refuses the changed guard.
 # That unused restricted mode is left disabled in production.
 try:
  sql("select kora_private.cartera_activate(fingerprint) from kora_private.cartera_contract",'postgres')
  raise RuntimeError('Dedicated guard unexpectedly accepted changed function')
 except RuntimeError as e:
  if 'Local R6 SQL failed' not in str(e):raise
  check('dedicated mode remains safely closed on guard change','cartera_existing_guard_changed' in (OUT/'sql-error.log').read_text())
 guard=json.loads(sql("select to_json(pg_get_functiondef('kora_private.exigir_confirmacion_deuda_api()'::regprocedure))"))
 original_guard=guard
 guard=guard.replace("clock_timestamp() at time zone 'America/Bogota'","timestamp '2026-11-26 12:00:00'")
 sql(guard+';')
 sql("update kora_private.confirmacion_deuda_config set inicio='2000-01-01';update perfiles set rol='admin_tienda',tienda_codigo='fiction-A' where id='"+people[1]['id']+"';insert into credit_portfolio_operators values('"+people[1]['id']+"','manage',true);")
 status,data=request('/rpc/cobra_quality_operator',{},ordinary)
 check('authorized store manager can open independent KrediYA',status==200 and data==True)
 status,data=request('/rpc/rol_actual',{},ordinary)
 check('store debt still blocks ordinary store writes',status==403 and data.get('hint')=='KORA_CONFIRMACION_DEUDA_PENDIENTE')
 sql("update credit_portfolio_operators set active=false where perfil_id='"+people[1]['id']+"';")
 status,data=request('/rpc/cobra_quality_operator',{},ordinary)
 check('store account without portfolio permission gets no exception',status==403 and data.get('hint')=='KORA_CONFIRMACION_DEUDA_PENDIENTE')
 # Reproduce production's disabled dedicated contract with no principals.
 # All identities and records here are fictional, not a production clone.
 sql("delete from kora_private.cartera_principals;update public.credit_portfolio_operators set active=true where perfil_id='"+people[1]['id']+"';")
 sql(original_guard+';')
 capture('before_coverage')
 coverage=Path(sys.argv[7]).read_text()
 sql(coverage,'postgres')
 capture('after_coverage')
 sql(guard+';')
 sql("insert into kora_private.cobra_cobertura_autorizados(user_id) values('"+people[1]['id']+"');insert into kora_private.cobra_cobertura_historica(credit_id,cohort_month,kind,amount_pesos,source_sha256,source_row,source_name,recorded_by) values('fiction001','2026-10-01','installments',50,repeat('a',64),2,'fiction.xlsx','"+people[1]['id']+"');")
 status,data=request('/rpc/cobra_provision_book',{},ordinary)
 check('portfolio operator sees coverage despite store confirmation',status==200 and isinstance(data,dict) and isinstance(data.get('coverage'),dict) and data['coverage']['months'][0]['installments_pesos']==50)
 status,data=request('/rpc/rol_actual',{},ordinary)
 check('ordinary store operations still require store confirmation',status==403 and data.get('hint')=='KORA_CONFIRMACION_DEUDA_PENDIENTE')
 result={'passed':True,'scenario':scenario,'checks':checks,'production_operations':0,'external_sends':0,'fixture_scope':'197 fictional public tables, NOT a production clone; dedicated role remains disabled because its guard pin differs','runtime':'official PostgreSQL/Auth/PostgREST on an internal network, no host ports','catalog_query_sha256':hashlib.sha256(catalog.encode()).hexdigest(),'source_sha256':{p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in [Path(__file__),Path(sys.argv[2]),Path(sys.argv[3]),Path(sys.argv[4]),Path(sys.argv[6]),Path(sys.argv[7]),Path(sys.argv[8]),Path(__file__).with_name('local-test-runtime.py')]},'fixture_adjustments':'Replaced only preflight pins and ACL literal with fictional fixture values; production was not modified.'}
 (OUT/'result.json').write_text(json.dumps(result,indent=2)+'\n');rt.emit('independent Cartera permission checks passed')

except Exception as e:
 for name in created:
  p=subprocess.run(rt.DOCKER+['logs','--tail','80',name],text=True,capture_output=True);f=OUT/(name+'.log');f.write_text(p.stdout+p.stderr);f.chmod(0o600)
 (OUT/'failure.json').write_text(json.dumps({'type':type(e).__name__,'message':str(e),'checks':checks},indent=2)+'\n');print(json.dumps({'passed':False,'message':str(e)}),flush=True);sys.exit(1)
finally:
 for name in reversed(created):subprocess.run(rt.DOCKER+['rm','-f','-v',name],capture_output=True)
 if network_created:subprocess.run(rt.DOCKER+['network','rm',rt.network],capture_output=True)
 for f in OUT.glob('*.env'):f.unlink()
