from pathlib import Path
import json,hashlib,shutil
r=Path(__file__).resolve().parent
for w in ['nova','clientes']:shutil.copytree(r/'baseline'/w,r/'candidate'/w,dirs_exist_ok=True)
for e in json.loads((r/'changes.json').read_text()):
 p=r/'candidate'/e['path'];s=p.read_text();assert hashlib.sha256(s.encode()).hexdigest()==e['before'];assert s.count(e['old'])==1;s=s.replace(e['old'],e['new']);assert hashlib.sha256(s.encode()).hexdigest()==e['after'];p.write_text(s)
print('Verified exact two-query patch from captured production')
