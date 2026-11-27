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
catalog=(Path(__file__).parent/'candidate/catalog-query.sql').read_text()
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
 capture('after')
 check('R6 installed without enabling its contract',sql('select not enabled from kora_private.cartera_contract')=='t')
 sql("update public.perfiles set rol='operador_cartera' where id='"+people[0]['id']+"';")
 expected=sql('select fingerprint from kora_private.cartera_contract')
 sql("select kora_private.cartera_activate('"+expected+"');",'postgres')
 check('native non-superuser installation/activation passed',sql('select enabled from kora_private.cartera_contract')=='t')
 sql("notify pgrst,'reload schema';notify pgrst,'reload config';")
 deadline=time.time()+20
 while time.time()<deadline:
  status,cached=request('/rpc/cartera_operador_inicio',{},ordinary)
  if status==200 and cached=={'restricted':False}:break
  time.sleep(.2)
 else:raise RuntimeError('Schema/config hot reload not observed')
 check('new bootstrap observed after real hot reload without restart',True)
 rt.emit('R6 installed; validating real Auth to PostgREST end-to-end')
 boot=value('/rpc/cartera_operador_inicio',{},dedicated)
 check('real signed dedicated JWT opens only its own Cartera profile',boot['restricted'] and boot['profile']['id']==people[0]['id'] and boot['manage'] and not boot['authorizer'])
 check('ordinary signed user bootstrap remains unrestricted',value('/rpc/cartera_operador_inicio',{},ordinary)=={'restricted':False})
 sql('create table realtime.fixture_day partition of realtime.messages for values from(0) to(10);create index on realtime.fixture_day(id);','postgres')
 check('native same-owner inaccessible partition preserves sealed catalog',sql('select kora_private.cartera_catalog_fingerprint()')==expected and value('/rpc/cartera_operador_inicio',{},dedicated)['restricted'])
 sql('grant select on realtime.fixture_day to kora_cartera_session;','postgres')
 status,denial=request('/rpc/cartera_operador_inicio',{},dedicated)
 check('native granted partition closes API without resealing',status==200 and denial.get('__cartera_error',{}).get('message')=='cartera_contract_not_active')
 sql('revoke select on realtime.fixture_day from kora_cartera_session;alter table realtime.messages detach partition realtime.fixture_day;','postgres')
 status,denial=request('/rpc/cartera_operador_inicio',{},dedicated)
 check('native detached partition closes API',status==200 and denial.get('__cartera_error',{}).get('message')=='cartera_contract_not_active')
 sql('drop table realtime.fixture_day;','postgres')
 check('native partition rotation removal restores original seal',sql('select kora_private.cartera_catalog_fingerprint()')==expected and value('/rpc/cartera_operador_inicio',{},dedicated)['restricted'])

 rows=value('/rpc/cartera_operador_datos',{'p_dataset':'portfolio'},dedicated)
 check('classic portfolio shows only assigned origin and validated repayment',len(rows)==1 and rows[0]['origen_codigo']=='fiction-A' and rows[0]['validated_repayments']==50000)
 for path,method,args,headers in [('/clientes','GET',None,{}),('/rpc/rol_actual','POST',{},{}),('/rpc/cartera_operador_inicio','GET',None,{}),('/rpc/cartera_operador_inicio','HEAD',None,{}),('/rpc/cartera_operador_inicio','POST',{}, {'accept':'application/vnd.pgrst.plan+json'}),('/rpc/cartera_operador_inicio','POST',{}, {'content-profile':'storage'}),('/','GET',None,{})]:
  status,data=request(path,args,dedicated,method,headers)
  check('dedicated prohibited HTTP route '+method+' '+path+' '+str(headers),status==403 or (status==406 and isinstance(data,dict) and data.get('code') in ('PGRST106','PGRST107')))
 cuts=value('/rpc/cartera_operador_datos',{'p_dataset':'cuts','p_month':'2026-10-01'},dedicated)
 check('cut history read is complete without raw rows',len(cuts)==1 and cuts[0]['row_count']==1 and 'source_rows'not in cuts[0])
 event={'p_request_id':'44444444-4444-4444-8444-444444444444','p_operation_id':'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1','p_event_type':'note','p_channel':'internal','p_note':'Fictional complete R6 API test'}
 a=value('/rpc/cartera_operador_guardar_gestion',event,dedicated);b=value('/rpc/cartera_operador_guardar_gestion',event,dedicated)
 check('follow-up saves once and creates no payment',a['id']==b['id'] and b['duplicate'] and not a['payment_created'])
 payload={'kind':'request','parent_id':None,'cut_id':cuts[0]['id'],'operation_id':event['p_operation_id'],'amount_cents':6000,'allocations':[],'purpose':'installments','note':'Fictional native request','evidence':None,'evidence_sha256':None}
 args={'p_request_id':'55555555-5555-4555-8555-555555555555','p_payload':payload}
 a=value('/rpc/cartera_operador_solicitar_provision',args,dedicated);b=value('/rpc/cartera_operador_solicitar_provision',args,dedicated)
 check('provision request saves once and does not execute payment',a['id']==b['id'] and not a['payment_executed'])
 for kind in ['funding','authorize','execute','release','reject']:
  status,data=request('/rpc/cartera_operador_solicitar_provision',{**args,'p_payload':{**payload,'kind':kind}},dedicated)
  check('operator cannot '+kind,status==200 and data.get('__cartera_error',{}).get('message')=='cartera_request_only')
 check('native source balance and payment history preserved',sql("select (select count(*) from credit_repayments)=1 and (select outstanding_amount=350000 from credit_portfolio_obligations where external_credit_id='fiction001')")=='t')
 # Deterministic clock affects only this disposable guard fixture; all other
 # guard logic is the exact old source. No production guard is rewritten.
 guard=json.loads(sql("select to_json(pg_get_functiondef('kora_private.exigir_confirmacion_deuda_api()'::regprocedure))"))
 guard=guard.replace("clock_timestamp() at time zone 'America/Bogota'","timestamp '2026-11-26 12:00:00'")
 sql(guard+';')
 sql("update kora_private.confirmacion_deuda_config set inicio='2000-01-01';update perfiles set rol='admin_tienda',tienda_codigo='fiction-A' where id='"+people[1]['id']+"';")
 status,denial=request('/rpc/rol_actual',{},ordinary)
 check('active debt guard rejects ordinary unconfirmed store via API',status==403 and denial.get('hint')=='KORA_CONFIRMACION_DEUDA_PENDIENTE')
 check('ordinary store bootstrap remains explicit false with active debt guard',value('/rpc/cartera_operador_inicio',{},ordinary)=={'restricted':False})
 sql("update perfiles set rol='gerencia' where id='"+people[1]['id']+"';")
 check('Gerencia ordinary RPC survives active debt guard',value('/rpc/rol_actual',{},ordinary)=='gerencia')
 # A locally substituted response-only probe reads actual PostgREST settings.
 # It is NOT the application function and does not claim to test its contract.
 sql("create or replace function public.cartera_operador_inicio() returns jsonb language sql security definer set search_path='' as $$ select jsonb_build_object('role',current_setting('role',true),'statement_timeout',current_setting('statement_timeout'),'lock_timeout',current_setting('lock_timeout')) $$;")
 observed=value('/rpc/cartera_operador_inicio',{},dedicated)
 check('new client role settings apply after observed hot reload',observed=={'role':'kora_cartera_session','statement_timeout':'8s','lock_timeout':'2s'})
 result={'passed':True,'scenario':scenario,'checks':checks,'production_operations':0,'external_sends':0,'fixture_scope':'197 named public tables with fictional reduced dependencies and 13 managed relation models; NOT a production clone or hosted gateway test','runtime':'official PostgreSQL/Auth/PostgREST on an internal network, no host ports','source_sha256':{p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in [Path(__file__),Path(sys.argv[2]),Path(sys.argv[3]),Path(sys.argv[4]),Path(__file__).with_name('local-test-runtime.py')]},'catalog_query_sha256':hashlib.sha256(catalog.encode()).hexdigest(),'images':{k:rt.command(['image','inspect',v,'--format','{{json .RepoDigests}}']) for k,v in rt.images.items()}}
 (OUT/'result.json').write_text(json.dumps(result,indent=2)+'\n');rt.emit('complete R6 native API checks passed')
except Exception as e:
 for name in created:
  p=subprocess.run(rt.DOCKER+['logs','--tail','80',name],text=True,capture_output=True);f=OUT/(name+'.log');f.write_text(p.stdout+p.stderr);f.chmod(0o600)
 (OUT/'failure.json').write_text(json.dumps({'type':type(e).__name__,'message':str(e),'checks':checks},indent=2)+'\n');print(json.dumps({'passed':False,'message':str(e)}),flush=True);sys.exit(1)
finally:
 for name in reversed(created):subprocess.run(rt.DOCKER+['rm','-f','-v',name],capture_output=True)
 if network_created:subprocess.run(rt.DOCKER+['network','rm',rt.network],capture_output=True)
 for f in OUT.glob('*.env'):f.unlink()
