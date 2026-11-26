"""Only starts PostgREST within the existing owned, network-none fictional container."""
from pathlib import Path
import hashlib,json,subprocess,sys,uuid
ROOT=Path(__file__).resolve().parents[1];OUT=Path(sys.argv[1]);DB='cobra_http_'+uuid.uuid4().hex[:16]
D=['docker','--context','colima-cobra-krediya-20261125'];NAME='cobra-krediya-model-20261125'
def run(args,**kw):return subprocess.run(D+args,capture_output=True,text=True,check=True,**kw).stdout
cfg=json.loads(run(['inspect',NAME]))[0]
assert cfg['HostConfig']['NetworkMode']=='none' and not cfg['HostConfig']['PortBindings'] and not any(x['Type']=='bind' for x in cfg['Mounts']) and cfg['Config']['Labels']['codex.task']=='cobra-krediya-20261125'
def sql(text,db=DB):return run(['exec','-i',NAME,'psql','-X','-qAt','-U','postgres','-d',db,'-v','ON_ERROR_STOP=1'],input=text)
sql('create database '+DB,db='postgres');sql((ROOT/'db-tests/fixture.sql').read_text())
sql("create or replace function auth.uid() returns uuid language sql stable as $$ select (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid $$;do $$begin create role cobra_fixture_authenticator login noinherit;exception when duplicate_object then null;end$$;grant anon,authenticated to cobra_fixture_authenticator;alter role authenticated set statement_timeout='8s';")
for p in sorted((ROOT/'supabase/migrations').glob('*.sql')):sql(p.read_text())
sql("insert into public.liquidation_operations(id,plataforma,external_id,cliente_documento,cliente_nombre,establishment_name,origen_codigo,operation_at,normalized_data,monto_credito) select gen_random_uuid(),'krediya','load'||n,'700'||n,'Persona Ejemplo '||n,'Tienda Ficticia','FX','2026-10-01T13:00:00Z','{\"fecha\":\"2026-10-01T13:00:00Z\"}'::jsonb,400000 from generate_series(1,10000) n;")
run(['exec','-d','-e','PGRST_DB_URI=postgres://cobra_fixture_authenticator@/'+DB+'?host=/var/run/postgresql','-e','PGRST_DB_SCHEMAS=public','-e','PGRST_DB_ANON_ROLE=anon','-e','PGRST_JWT_SECRET=fictional-only-signing-secret-at-least-32-bytes','-e','PGRST_SERVER_HOST=127.0.0.1','-e','PGRST_SERVER_PORT=3999',NAME,'/tmp/postgrest'])
r={'database':DB,'container':NAME,'context':'colima-cobra-krediya-20261125','fictional':True,'pg_image':cfg['Image'],'postgrest_binary_sha256':hashlib.sha256(Path('/private/tmp/cobra-krediya-postgrest').read_bytes()).hexdigest(),'sql_sha256':{p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted((ROOT/'supabase/migrations').glob('*.sql'))},'network':'none','production_changes':False}
(OUT/'api-setup.json').write_text(json.dumps(r,indent=2));print(json.dumps(r))
