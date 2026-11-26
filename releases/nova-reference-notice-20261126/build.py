from pathlib import Path
import re,json,shutil,hashlib
r=Path(__file__).resolve().parent
if (r/'candidate').exists():shutil.rmtree(r/'candidate')
shutil.copytree(r/'baseline/nova',r/'candidate/nova',dirs_exist_ok=True)
s=(r/'baseline/nova/index.mjs').read_text()
old="if(!closed)for(const p of pending){if(p.kind==='reference'&&p.owner==='Andrea'){p.owner='Creditek';p.detail='El equipo de Creditek debe revisar la respuesta de esta referencia y confirmar que corresponde al tipo solicitado. Conservamos la respuesta recibida.';}}"
new="if(!closed)for(const p of pending){if(p.kind==='reference'&&p.owner==='Andrea'){p.owner='Creditek';const ref=references.find(r=>r.type===p.type);const mismatch=ref?.type==='family'&&ref.responded===true&&ref.knowsCustomer===true&&ref.contactConfirmed===true&&['friend','neighbor','coworker','other'].includes(ref.reportedRelationship)&&[null,undefined,'contradictory_information','relationship_unconfirmed'].includes(ref.reason);p.detail=mismatch?'Se registró como referencia familiar, pero indicó que no es familiar del cliente. Creditek debe aclarar la relación con la tienda antes de continuar. Conservamos la respuesta recibida.':'El equipo de Creditek debe revisar la respuesta de esta referencia y confirmar que corresponde al tipo solicitado. Conservamos la respuesta recibida.';}}"
assert s.count(old)==1;commercial_change=[old,new];s=s.replace(old,new)
m=re.search(r'^var retail_portal_default = ("[^\n]*");$',s,re.M);assert m
ui=json.loads(m.group(1));old="const reasons={response_timeout:";new="const reasons={personal_reference_is_family:'La referencia personal indicó que es familiar. Registra una referencia personal que no sea familiar.',response_timeout:";assert ui.count(old)==1;ui_change=[old,new];ui=ui.replace(old,new)
s=s[:m.start(1)]+json.dumps(ui,ensure_ascii=False)+s[m.end(1):]
(r/'candidate/nova/index.mjs').write_text(s)
(r/'candidate/ui.html').write_text(ui)
(r/'manifest.json').write_text(json.dumps({stage:{'creditek-'+n:{f.name:hashlib.sha256(f.read_bytes()).hexdigest() for f in (r/(stage if n=='nova' else 'baseline')/n).iterdir()} for n in ['nova','clientes']} for stage in ['baseline','candidate']},indent=2)+'\n')
print('Two display-only changes; decisions and source records unchanged')

(r/'changes.json').write_text(json.dumps({'commercial':commercial_change,'ui':ui_change},ensure_ascii=False,indent=2)+'\n')
