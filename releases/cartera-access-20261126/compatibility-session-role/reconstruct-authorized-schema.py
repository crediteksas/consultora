"""Try only the existing, authorized three-schema DDL; no new exports or rows.
This is a local completeness probe, never certification of hosted Supabase.
"""
from pathlib import Path
import hashlib,json,os,re,secrets,subprocess,sys,time,uuid
out=Path(sys.argv[1]);out.mkdir(parents=True,exist_ok=True,mode=0o700)
source=Path(sys.argv[2]);expected='dceac767e57723af499bc11dae629f6e10bccefb55c8e429f636c123174e87f2'
assert hashlib.sha256(source.read_bytes()).hexdigest()==expected,'Authorized DDL changed'
s=source.read_text();assert not re.search(r'^(?:COPY |INSERT INTO |UPDATE |DELETE FROM )',s,re.M)
cmd=['docker','--context','colima-cobra-krediya-20261125'];name='cartera-schema-proof-'+uuid.uuid4().hex[:10]
image='public.ecr.aws/supabase/postgres:17.6.1.141';env=out/'local-db.env';env.write_text('POSTGRES_PASSWORD='+secrets.token_hex(24)+'\n');env.chmod(0o600)
created=False
result={'source_sha256':expected,'production_writes':0,'production_rows_copied':0,'new_schema_exports':0,'scope':'Existing public/kora_private/cobros_private DDL in an isolated local official image only; no hosted certification'}
def docker(args,**kw):return subprocess.run(cmd+args,text=True,capture_output=True,timeout=60,**kw)
try:
 p=docker(['run','-d','--name',name,'--label','cartera.schema-proof=true','--network','none','--env-file',str(env),image]);assert p.returncode==0,'Local container launch failed';created=True
 deadline=time.time()+60
 while time.time()<deadline:
  p=docker(['exec',name,'pg_isready','-h','127.0.0.1','-U','postgres'])
  if p.returncode==0:break
  time.sleep(.5)
 else:raise RuntimeError('PostgreSQL bootstrap timeout')
 # A role name already present in this authorized DDL; local placeholder only.
 prefix="create role nova_supervision_reader nologin noinherit;\n"
 p=docker(['exec','-i',name,'psql','-X','-q','-U','supabase_admin','-d','postgres','--single-transaction','-v','ON_ERROR_STOP=1'],input=prefix+s)
 log=out/'restore-private.log';log.write_text(p.stderr);log.chmod(0o600)
 errors=[line[:500] for line in p.stderr.splitlines() if line.startswith(('ERROR:','FATAL:'))]
 result.update({'restored':p.returncode==0,'first_errors':errors[:2],'metadata_role_is_placeholder':True})
 if p.returncode==0:
  q="select json_build_object('public_tables',count(*) filter(where n.nspname='public'),'private_tables',count(*) filter(where n.nspname in('kora_private','cobros_private'))) from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.relkind in('r','p');"
  v=docker(['exec',name,'psql','-X','-q','-t','-A','-U','supabase_admin','-d','postgres','-c',q]);result['relations']=json.loads(v.stdout.strip())
except Exception as e:result.update({'restored':False,'error_type':type(e).__name__,'error':str(e)})
finally:
 if created:docker(['rm','-f','-v',name])
 env.unlink(missing_ok=True)
 (out/'result.json').write_text(json.dumps(result,indent=2)+'\n')
 print(json.dumps(result))
