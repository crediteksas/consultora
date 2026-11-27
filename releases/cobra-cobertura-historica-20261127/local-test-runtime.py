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
images={'db':'public.ecr.aws/supabase/postgres:17.6.1.141','auth':'supabase/gotrue:v2.198.0','rest':'postgrest/postgrest:v14.5'}
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
