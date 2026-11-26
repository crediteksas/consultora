"""Fictional upper-bound load probe, no production network or source data."""
from pathlib import Path
import hashlib,json,subprocess,sys,time,uuid
ROOT=Path(__file__).resolve().parents[1];OUT=Path(sys.argv[1]);DB='cobra_load_'+uuid.uuid4().hex[:16]
CONTEXT='colima-cobra-krediya-20261125';CONTAINER='cobra-krediya-model-20261125'
BASE=['docker','--context',CONTEXT,'exec','-i',CONTAINER,'psql','-X','-q','-A','-t','-U','postgres','-v','ON_ERROR_STOP=1']
def run(sql,db=DB):
 p=subprocess.run(BASE+['-d',db],input=sql,text=True,capture_output=True);assert p.returncode==0,p.stderr
 return p.stdout.strip().splitlines()[-1] if p.stdout.strip() else ''
def q(v):return "'"+v.replace("'","''")+"'"
inspection=json.loads(subprocess.run(['docker','--context',CONTEXT,'inspect',CONTAINER],text=True,capture_output=True,check=True).stdout)[0]
assert inspection['HostConfig']['NetworkMode']=='none' and not inspection['HostConfig']['PortBindings'] and not any(m['Type']=='bind' for m in inspection['Mounts'])
run('create database '+DB,db='postgres');run((ROOT/'db-tests/fixture.sql').read_text())
for p in sorted((ROOT/'supabase/migrations').glob('*.sql')):run(p.read_text())
run("insert into public.liquidation_operations(id,plataforma,external_id,cliente_documento,cliente_nombre,establishment_name,origen_codigo,operation_at,normalized_data,monto_credito) select gen_random_uuid(),'krediya','load'||n,'700'||n,'Persona Ejemplo '||n,'Tienda Ficticia', 'FX','2026-10-01T13:00:00Z','{\"fecha\":\"2026-10-01T13:00:00Z\"}'::jsonb,400000 from generate_series(1,10000) n;")
row={'contract':'','document':'','customer':'','store':'Tienda Ficticia','created':'2026-10-01','financed_cents':40000000,'fee_cents':5000000,'total_installments':12,'frequency':15,'cycled':3,'paid':1,'overdue':2,'contract_status':'signed_approved'}
rows=[{**row,'contract':'load'+str(n),'document':'700'+str(n),'customer':'Persona Ejemplo '+str(n)} for n in range(1,10001)]
payload=json.dumps(rows);started=time.monotonic();sql="set statement_timeout='8s';set role authenticated;select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);select public.cobra_krediya_save_cut(gen_random_uuid(),repeat('d',64),'2026-10-01','2026-11-25','fiction-load.xlsx',"+q(payload)+'::jsonb);'
result={'run_id':DB,'fictional':True,'rows':10000,'payload_bytes':len(payload.encode()),'production_changes':False,'limit_seconds':8,'realistic_production_load':False,'sql_sha256':{p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted((ROOT/'supabase/migrations').glob('*.sql'))}}
try: receipt=json.loads(run(sql));assert receipt['row_count']==10000;result.update(ok=True,receipt=receipt)
except Exception as err:result.update(ok=False,error=str(err))
result['wall_seconds']=round(time.monotonic()-started,3);(OUT/'fictional-load-result.json').write_text(json.dumps(result,indent=2));print(json.dumps(result))
