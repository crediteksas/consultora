import csv, datetime, decimal, hashlib, io, json, re
from collections import defaultdict
from pathlib import Path

D = decimal.Decimal
def number(v):
    if v is None or str(v).strip() == '': return None
    try:
        n = D(str(v).replace('$', '').replace(',', '').strip())
        return str(n) if n.is_finite() else None
    except decimal.InvalidOperation: return None

def date_of(o):
    r = o['row']
    value = r.get('Fecha Firma') or r.get('transaction time') or ''
    for fmt in ('%d-%m-%y', '%B %d, %Y %I:%M %p'):
        try: return datetime.datetime.strptime(value, fmt).date().isoformat()
        except ValueError: pass
    raise ValueError('Unknown source date: ' + value)

def prepare(ops, payments, existing, operational):
    groups = defaultdict(list)
    for o in ops:
        date = date_of(o)
        if '2026-01-01' <= date < '2026-09-01':
            groups[(o['platform'], o['code'])].append(o)
    payload=[]
    for key, versions in sorted(groups.items()):
        if key in operational: continue
        versions.sort(key=lambda o: (o['ts'], o['mail'], o['file']), reverse=True)
        internal=[o for o in versions if o['kind']!='pj']
        chosen=(internal or versions)[0]
        r=chosen['row']
        netkeys=['ALO CREDIT PAGO al punto de venta','PAGO PAYJOY A TIENDA','PAGO PAYJOY A PUNTO']
        nets={number(o['row'][k]) for o in internal for k in netkeys if number(o['row'].get(k)) is not None}
        net=next(iter(nets)) if len(nets)==1 else None
        review = net is None or D(net) < 0
        evidence=[]
        for o in versions:
            evidence.append({'gmail_message_id':o['mail'],'archivo':o['file'],'hoja':o['sheet'],'correo_at':o['ts'],'fila':o['row']})
        related=[p for p in payments if any(p['mail']==o['mail'] and p['file']==o['file'] for o in versions)]
        evidence_object={'fuentes':evidence,'hojas_de_giro_originales':related,
            'pago_declarado_por_gerencia':True,'conciliado_bancariamente':False,
            'soporte_bancario':None,'fecha_real_pago':None,
            'requiere_revision_importe':review,'netos_en_fuentes':sorted(nets),
            'nota':'Reconstruccion historica autorizada por Oscar. Declaracion de pago sin verificacion bancaria. No es un nuevo pago. Hojas de giro son evidencia de instrucciones, no comprobantes.'}
        digest=hashlib.sha256(json.dumps(evidence_object,sort_keys=True,ensure_ascii=False).encode()).hexdigest()
        evidence_object['sha256']=digest
        row={'plataforma':key[0],'codigo_credito':key[1],'fecha_credito':date_of(chosen)+'T12:00:00-05:00',
            'cliente_documento':re.sub(r'\.0$','',r.get('CC') or r.get('national id') or '') or None,
            'cliente_nombre':r.get('Nombre Completo') or None,
            'establecimiento':r.get('Tienda') or r.get('merchant name'),
            'vendedor':r.get('Vendedor') or r.get('sales clerk name'),
            'imei':re.sub(r'\.0$','',r.get('Imei') or r.get('imei') or '') or None,
            'referencia':r.get('Referencia') or r.get('device model'),
            'monto_credito':number(r.get('Monto Credito') or r.get('owed by PayJoy')),
            'cuota_inicial':number(r.get('Valor Cuota Inicial') or r.get('owed by CREDITEK S.A.S.')),
            'archivo_origen':chosen['file'],'correo_origen_at':chosen['ts'],
            'pago_neto_historico':net if not review else None,
            'datos_origen':{'reconstruccion_correo_2026':evidence_object}}
        # PayJoy purchase initial is a separate source movement; do not invent zero.
        if key not in existing and (row['monto_credito'] is None or row['cuota_inicial'] is None):
            row['pendiente_dato_obligatorio']=True
        payload.append(row)
        if r.get('transaction time'):
            row['fecha_credito']=datetime.datetime.strptime(r['transaction time'],'%B %d, %Y %I:%M %p').isoformat()+'-05:00'
    return payload

if __name__ == '__main__':
    ops=json.load(open('/tmp/kora-hist-ops.json'))
    initials=defaultdict(set)
    for f in json.load(open('/tmp/kora-historicos-2026-extracted.json'))+json.load(open('/tmp/kora-historicos-2026-internal.json')):
        text='\n'.join(c.get('text','') for c in f['result'].get('content',[]))
        for tab in re.split(r'<PARSED TEXT FOR SHEET:',text)[1:]:
            start=tab.find('index,')
            if start<0: continue
            for r in csv.DictReader(io.StringIO(tab[start:].strip())):
                if r.get('transaction type')=='purchaseOutOfPocket' and number(r.get('owed by CREDITEK S.A.S.')) is not None:
                    initials[r.get('device')].add(number(r['owed by CREDITEK S.A.S.']))
    payments=json.load(open('/tmp/kora-hist-paytabs.json'))
    existing={(r['plataforma'],r['codigo_credito']) for r in json.load(open('/tmp/kora-historicos-2026-existing.json'))}
    operational={(r['plataforma'],r['external_id']) for r in json.load(open('/tmp/kora-hist-existing-ops.json'))}
    data=prepare(ops,payments,existing,operational)
    for r in data:
        if r['plataforma']=='payjoy' and r['cuota_inicial'] is None and len(initials[r['codigo_credito']])==1:
            r['cuota_inicial']=next(iter(initials[r['codigo_credito']]))
            r.pop('pendiente_dato_obligatorio',None)
    old_rows={(r['plataforma'],r['codigo_credito']):r for r in json.load(open('/tmp/kora-historicos-2026-existing.json'))}
    for r in data:
        old=old_rows.get((r['plataforma'],r['codigo_credito']))
        ev=r['datos_origen']['reconstruccion_correo_2026']
        if old:
            stored=number(old.get('pago_neto_historico'))
            ev['diferencia_con_neto_kora']=stored is not None and any(D(v)!=D(stored) for v in ev['netos_en_fuentes'])
            ev['requiere_revision_importe']=ev['requiere_revision_importe'] or ev['diferencia_con_neto_kora']
        ev.pop('sha256',None)
        ev['sha256']=hashlib.sha256(json.dumps(ev,sort_keys=True,ensure_ascii=False).encode()).hexdigest()
    if any(r.get('pendiente_dato_obligatorio') for r in data): raise ValueError('Payload incomplete; cannot import')
    Path('/tmp/kora-hist-payload.json').write_text(json.dumps(data,ensure_ascii=False))
    print(json.dumps({'records':len(data),'missing':sum((r['plataforma'],r['codigo_credito']) not in existing for r in data),'missing_required':sum(r.get('pendiente_dato_obligatorio',False) for r in data)}))
