from pathlib import Path
import shutil,json,hashlib
r=Path(__file__).resolve().parent
code='ALIADO-5D608D3F-BDE6-45FB-B736-F5040577C63B'
oldregex='^(CK-0[1-9]|distritoys|club-seven|ALIADO-D7750CF7-6CBE-4F64-A2DC-D319941AAD3C)$'
newregex=oldregex[:-2]+'|'+code+')$'
oldlist="'CK-01','CK-02','CK-03','CK-04','CK-05','CK-06','CK-07','CK-08','CK-09','distritoys','club-seven','ALIADO-D7750CF7-6CBE-4F64-A2DC-D319941AAD3C'"
login="'distritoys','ALIADO-D7750CF7-6CBE-4F64-A2DC-D319941AAD3C','club-seven'"
js="['distritoys','club-seven','ALIADO-D7750CF7-6CBE-4F64-A2DC-D319941AAD3C']"
replacements=[(oldregex,newregex),(oldlist,oldlist+",'"+code+"'"),(login,login+",'"+code+"'"),(js,js[:-1]+",'"+code+"']"),('["distritoys","ALIADO-D7750CF7-6CBE-4F64-A2DC-D319941AAD3C","club-seven"]','["distritoys","ALIADO-D7750CF7-6CBE-4F64-A2DC-D319941AAD3C","club-seven","'+code+'"]'),('values.length > 3','values.length > 4')]
def patch(s):
 for a,b in replacements:s=s.replace(a,b)
 return s
changes={}
for n in ['nova','clientes']:
 shutil.copytree(r/'baseline'/n,r/'candidate'/n,dirs_exist_ok=True)
 counts={}
 for p in (r/'candidate'/n).iterdir():
  s=p.read_text();counts[p.name]={a:s.count(a) for a,b in replacements if a in s};p.write_text(patch(s))
 changes[n]=counts
(r/'candidate/sql').mkdir(parents=True,exist_ok=True)
for label,count in [('kora',12),('aura',10)]:
 fs=sorted((r/'baseline').glob(label+'-*.sql'));assert len(fs)==count
 for f in fs:
  old=f.read_text();new=patch(old);assert old!=new,f;(r/'candidate/sql'/f.name).write_text(new)
 prefix="SET LOCAL lock_timeout='5s';\nSET LOCAL search_path=pg_catalog,public;\n"
 if label=='kora':
  prefix+="ALTER TABLE public.nova_retail_cases DROP CONSTRAINT nova_retail_cases_store_code_check;\nALTER TABLE public.nova_retail_cases ADD CONSTRAINT nova_retail_cases_store_code_check CHECK(store_code ~ '"+newregex+"');\nALTER TABLE public.nova_client_otp_policy DROP CONSTRAINT nova_client_otp_policy_allowed_origins_check;\nALTER TABLE public.nova_client_otp_policy ADD CONSTRAINT nova_client_otp_policy_allowed_origins_check CHECK(allowed_origins <@ ARRAY["+oldlist+",'"+code+"']::text[]);\nUPDATE public.nova_client_otp_policy SET allowed_origins=array_append(allowed_origins,'"+code+"') WHERE id AND NOT '"+code+"'=ANY(allowed_origins);\n"
 (r/(label+'-migration.sql')).write_text(prefix+'\n\n'.join((r/'candidate/sql'/f.name).read_text().rstrip().rstrip(';')+';' for f in fs)+'\n')
(r/'manifest.json').write_text(json.dumps({stage:{'creditek-'+n:{f.name:hashlib.sha256(f.read_bytes()).hexdigest() for f in (r/stage/n).iterdir()} for n in ['nova','clientes']} for stage in ['baseline','candidate']},indent=2)+'\n')
(r/'changes.json').write_text(json.dumps(changes,indent=2)+'\n')
print('Prepared exact fourth-origin expansion; 22 SQL functions')
