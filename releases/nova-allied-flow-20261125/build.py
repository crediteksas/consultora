from pathlib import Path
import json,shutil,hashlib,re
r=Path(__file__).resolve().parent
REGEX='^(CK-0[1-9]|distritoys)$';NEWREGEX='^(CK-0[1-9]|distritoys|club-seven|ALIADO-D7750CF7-6CBE-4F64-A2DC-D319941AAD3C)$'
OLDLIST="'CK-01','CK-02','CK-03','CK-04','CK-05','CK-06','CK-07','CK-08','CK-09','distritoys'";NEWLIST=OLDLIST+",'club-seven','ALIADO-D7750CF7-6CBE-4F64-A2DC-D319941AAD3C'"
STORES="['distritoys','club-seven','ALIADO-D7750CF7-6CBE-4F64-A2DC-D319941AAD3C']"
changes={}
for name in ['nova','clientes']:
 shutil.copytree(r/'baseline'/name,r/'candidate'/name,dirs_exist_ok=True)
 p=r/'candidate'/name/'index.mjs';s=p.read_text();counts={'regex':s.count(REGEX),'inlineSqlList':s.count(OLDLIST)};s=s.replace(REGEX,NEWREGEX).replace(OLDLIST,NEWLIST)
 old='function novaDistritoysOrigins(value){return typeof value==="string" && value.trim() ? value.split(",").includes("distritoys") ? value : value+",distritoys" : value;}'
 new='function novaDistritoysOrigins(value){if(typeof value!=="string"||!value.trim())return value;return [...new Set([...value.split(",").map(v=>v.trim()).filter(Boolean),...'+STORES+'])].join(",");}'
 assert s.count(old)==1;s=s.replace(old,new)
 if name=='nova':
  old='!RETAIL_STORES.includes(e.storeCode) && e.storeCode !== "distritoys"';new='!RETAIL_STORES.includes(e.storeCode) && !'+STORES+'.includes(e.storeCode)';assert s.count(old)==1;s=s.replace(old,new)
 else:
  replacements=[("if(p.store!=='distritoys')","if(!"+STORES+".includes(p.store))"),('KORA_DB_URL+"/rest/v1/enlaces_registro?origen_codigo=eq.distritoys&activo=eq.true','KORA_DB_URL+"/rest/v1/enlaces_registro?origen_codigo=eq."+encodeURIComponent(p.store)+"&activo=eq.true'),('origin:"distritoys"});','origin:p.store});')]
  for old,new in replacements:assert s.count(old)==1,(old,s.count(old));s=s.replace(old,new)
 assert REGEX not in s and OLDLIST+")" not in s and OLDLIST+"]" not in s;p.write_text(s);changes[name]=counts
 # Actual additional HTML module served by clientes also has store admission in its client script.
 for html in (r/'candidate'/name).glob('*.html'):
  data=html.read_text();n=data.count(REGEX);html.write_text(data.replace(REGEX,NEWREGEX));changes[name][html.name+'Regex']=n
(r/'candidate/sql').mkdir(exist_ok=True)
for label in ['kora','aura']:
 changed=[]
 for f in sorted((r/'baseline').glob(label+'-*.sql')):
  old=f.read_text();new=old.replace(REGEX,NEWREGEX).replace(OLDLIST,NEWLIST)
  if new==old:continue
  (r/'candidate/sql'/f.name).write_text(new);changed.append({'file':f.name,'beforeSha256':hashlib.sha256(old.encode()).hexdigest(),'afterSha256':hashlib.sha256(new.encode()).hexdigest()})
 assert len(changed)==10,(label,len(changed));changes[label+'Functions']=changed
 if label=='kora':
  prefix="SET LOCAL lock_timeout='5s';\nSET LOCAL search_path=pg_catalog,public;\nALTER TABLE public.nova_retail_cases DROP CONSTRAINT nova_retail_cases_store_code_check;\nALTER TABLE public.nova_retail_cases ADD CONSTRAINT nova_retail_cases_store_code_check CHECK (store_code ~ '"+NEWREGEX+"');\nALTER TABLE public.nova_client_otp_policy DROP CONSTRAINT nova_client_otp_policy_allowed_origins_check;\nALTER TABLE public.nova_client_otp_policy ADD CONSTRAINT nova_client_otp_policy_allowed_origins_check CHECK (allowed_origins <@ ARRAY["+NEWLIST+"]::text[]);\nUPDATE public.nova_client_otp_policy SET allowed_origins=ARRAY(SELECT code FROM unnest(allowed_origins || ARRAY['distritoys','club-seven','ALIADO-D7750CF7-6CBE-4F64-A2DC-D319941AAD3C']::text[]) WITH ORDINALITY AS t(code,pos) GROUP BY code ORDER BY min(pos)) WHERE id AND NOT allowed_origins @> ARRAY['distritoys','club-seven','ALIADO-D7750CF7-6CBE-4F64-A2DC-D319941AAD3C']::text[];\n"
 else:prefix="SET LOCAL lock_timeout='5s';\nSET LOCAL search_path=pg_catalog,public;\n"
 text=prefix+'\n\n'.join((r/'candidate/sql'/f['file']).read_text().rstrip().rstrip(';')+';' for f in changed)+'\n'
 (r/(label+'-migration.sql')).write_text(text)
manifest={stage:{'creditek-'+n:{f.name:hashlib.sha256(f.read_bytes()).hexdigest() for f in (r/stage/n).iterdir()} for n in ['nova','clientes']} for stage in ['baseline','candidate']}
(r/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n');(r/'changes.json').write_text(json.dumps(changes,indent=2)+'\n')
print(json.dumps({'workers':{n:changes[n] for n in ['nova','clientes']},'sqlFunctions':{p:len(changes[p+'Functions']) for p in ['kora','aura']}}))
