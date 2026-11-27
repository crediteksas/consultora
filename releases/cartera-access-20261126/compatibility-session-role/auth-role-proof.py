"""Isolated Auth + PostgREST experiment. Fictional accounts; never production.

This tests the proposed role assumption, not the complete KORA candidate.
Run with an output directory outside the repository. Local test secrets stay
in memory/private files and are never emitted in the result.
"""
import base64,hashlib,hmac,json,secrets,subprocess,sys,time,uuid
from pathlib import Path
from urllib.request import Request,urlopen
from urllib.error import HTTPError,URLError

OUT=Path(sys.argv[1]);OUT.mkdir(parents=True,exist_ok=True,mode=0o700)
CTX='colima-cobra-krediya-20261125'
DOCKER=['docker','--context',CTX]
suffix=uuid.uuid4().hex[:10]
network='cartera-role-qa-'+suffix
db_name='cartera-role-db-'+suffix
auth_name='cartera-role-auth-'+suffix
rest_name='cartera-role-rest-'+suffix
bare_name='cartera-role-no-guard-'+suffix
images={'db':'public.ecr.aws/supabase/postgres:17.6.1.141','auth':'supabase/gotrue:v2.198.0','rest':'postgrest/postgrest:v16.5'}
password=secrets.token_hex(24);jwt_secret=secrets.token_hex(32)
created=[];checks=[];network_created=False;sessions={}
def emit(stage):print(json.dumps({'stage':stage,'checks':len(checks)}),flush=True)
def command(args,**options):
 options.setdefault('timeout',45)
 p=subprocess.run(DOCKER+args,text=True,capture_output=True,**options)
 if p.returncode:raise RuntimeError('Docker operation failed: '+args[0])
 return p.stdout.strip()
auth_url='http://auth.fixture.invalid'
rest_url='http://rest.fixture.invalid'
bare_url='http://no-guard.fixture.invalid'
def envfile(name,values):
 p=OUT/(name+'.env');p.write_text('\n'.join(k+'='+str(v) for k,v in values.items())+'\n');p.chmod(0o600);return str(p)
def launch(name,image,values):
 args=['run','-d','--name',name,'--label','cartera.role-proof='+suffix,'--network',network,'--env-file',envfile(name,values)]
 # All HTTP runs inside the internal network; no host ports are published.
 args.append(image);command(args);created.append(name)
def sql(text):
 p=subprocess.run(DOCKER+['exec','-i',db_name,'psql','-X','-q','-t','-A','-U','supabase_admin','-d','postgres','-v','ON_ERROR_STOP=1'],input=text,text=True,capture_output=True,timeout=30)
 if p.returncode:
  (OUT/'sql-error.log').write_text(p.stderr);(OUT/'sql-error.log').chmod(0o600)
  raise RuntimeError('Local fixture SQL failed; private diagnostic saved')
 return p.stdout.strip().splitlines()[-1] if p.stdout.strip() else ''
def request(base,path,method='GET',body=None,token=None,extra=None):
 headers={'Content-Type':'application/json',**(extra or {})}
 if token:headers['Authorization']='Bearer '+token
 # Keep HTTP on the internal Docker network. Colima's host port forwarding is
 # not assumed, and tokens/config are supplied on stdin, never process argv.
 internal='http://'+(auth_name+':9999' if base==auth_url else (bare_name+':3000' if base==bare_url else rest_name+':3000'))
 config=['url = '+json.dumps(internal+path),'request = '+json.dumps(method),'max-time = 5','noproxy = "*"']
 if method=='HEAD':config+=['head']
 config+=['header = '+json.dumps(k+': '+v) for k,v in headers.items()]
 if body is not None:config+=['data = '+json.dumps(json.dumps(body))]
 p=subprocess.run(DOCKER+['exec','-i',db_name,'curl','-sS','--config','-','-w','\n%{http_code}'],input='\n'.join(config)+'\n',text=True,capture_output=True,timeout=12)
 if p.returncode:
  # curl does not log request headers with these options. Preserve a bounded,
  # private transport diagnostic, never a request body/token or env file.
  f=OUT/'http-transport-error.json';f.write_text(json.dumps({'returncode':p.returncode,'stderr':p.stderr[:1000]}));f.chmod(0o600)
  raise ConnectionError('Local container HTTP transport unavailable (exit '+str(p.returncode)+')')
 data,status=p.stdout.rsplit('\n',1);status=int(status)
 try:return status,json.loads(data)
 except ValueError:return status,None
def wait_http(base,path):
 deadline=time.time()+60
 while time.time()<deadline:
  try:
   status,_=request(base,path)
   if status<500:return
  except (URLError,TimeoutError,ConnectionError):
   name=auth_name if base==auth_url else (bare_name if base==bare_url else rest_name)
   if command(['inspect','--format','{{.State.Running}}',name])!='true':raise RuntimeError('Local service exited during startup: '+('Auth' if base==auth_url else 'PostgREST'))
  time.sleep(.5)
 raise RuntimeError('Local service did not become healthy')
def b64(b):return base64.urlsafe_b64encode(b).rstrip(b'=').decode()
def sign(payload):
 data=b64(b'{"alg":"HS256","typ":"JWT"}')+'.'+b64(json.dumps(payload,separators=(',',':')).encode())
 return data+'.'+b64(hmac.new(jwt_secret.encode(),data.encode(),hashlib.sha256).digest())
def claims(token):return json.loads(base64.urlsafe_b64decode(token.split('.')[1]+'==='))
def check(name,condition):
 if not condition:raise RuntimeError('Failed assertion: '+name)
 checks.append(name)
def signin(email,pw):
 status,data=request(auth_url,'/token?grant_type=password','POST',{'email':email,'password':pw})
 check('password sign-in succeeds',status==200 and isinstance(data.get('access_token'),str))
 sessions[email]=data
 return data['access_token']

try:
 emit('starting isolated local services')
 command(['network','create','--internal','--label','cartera.role-proof='+suffix,network]);network_created=True
 launch(db_name,images['db'],{'POSTGRES_PASSWORD':password})
 deadline=time.time()+60
 while time.time()<deadline:
  # The image's temporary init server accepts only Unix sockets. Requiring TCP
  # avoids launching Auth before that server is stopped and the final one starts.
  p=subprocess.run(DOCKER+['exec',db_name,'pg_isready','-h','127.0.0.1','-U','postgres'],capture_output=True,timeout=10)
  if p.returncode==0:break
  time.sleep(.5)
 else:raise RuntimeError('Local PostgreSQL did not start')
 # pg_isready can succeed during the image's temporary initialization server.
 # Wait for the managed fixture roles and identity function as well.
 deadline=time.time()+60
 while time.time()<deadline:
  p=subprocess.run(DOCKER+['exec',db_name,'psql','-X','-q','-t','-A','-U','supabase_admin','-d','postgres','-c',"select count(*)=2 and to_regprocedure('auth.uid()') is not null from pg_roles where rolname in ('supabase_auth_admin','authenticator')"],text=True,capture_output=True,timeout=10)
  if p.returncode==0 and p.stdout.strip()=='t':break
  time.sleep(.5)
 else:raise RuntimeError('Local managed bootstrap did not finish')
 sql("alter role supabase_auth_admin password '"+password+"';alter role authenticator password '"+password+"';")
 launch(auth_name,images['auth'],{
  'GOTRUE_API_HOST':'0.0.0.0','GOTRUE_API_PORT':9999,'API_EXTERNAL_URL':auth_url,
  'GOTRUE_DB_DRIVER':'postgres','GOTRUE_DB_DATABASE_URL':'postgres://supabase_auth_admin:'+password+'@'+db_name+':5432/postgres',
  'GOTRUE_SITE_URL':auth_url,'GOTRUE_DISABLE_SIGNUP':'true','GOTRUE_JWT_ADMIN_ROLES':'service_role',
  'GOTRUE_JWT_AUD':'authenticated','GOTRUE_JWT_DEFAULT_GROUP_NAME':'authenticated','GOTRUE_JWT_EXP':60,
  'GOTRUE_JWT_SECRET':jwt_secret,'GOTRUE_JWT_ISSUER':auth_url,
  'GOTRUE_EXTERNAL_EMAIL_ENABLED':'true','GOTRUE_MAILER_AUTOCONFIRM':'true','GOTRUE_SMTP_HOST':'',
 })
 wait_http(auth_url,'/health')
 emit('Auth healthy; creating two fictional confirmed accounts')
 admin=sign({'aud':'authenticated','role':'service_role','iat':int(time.time()),'exp':int(time.time())+600})
 accounts=[]
 for i in range(2):
  email='fixture-'+suffix+'-'+str(i)+'@example.invalid';pw=secrets.token_hex(16)
  status,data=request(auth_url,'/admin/users','POST',{'email':email,'password':pw,'email_confirm':True},admin)
  check('fictional account created without email confirmation',status==200 and data.get('role')=='authenticated')
  accounts.append({'id':data['id'],'email':email,'password':pw})
 old=signin(accounts[0]['email'],accounts[0]['password']);ordinary=signin(accounts[1]['email'],accounts[1]['password'])
 check('initial issued roles are authenticated',claims(old)['role']==claims(ordinary)['role']=='authenticated')
 sql("""
 set role postgres;
 do $$begin if current_setting('createrole_self_grant')<>'' or not exists(select 1 from pg_roles where rolname=current_user and rolcreaterole and not rolsuper) then raise exception 'fictional installer must be a non-superuser creator without extra grants';end if;end$$;
 create role kora_cartera_session nologin noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls;
 alter role kora_cartera_session set statement_timeout='8s';
 alter role kora_cartera_session set lock_timeout='2s';
 grant kora_cartera_session to authenticator with inherit false,set true;
 reset role;
 grant usage on schema public to kora_cartera_session;
 create schema if not exists realtime;
 create table realtime.subscription(id int primary key,fictional_note text);
 insert into realtime.subscription values(1,'fictional provider-control row');
 grant usage on schema realtime to authenticated;
 grant select on realtime.subscription to authenticated;
 create table public.qa_regular(id int primary key);
 create table public.qa_effects(id int generated always as identity);
 create function public.qa_public_leak() returns text language plpgsql security definer set search_path='' as $$begin insert into public.qa_effects default values;return 'fictional unlisted result';end$$;
 grant execute on function public.qa_public_leak() to public;
 insert into public.qa_regular values(1);alter table public.qa_regular enable row level security;
 create policy qa_regular_read on public.qa_regular for select to authenticated using(true);
 create policy qa_session_deny on public.qa_regular as restrictive for all to kora_cartera_session using(false) with check(false);
 grant select on public.qa_regular to authenticated;
 create function public.qa_guard() returns void language plpgsql security definer set search_path='' as $$
 declare role_name text:=current_setting('role',true);c jsonb;
 begin
  if role_name='kora_cartera_session' then
   c:=coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb;
   if c->>'role' is distinct from role_name or c->>'is_anonymous'='true' or current_setting('request.method',true) is distinct from 'POST' or current_setting('request.path',true) is distinct from '/rpc/qa_bootstrap' then raise sqlstate 'PT403' using message='qa_session_route_denied';end if;
  end if;
 end$$;
 revoke all on function public.qa_guard() from public;grant execute on function public.qa_guard() to anon,authenticated,service_role,kora_cartera_session;
 -- The proof endpoint uses the same invoker-bound identity technique as R5.
 create function public.qa_subject() returns uuid language sql stable security invoker set search_path='' return auth.uid();
 grant execute on function public.qa_subject() to kora_cartera_session;
 create function public.qa_bootstrap() returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('sql_role',current_setting('role',true),'jwt_role',current_setting('request.jwt.claims',true)::jsonb->>'role','subject',public.qa_subject(),'statement_timeout',current_setting('statement_timeout'),'lock_timeout',current_setting('lock_timeout'));
 $$;
 revoke all on function public.qa_bootstrap() from public,anon,authenticated,service_role;grant execute on function public.qa_bootstrap() to kora_cartera_session;
 create function public.qa_ordinary() returns text language sql immutable security invoker return 'fictional ordinary route';
 revoke all on function public.qa_ordinary() from public;grant execute on function public.qa_ordinary() to anon,authenticated,service_role;
 """
 )
 check('PostgreSQL is version 16 or newer',int(sql("select current_setting('server_version_num')"))>=160000)
 check('dedicated role has exactly the planned safe attributes',sql("select not(rolcanlogin or rolinherit or rolsuper or rolcreatedb or rolcreaterole or rolreplication or rolbypassrls) from pg_roles where rolname='kora_cartera_session'")=='t')
 check('dedicated role has no forward membership, inheritance or SET path',sql("select not exists(select 1 from pg_roles r where r.rolname<>'kora_cartera_session' and (pg_has_role('kora_cartera_session',r.oid,'MEMBER') or pg_has_role('kora_cartera_session',r.oid,'USAGE') or pg_has_role('kora_cartera_session',r.oid,'SET')))")=='t')
 check('reverse memberships match creator/bootstrap and authenticator exactly',sql("select count(*)=2 and bool_and((m.member='postgres'::regrole and m.grantor=10 and m.admin_option and not m.inherit_option and not m.set_option) or(m.member='authenticator'::regrole and m.grantor='postgres'::regrole and not m.admin_option and not m.inherit_option and m.set_option)) from pg_auth_members m where m.roleid='kora_cartera_session'::regrole")=='t')
 check('role settings catalog contains both planned timeouts',sql("select setconfig @> array['statement_timeout=8s','lock_timeout=2s'] from pg_db_role_setting where setrole='kora_cartera_session'::regrole and setdatabase=0")=='t')
 check('Tier-H function inventory flags the fictional PUBLIC definer as blocking',sql("select count(*)=1 and bool_and(p.proname='qa_public_leak') from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prosecdef and has_function_privilege('kora_cartera_session',p.oid,'EXECUTE') and p.proname not in('qa_bootstrap','qa_guard')")=='t')
 check('Tier-H residual inventory identifies caller-only PUBLIC invoker',sql("select not prosecdef and has_function_privilege('kora_cartera_session',oid,'EXECUTE') and exists(select 1 from aclexplode(coalesce(proacl,acldefault('f',proowner))) a where a.grantee=0 and a.privilege_type='EXECUTE') from pg_proc where oid='public.qa_subject()'::regprocedure")=='t')
 p=subprocess.run(DOCKER+['exec','-i',db_name,'psql','-X','-q','-U','supabase_admin','-d','postgres','-v','ON_ERROR_STOP=1'],input='set role postgres;revoke kora_cartera_session from postgres granted by supabase_admin;',text=True,capture_output=True,timeout=10)
 check('non-superuser creator cannot revoke the bootstrap admin grant',p.returncode!=0 and sql("select count(*)=1 from pg_auth_members where roleid='kora_cartera_session'::regrole and member='postgres'::regrole and grantor=10 and admin_option and not inherit_option and not set_option")=='t')
 status,data=request(auth_url,'/admin/users/'+accounts[0]['id'],'PUT',{'role':'kora_cartera_session'},admin)
 check('admin role update succeeds for one fictional user',status==200 and data.get('role')=='kora_cartera_session')
 dedicated=signin(accounts[0]['email'],accounts[0]['password']);ordinary2=signin(accounts[1]['email'],accounts[1]['password'])
 check('Auth actually signs the dedicated role',claims(dedicated)['role']=='kora_cartera_session')
 check('ordinary user remains unchanged',claims(ordinary2)['role']=='authenticated')
 check('changing Auth role does not rewrite previous JWT',claims(old)['role']=='authenticated')
 emit('custom JWT role issued; checking real PostgREST selection')
 launch(rest_name,images['rest'],{
  'PGRST_DB_URI':'postgres://authenticator:'+password+'@'+db_name+':5432/postgres',
  'PGRST_DB_SCHEMAS':'public,realtime','PGRST_DB_PRE_REQUEST':'public.qa_guard',
  'PGRST_DB_ANON_ROLE':'anon',
  'PGRST_JWT_SECRET':jwt_secret,'PGRST_JWT_AUD':'authenticated','PGRST_SERVER_PORT':3000,
 })
 wait_http(rest_url,'/')
 status,data=request(rest_url,'/rpc/qa_bootstrap','POST',{},dedicated)
 check('PostgREST selects dedicated SQL role from actual signed JWT',status==200 and data.get('sql_role')=='kora_cartera_session' and data.get('jwt_role')=='kora_cartera_session' and data.get('subject')==accounts[0]['id'])
 check('PostgREST actually applies dedicated role timeouts',data.get('statement_timeout')=='8s' and data.get('lock_timeout')=='2s')
 status,data=request(rest_url,'/rpc/qa_ordinary')
 check('anonymous ordinary route remains available through the guard',status==200 and data=='fictional ordinary route')
 for path,extra in [('/qa_regular',{}),('/subscription',{'Accept-Profile':'realtime'})]:
  status,data=request(rest_url,path,token=dedicated,extra=extra)
  check('dedicated raw route denied by exact pre-request '+path,status==403 and data.get('message')=='qa_session_route_denied')
 status,data=request(rest_url,'/qa_regular',token=ordinary2)
 check('ordinary authorized API read preserved',status==200 and data==[{'id':1}])
 status,data=request(rest_url,'/subscription',token=ordinary2,extra={'Accept-Profile':'realtime'})
 check('provider control remains readable by original role only',status==200 and data[0]['id']==1)
 status,data=request(rest_url,'/subscription',token=old,extra={'Accept-Profile':'realtime'})
 check('old JWT remains usable until expiry; migration must wait',status==200 and data[0]['id']==1)
 status,_=request(auth_url,'/user','PUT',{'role':'authenticated','data':{'role':'authenticated'}},dedicated)
 check('self-update does not replace trusted database role',status in (200,400,422))
 after_self=signin(accounts[0]['email'],accounts[0]['password'])
 check('new JWT ignores forged role in user metadata',claims(after_self)['role']=='kora_cartera_session')
 status,data=request(auth_url,'/token?grant_type=refresh_token','POST',{'refresh_token':sessions[accounts[0]['email']]['refresh_token']})
 check('Auth refresh preserves trusted dedicated role',status==200 and claims(data['access_token'])['role']=='kora_cartera_session')
 new_password=secrets.token_hex(16)
 status,data=request(auth_url,'/user','PUT',{'password':new_password},after_self)
 check('fictional self-service password change succeeds',status==200)
 accounts[0]['password']=new_password
 changed_password=signin(accounts[0]['email'],new_password)
 check('new login after password change preserves role',claims(changed_password)['role']=='kora_cartera_session')
 new_email='fixture-'+suffix+'-changed@example.invalid'
 status,data=request(auth_url,'/admin/users/'+accounts[0]['id'],'PUT',{'email':new_email,'email_confirm':True},admin)
 check('fictional admin email change succeeds without mail',status==200 and data.get('email')==new_email)
 accounts[0]['email']=new_email
 changed_email=signin(new_email,new_password)
 check('new login after admin email change preserves role',claims(changed_email)['role']=='kora_cartera_session')
 status,data=request(auth_url,'/admin/users/'+accounts[0]['id'],token=admin)
 check('admin read confirms role after malicious self-update and credential changes',status==200 and data.get('role')=='kora_cartera_session')
 for method,path,extra in [('POST','/rpc/qa_public_leak',{}),('GET','/rpc/qa_public_leak',{}),('HEAD','/rpc/qa_public_leak',{}),('GET','/',{})]:
  status,data=request(rest_url,path,method,{} if method=='POST' else None,changed_email,extra)
  check('unlisted PUBLIC route blocked by exact guard '+method+' '+path,status==403 and (method=='HEAD' or (isinstance(data,dict) and data.get('message')=='qa_session_route_denied' and data.get('code')=='PT403')))
 check('blocked PUBLIC definer had no side effects',sql('select count(*)=0 from public.qa_effects')=='t')
 launch(bare_name,images['rest'],{
  'PGRST_DB_URI':'postgres://authenticator:'+password+'@'+db_name+':5432/postgres',
  'PGRST_DB_SCHEMAS':'public,realtime','PGRST_JWT_SECRET':jwt_secret,
  'PGRST_DB_ANON_ROLE':'anon',
  'PGRST_JWT_AUD':'authenticated','PGRST_SERVER_PORT':3000,
 })
 wait_http(bare_url,'/')
 for path,extra in [('/qa_regular',{}),('/subscription',{'Accept-Profile':'realtime'})]:
  status,data=request(bare_url,path,token=changed_email,extra=extra)
  check('privileges independently deny raw data without guard '+path,status==403 and data.get('code')=='42501')
 status,data=request(bare_url,'/rpc/qa_public_leak','POST',{},changed_email)
 check('fictional PUBLIC definer demonstrates guard-only boundary is insufficient',status==200 and data=='fictional unlisted result' and sql('select count(*)=1 from public.qa_effects')=='t')
 sql('delete from public.qa_effects;')
 sql("notify pgrst,'reload schema';")
 time.sleep(.5)
 status,data=request(rest_url,'/rpc/qa_bootstrap','POST',{},changed_email)
 check('allowed RPC succeeds after NOTIFY; reload completion not verified',status==200 and data.get('sql_role')=='kora_cartera_session')
 status,data=request(rest_url,'/rpc/qa_public_leak','POST',{},changed_email)
 check('exact guard denial after NOTIFY; reload completion not verified',status==403 and data.get('message')=='qa_session_route_denied' and data.get('code')=='PT403')
 for wrong in ['does_not_exist','KORA_CARTERA_SESSION',' kora_cartera_session ']:
  wrong_token=sign({'aud':'authenticated','role':wrong,'sub':accounts[0]['id'],'iat':int(time.time()),'exp':int(time.time())+60})
  status,_=request(rest_url,'/rpc/qa_bootstrap','POST',{},wrong_token)
  check('invalid role claim is rejected; fallback not distinguished '+repr(wrong),status in (400,401,403))
 status,_=request(auth_url,'/logout?scope=global','POST',{},changed_email)
 check('fictional global logout succeeds',status==204)
 status,_=request(auth_url,'/token?grant_type=refresh_token','POST',{'refresh_token':sessions[new_email]['refresh_token']})
 check('revoked refresh token cannot create a new session',status in (400,401,403))
 fresh=signin(new_email,new_password)
 sql('set role postgres;revoke kora_cartera_session from authenticator granted by postgres;reset role;')
 status,data=request(rest_url,'/rpc/qa_bootstrap','POST',{},fresh)
 check('kill switch denies dedicated token without fallback',status==403 and data.get('code')=='42501' and 'kora_cartera_session' in data.get('message',''))
 fresh_ordinary=signin(accounts[1]['email'],accounts[1]['password'])
 status,data=request(rest_url,'/qa_regular',token=fresh_ordinary)
 check('kill switch preserves ordinary user access',status==200 and data==[{'id':1}])
 emit('role proof passed; waiting for real old JWT expiry')
 # PostgREST explicitly allows 30 seconds of JWT clock skew (v14 and v16).
 # Waiting exp+2 was insufficient; the transition must include this tolerance.
 deadline=claims(old)['exp']+35
 check('short local JWT expiry plus documented skew is bounded',deadline-time.time()<100)
 while time.time()<deadline:time.sleep(min(1,max(.1,deadline-time.time())))
 status,_=request(rest_url,'/subscription',token=old,extra={'Accept-Profile':'realtime'})
 check('old signed JWT is rejected after expiration plus 30s skew',status==401)
 check('dedicated role has no managed table or schema privilege',sql("select not has_schema_privilege('kora_cartera_session','realtime','USAGE') and not has_table_privilege('kora_cartera_session','realtime.subscription','SELECT') and not pg_has_role('kora_cartera_session','authenticated','MEMBER')")=='t')
 result={'passed':True,'checks':checks,'assertions':len(checks),'distinct_assertion_names':len(set(checks)),'test_source_sha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),'transport':'HTTP inside an internal Docker network; no outbound network','images':{k:command(['image','inspect',v,'--format','{{json .RepoDigests}}']) for k,v in images.items()},'production_writes':0,'real_accounts':0,'external_messages':0,'scope':'Local official Auth/PostgREST + synthetic SQL only; does not certify KORA integration or hosted provider.'}
 (OUT/'result.json').write_text(json.dumps(result,indent=2)+'\n');emit('all checks passed')
except Exception as e:
 for name in created:
  p=subprocess.run(DOCKER+['logs','--tail','100',name],text=True,capture_output=True)
  f=OUT/(name+'.log');f.write_text(p.stdout+p.stderr);f.chmod(0o600)
 (OUT/'failure.json').write_text(json.dumps({'type':type(e).__name__,'message':str(e),'checks_passed':checks},indent=2)+'\n')
 print(json.dumps({'passed':False,'error_type':type(e).__name__,'message':str(e)}),flush=True)
 sys.exit(1)
finally:
 # Only resources created by this run, containing exclusively fictional data.
 for name in reversed(created):subprocess.run(DOCKER+['rm','-f','-v',name],capture_output=True)
 if network_created:subprocess.run(DOCKER+['network','rm',network],capture_output=True)
 for f in OUT.glob('*.env'):f.unlink()
