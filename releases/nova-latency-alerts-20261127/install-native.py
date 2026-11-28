from pathlib import Path
import os,json,hashlib,stat,datetime
p=Path(__file__).resolve().parent
runtime=Path('/Users/oscarm/Library/Application Support/Creditek/NOVA/krediya-browser/operational')
manifest=json.loads((p/'native-manifest.json').read_text());backup=p/'native-backup'
state=json.loads((runtime/'state.json').read_text())
if state.get('phase')!='idle' or state.get('context') or state.get('reservationPending'):raise RuntimeError('NATIVE_NOT_IDLE')
sha=lambda f:hashlib.sha256(f.read_bytes()).hexdigest()
for name,entry in manifest.items():
 if sha(runtime/name)!=entry['before'] or stat.S_IMODE((runtime/name).stat().st_mode)!=entry['mode'] or sha(p/'candidate/operational'/name)!=entry['after']:raise RuntimeError('NATIVE_BASELINE_DRIFT')
for name,entry in manifest.items():
 dest=backup/name;dest.parent.mkdir(parents=True,exist_ok=True)
 if dest.exists() and sha(dest)!=entry['before']:raise RuntimeError('UNEXPECTED_BACKUP')
 dest.write_bytes((runtime/name).read_bytes());os.chmod(dest,entry['mode'])
for name,entry in manifest.items():
 if sha(backup/name)!=entry['before']:raise RuntimeError('BACKUP_NOT_VERIFIED')
for name,entry in manifest.items():
 if sha(runtime/name)!=entry['before']:raise RuntimeError('NATIVE_CONCURRENT_CHANGE')
 dest=runtime/name;dest.write_bytes((p/'candidate/operational'/name).read_bytes());os.chmod(dest,entry['mode'])
 if sha(dest)!=entry['after'] or stat.S_IMODE(dest.stat().st_mode)!=entry['mode']:raise RuntimeError('INSTALL_NOT_VERIFIED')
(p/'native-install-receipt.json').write_text(json.dumps({'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'version':'1.0.21','files':manifest,'stateBefore':'idle','backup':str(backup)},indent=2)+'\n')
print('Installed four verified code files; private state, config, journal and extension permissions untouched')
