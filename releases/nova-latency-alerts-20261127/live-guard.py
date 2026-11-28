import pathlib,re,urllib.request,urllib.error,email.parser,email.policy,hashlib,json,sys
from datetime import datetime,timezone
root=pathlib.Path(__file__).resolve().parent
stage=sys.argv[1] if len(sys.argv)>1 else 'capture'
if stage not in ('capture','preflight','postflight'):raise RuntimeError('invalid stage')
auth={'oauth_token':re.search(r'^oauth_token\s*=\s*"([^"\n]+)"',(pathlib.Path.home()/'.wrangler/config/default.toml').read_text(),re.M)[1]}
api='https://api.cloudflare.com/client/v4'
account=api+'/accounts/853eee9e3d80f805fee58f4f99507e8a/workers'
def fetch(url):return urllib.request.urlopen(urllib.request.Request(url,headers={'Authorization':'Bearer '+auth['oauth_token']}),timeout=35)
def data(url):
 with fetch(url) as r:j=json.load(r)
 if not j.get('success'):raise RuntimeError('Cloudflare read failed')
 return j['result']
def snapshot():
 workers={}
 for name in ['creditek-clientes','creditek-nova']:
  base=account+'/services/'+name+'/environments/production'
  with fetch(base+'/content') as r:msg=email.parser.BytesParser(policy=email.policy.default).parsebytes(b'Content-Type: '+r.headers['Content-Type'].encode()+b'\r\nMIME-Version: 1.0\r\n\r\n'+r.read())
  modules={}
  for p in msg.iter_parts():
   n=p.get_filename() or p.get_param('name',header='content-disposition')
   if n and '/' not in n:
    content=p.get_payload(decode=True);modules[n]=hashlib.sha256(content).hexdigest()
    if stage=='capture':(root/'baseline'/('clientes' if name=='creditek-clientes' else 'nova')/n).write_bytes(content)
  settings=data(base+'/settings')
  settings['bindings']=sorted([{'name':b['name'],'type':b['type']} if b['type']=='secret_text' else b for b in settings['bindings']],key=lambda b:b['name'])
  schedules=data(account+'/scripts/'+name+'/schedules')
  if isinstance(schedules,dict):schedules=schedules.get('schedules',[])
  versions=data(account+'/scripts/'+name+'/deployments')['deployments'][0]['versions']
  subdomain=data(account+'/scripts/'+name+'/subdomain')
  workers[name]={'subdomain':subdomain,'modules':modules,'settings':settings,'crons':sorted(x['cron'] for x in schedules),'versions':versions}
 routes=data(api+'/zones/4117c7a89e988ae0869c02755ffa77ab/workers/routes')
 return {'workers':workers,'routes':sorted([{k:v for k,v in row.items() if k!='id'} for row in routes],key=lambda r:r['pattern'])}
current=snapshot()
if stage=='capture':
 (root/'baseline/live.json').write_text(json.dumps(current,indent=2)+'\n')
 (root/'manifest.json').write_text(json.dumps({'baseline':{name:w['modules'] for name,w in current['workers'].items()}},indent=2)+'\n')
 print('Captured current production code and settings');sys.exit(0)
old=json.loads((root/'baseline/live.json').read_text());manifest=json.loads((root/'manifest.json').read_text())
for name,w in current['workers'].items():
 expected=manifest['candidate' if stage=='postflight' else 'baseline'][name]
 if w['modules']!=expected:raise RuntimeError(name+': code mismatch')
 for key in ['bindings','compatibility_date','compatibility_flags','placement','usage_model','logpush','tail_consumers','observability']:
  if w['settings'].get(key)!=old['workers'][name]['settings'].get(key):raise RuntimeError(name+': configuration changed: '+key)
 if w['crons']!=old['workers'][name]['crons'] or w['subdomain']!=old['workers'][name]['subdomain']:raise RuntimeError(name+': triggers changed')
 if stage=='preflight' and w['versions']!=old['workers'][name]['versions']:raise RuntimeError(name+': concurrent deployment')
if current['routes']!=old['routes']:raise RuntimeError('Routes changed')
(root/(stage+'-receipt.json')).write_text(json.dumps({'status':'PASS','checkedAt':datetime.now(timezone.utc).isoformat(),'codeMatches':True,'configurationPreserved':True,'routesPreserved':True,'workers':{n:{'modules':w['modules'],'versions':w['versions']} for n,w in current['workers'].items()}},indent=2)+'\n')
print(stage+': PASS; code verified; bindings, settings, routes and schedules preserved')
