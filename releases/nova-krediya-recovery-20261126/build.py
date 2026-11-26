from pathlib import Path
import json,shutil,hashlib
r=Path(__file__).resolve().parent
for name in ['nova','clientes','operational']:shutil.copytree(r/'baseline'/name,r/'candidate'/name,dirs_exist_ok=True)
for item in json.loads((r/'changes.json').read_text()):
 s=(r/'baseline'/item['path']).read_text();assert hashlib.sha256(s.encode()).hexdigest()==item['before']
 for e in reversed(item['edits']):assert s[e['start']:e['end']]==e['old'];s=s[:e['start']]+e['new']+s[e['end']:]
 assert hashlib.sha256(s.encode()).hexdigest()==item['after'];(r/'candidate'/item['path']).write_text(s)
print('Verified exact bounded patches from production baseline')
