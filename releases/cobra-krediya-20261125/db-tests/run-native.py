"""Isolated fictional PostgreSQL tests. Never connects to Supabase or a host port."""
from pathlib import Path
import concurrent.futures,copy,hashlib,json,subprocess,sys,time,uuid
ROOT=Path(__file__).resolve().parents[1]
CONTEXT='colima-cobra-krediya-20261125';CONTAINER='cobra-krediya-model-20261125'
DB='cobra_'+uuid.uuid4().hex[:20];CHECKS=[]
MIGRATIONS=sorted((ROOT/'supabase/migrations').glob('*.sql'))
FIXTURE=ROOT/'db-tests/fixture.sql';ROLLBACK=ROOT/'db-tests/rollback-empty-only.sql'
OUT=Path(sys.argv[1]);OUT.mkdir(parents=True,exist_ok=True)
BASE=['docker','--context',CONTEXT,'exec','-i',CONTAINER,'psql','-X','-q','-A','-t','-U','postgres','-v','ON_ERROR_STOP=1']
def run(sql,db=DB,expected=None):
 p=subprocess.run(BASE+['-d',db],input=sql,text=True,capture_output=True)
 if expected is not None:
  assert p.returncode!=0 and expected in p.stderr,(expected,p.returncode,p.stdout,p.stderr)
  return p.stderr
 assert p.returncode==0,(p.stdout,p.stderr)
 return p.stdout.strip().splitlines()[-1] if p.stdout.strip() else ''
def scalar(sql):return json.loads(run(sql))
def check(name,fn):fn();CHECKS.append(name)
def eq(a,b):assert a==b,(a,b)
def q(v):return "'"+str(v).replace("'","''")+"'"
USERS=['11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333','44444444-4444-4444-8444-444444444444','55555555-5555-4555-8555-555555555555','66666666-6666-4666-8666-666666666666']
ROW={'contract':'fiction001','document':'111001','customer':'Ana Ejemplo','store':'Tienda Ficticia A','created':'2026-10-01','financed_cents':40000000,'fee_cents':5000000,'total_installments':12,'frequency':15,'cycled':3,'paid':1,'overdue':2,'contract_status':'signed_approved'}
ROW2={**ROW,'contract':'fiction002','document':'111002','customer':'Luis Ejemplo','store':'Tienda Ficticia B'}
def identity(i=0,role='authenticated'):return 'set role '+role+';select set_config(\'request.jwt.claim.sub\','+q(USERS[i])+',false);'
def call(rows=None,request=None,sha=None,cut='2026-11-25',month='2026-10-01',i=0,expected=None):
 request=request or str(uuid.uuid4());sha=sha or hashlib.sha256(request.encode()).hexdigest()
 sql=identity(i)+'select public.cobra_krediya_save_cut('+q(request)+'::uuid,'+q(sha)+','+q(month)+'::date,'+q(cut)+'::date,\'fiction.xlsx\','+q(json.dumps(rows if rows is not None else [ROW,ROW2]))+'::jsonb);'
 value=run(sql,expected=expected)
 return json.loads(value) if expected is None else value
def count():return int(run('select count(*) from public.cobra_krediya_cuts;'))
OPS=['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2']
def event(request=None,op=OPS[0],kind='note',channel='internal',note='Fictional follow up',date=None,amount=None,i=0,expected=None):
 sql=identity(i)+'select public.cobra_krediya_save_collection('+','.join([q(request or str(uuid.uuid4()))+'::uuid',q(op)+'::uuid',q(kind),q(channel),q(note),'null' if date is None else q(date)+'::date','null' if amount is None else str(amount)])+');'
 value=run(sql,expected=expected)
 return json.loads(value) if expected is None else value
def financial_fingerprint():return run("select md5(jsonb_build_object('operations',(select jsonb_agg(to_jsonb(x) order by x.id) from public.liquidation_operations x),'obligations',(select jsonb_agg(to_jsonb(x) order by x.id) from public.credit_portfolio_obligations x),'repayments',(select count(*) from public.credit_repayments))::text);")
def fingerprint():return run("select md5(jsonb_build_object('operations',(select jsonb_agg(to_jsonb(x) order by x.id) from public.liquidation_operations x),'obligations',(select jsonb_agg(to_jsonb(x) order by x.id) from public.credit_portfolio_obligations x),'repayments',(select count(*) from public.credit_repayments),'events',(select count(*) from public.credit_collection_events))::text);")
try:
 inspection=json.loads(subprocess.run(['docker','--context',CONTEXT,'inspect',CONTAINER],text=True,capture_output=True,check=True).stdout)[0]
 assert inspection['HostConfig']['NetworkMode']=='none' and not inspection['HostConfig']['PortBindings']
 assert not any(m['Type']=='bind' for m in inspection['Mounts'])
 run('create database '+DB+';',db='postgres');run(FIXTURE.read_text());run('grant insert on public.credit_collection_events to authenticated;')
 for migration in MIGRATIONS:run(migration.read_text())
 version=run('show server_version;');assert version.startswith('17.')
 before=fingerprint();check('PostgreSQL 17 and source model loaded',lambda:eq(version.split('.')[0],'17'))
 check('canonical recovery digest matches PostgreSQL payload hash',lambda:eq(run(identity()+"select public.cobra_krediya_payload_digest("+q(json.dumps([ROW]))+"::jsonb);"),run("select encode(sha256(convert_to("+q(json.dumps([ROW]))+"::jsonb::text,'UTF8')),'hex');")))
 check('anonymous cannot compute candidate payload digest',lambda:run(identity(role='anon')+"select public.cobra_krediya_payload_digest('[]');",expected='permission denied'))
 request=str(uuid.uuid4());sha='a'*64;first=call(request=request,sha=sha)
 check('save links two existing operations including one without collection obligation',lambda:eq((first['row_count'],first['duplicate'],first['official_quality']),(2,False,False)))
 check('canonical cents, calendar, author and FK links persisted',lambda:eq(scalar("select jsonb_build_object('rows',row_count,'links',(select count(*) from public.cobra_krediya_cut_operations where cut_id=c.id),'author',received_by,'mora',observations->0->'arrears_cents','calendar',observations->0->'calendar_due') from public.cobra_krediya_cuts c limit 1"),{'rows':2,'links':2,'author':USERS[0],'mora':10000000,'calendar':'2026-10-31'}))
 check('same request returns existing cut',lambda:eq(call(request=request,sha=sha)['id'],first['id']))
 check('same file/cut with a new request returns existing cut',lambda:eq(call(request=str(uuid.uuid4()),sha=sha)['id'],first['id']))
 check('same request with changed payload rejected',lambda:call(rows=[{**ROW,'paid':2,'overdue':1},ROW2],request=request,sha=sha,expected='cobra_idempotency_conflict'))
 other_request=str(uuid.uuid4());call(request=other_request,sha='f'*64)
 check('crossed request and file identities do not silently resolve to either cut',lambda:call(request=request,sha='f'*64,expected='cobra_idempotency_conflict'))
 check('missing request key cannot be accepted as a file duplicate',lambda:run(identity()+"select public.cobra_krediya_save_cut(null,repeat('a',64),'2026-10-01','2026-11-25','fiction.xlsx','[]');",expected='cobra_invalid_request'))
 for title,rows,error in [
 ('duplicate contract',[ROW,ROW],'cobra_duplicate_or_invalid_contract'),
 ('unknown credit',[ROW,{**ROW2,'contract':'fiction999'}],'cobra_contract_not_uniquely_accessible'),
 ('wrong identity',[{**ROW,'document':'999009'}],'cobra_identity_or_terms_mismatch'),
 ('wrong financed amount',[{**ROW,'financed_cents':1}],'cobra_identity_or_terms_mismatch'),
 ('invalid counts',[{**ROW,'overdue':1}],'cobra_invalid_installments'),
 ('unknown provider status',[{**ROW,'contract_status':'cancelled'}],'cobra_invalid_status'),
 ('invalid date',[{**ROW,'created':'2026-02-30'}],'date/time field value out of range'),
 ('wrong cohort',[{**ROW,'created':'2026-09-01'}],'cobra_wrong_cohort'),
 ('fractional count',[{**ROW,'paid':1.5}],'cobra_invalid_count_or_amount'),
 ('unknown field',[{**ROW,'payment':True}],'cobra_invalid_row_shape'),
 ('overflow',[{**ROW,'fee_cents':9007199254740991}],'cobra_invalid_installments'),
 ('empty rows',[],'cobra_rows_limit')]:
  old=count();call(rows=rows,expected=error);eq(count(),old);CHECKS.append(title+' rejects whole transaction')
 check('inactive profile denied',lambda:call(i=4,expected='cobra_not_authorized'))
 check('ordinary store user denied',lambda:call(i=2,expected='cobra_not_authorized'))
 check('manager without import entitlement cannot import even a previously saved file',lambda:call(i=5,sha=sha,expected='cobra_not_authorized'))
 check('tracking operator cannot read raw source rows',lambda:run(identity(5)+'select source_rows from public.cobra_krediya_cuts;',expected='permission denied'))
 check('explicit tracking scope allows canonical observations for an authorized manager',lambda:eq(run(identity(5)+'select count(observations) from public.cobra_krediya_cuts;'),str(count())))
 # Source duplicates are evidence, not something this module is allowed to delete or globally forbid.
 duplicate_id='dddddddd-dddd-4ddd-8ddd-ddddddddddd1'
 run("insert into public.liquidation_operations(id,plataforma,reconocida,external_id) values('"+duplicate_id+"','krediya',false,' FICTION001 ');")
 check('non-recognized cancellation/evidence row does not become another tracked credit',lambda:eq(call()['row_count'],2))
 run("update public.liquidation_operations set reconocida=true where id='"+duplicate_id+"';")
 check('two visible recognized originals block the whole cut for reconciliation',lambda:call(expected='cobra_contract_not_uniquely_accessible'))
 run("delete from public.liquidation_operations where id='"+duplicate_id+"';")
 check('explicit fictional manager can import',lambda:eq(call(i=3)['row_count'],2))
 check('auditor can import',lambda:eq(call(i=1)['row_count'],2))
 check('anonymous cannot read snapshots',lambda:run(identity(role='anon')+'select count(*) from public.cobra_krediya_cuts;',expected='permission denied'))
 check('ordinary authenticated user reads no snapshots',lambda:eq(run(identity(2)+'select count(*) from public.cobra_krediya_cuts;'),'0'))
 check('unauthenticated session denied even under authenticated role',lambda:run("set role authenticated;select set_config('request.jwt.claim.sub','',false);select public.cobra_krediya_save_cut(gen_random_uuid(),repeat('d',64),'2026-10-01','2026-11-25','fiction.xlsx','[]');",expected='cobra_not_authorized'))
 for verb in ['update public.cobra_krediya_cuts set source_name=\'changed\'','delete from public.cobra_krediya_cuts','truncate public.cobra_krediya_cuts']:
  check(verb.split()[0]+' unavailable to importer',lambda v=verb:run(identity()+v+';',expected='permission denied'))
 check('cannot supply forged author or canonical fields directly',lambda:run(identity()+"insert into public.cobra_krediya_cuts(received_by) values('22222222-2222-4222-8222-222222222222');",expected='permission denied'))
 # Valid parent insertion must also be validated and link all rows; direct access is not an unchecked bypass.
 check('direct parent insert still validates malformed rows',lambda:run(identity()+"insert into public.cobra_krediya_cuts(request_id,file_sha256,cohort_month,cutoff,source_name,source_rows) values(gen_random_uuid(),repeat('b',64),'2026-10-01','2026-11-25','fiction.xlsx','[]');",expected='cobra_rows_limit'))
 run("update public.liquidations set approved_at=null;")
 check('unapproved source batch is not linked',lambda:call(expected='cobra_source_not_approved'))
 run("update public.liquidations set approved_at='2026-11-01 00:00:00+00';")
 # Concurrent identical files with independent request IDs converge on a single committed cut.
 old=count();cs='c'*64
 with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:results=list(pool.map(lambda _:call(sha=cs),range(2)))
 check('concurrent identical imports converge',lambda:eq((results[0]['id'],count()),(results[1]['id'],old+1)))
 check('one concurrent writer reports duplicate',lambda:eq(sorted(x['duplicate'] for x in results),[False,True]))
 mixed=str(uuid.uuid4());mixed_sha='8'*64
 def mixed_call(rows):
  try:return call(rows=rows,request=mixed,sha=mixed_sha)
  except AssertionError as exc:
   if 'cobra_idempotency_conflict' in str(exc):return 'conflict'
   raise
 with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:mixed_results=list(pool.map(mixed_call,[[ROW,ROW2],[{**ROW,'paid':2,'overdue':1},ROW2]]))
 check('same-key concurrent different payloads have one success and one conflict',lambda:eq(sum(x=='conflict' for x in mixed_results),1))
 run("update public.liquidation_operations set normalized_data='{\"fecha\":\"2026-10-01T02:00:00Z\"}' where id='"+OPS[0]+"';")
 check('explicit UTC source timestamp is converted to the Bogota business day',lambda:eq(call(rows=[{**ROW,'created':'2026-09-30'}],month='2026-09-01')['row_count'],1))
 run("update public.liquidation_operations set normalized_data='{\"fecha\":\"2026-10-01T02:00:00\"}' where id='"+OPS[0]+"';")
 check('source timestamp without a zone does not inherit a database timezone silently',lambda:call(rows=[ROW],expected='cobra_source_date_invalid'))
 run("update public.liquidation_operations set normalized_data='{\"fecha\":\"2026-10-01T13:00:00Z\"}' where id='"+OPS[0]+"';")

 check('original source, balances and operational events unchanged',lambda:eq(fingerprint(),before))
 financial_before=financial_fingerprint()
 event_request=str(uuid.uuid4());managed=event(request=event_request)
 check('collection event uses the existing obligation when accessible',lambda:eq((managed['operation_id'],managed['obligation_id'],managed['payment_created']),(OPS[0],'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1',False)))
 check('identical collection retry returns one event',lambda:eq((event(request=event_request)['id'],event(request=event_request)['duplicate']),(managed['id'],True)))
 check('changed collection retry conflicts',lambda:event(request=event_request,note='Different fictional note',expected='cobra_event_idempotency_conflict'))
 check('another operator cannot reuse the collection request',lambda:event(request=event_request,i=1,expected='cobra_event_idempotency_conflict'))
 without=event(op=OPS[1]);check('operation without an obligation receives a collection event without creating debt',lambda:eq((without['operation_id'],without['obligation_id']),(OPS[1],None)))
 manager_event=event(i=5)
 check('manager with no source permission can track a validated operation without expanding source access',lambda:eq((manager_event['operation_id'],manager_event['obligation_id']),(OPS[0],None)))
 check('tracking does not grant the manager source-table access',lambda:eq(run(identity(5)+'select count(*) from public.liquidation_operations;'),'0'))
 check('manager can read the saved event through the operation policy',lambda:eq(run(identity(5)+'select count(*) from public.credit_collection_events where id='+q(manager_event['id'])+';'),'1'))
 for title,kwargs,error in [
 ('ordinary user',{'i':2},'cobra_event_not_authorized'),
 ('inactive user',{'i':4},'cobra_event_not_authorized'),
 ('missing imported operation',{'op':'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa9'},'cobra_event_without_reviewed_cut'),
 ('unsupported event',{'kind':'payment'},'cobra_event_invalid_fields'),
 ('empty note',{'note':'   '},'cobra_event_invalid_fields'),
 ('unsupported channel',{'channel':'webhook'},'cobra_event_invalid_fields'),
 ('incomplete promise',{'kind':'promise'},'cobra_event_invalid_promise'),
 ('fractional promise',{'kind':'promise','date':'2090-01-01','amount':1.5},'cobra_event_invalid_promise'),
 ('expired promise',{'kind':'promise','date':'2000-01-01','amount':100},'cobra_event_invalid_promise'),
 ('unexpected promise fields',{'date':'2090-01-01','amount':100},'cobra_event_unexpected_promise')]:
  check(title+' is rejected',lambda k=kwargs,e=error:event(expected=e,**k))
 promise=event(kind='promise',date='2090-01-01',amount=100)
 check('valid commitment is an event, not a payment',lambda:eq((promise['event_type'],promise['payment_created']),('promise',False)))
 check('anonymous cannot execute collection RPC',lambda:run(identity(role='anon')+"select public.cobra_krediya_save_collection(gen_random_uuid(),'"+OPS[0]+"','note','internal','fiction');",expected='permission denied'))
 check('ordinary store user cannot read operation events',lambda:eq(run(identity(2)+'select count(*) from public.credit_collection_events;'),'0'))
 check('forged event author denied on direct insert',lambda:run(identity()+"insert into public.credit_collection_events(operation_id,client_request_id,actor_type,event_type,channel,note,created_by) values('"+OPS[0]+"',gen_random_uuid(),'humano','note','internal','fiction','"+USERS[1]+"');",expected='cobra_event_not_authorized'))
 check('wrong obligation denied on direct insert',lambda:run(identity()+"insert into public.credit_collection_events(operation_id,obligation_id,client_request_id,actor_type,event_type,channel,note,created_by) values('"+OPS[1]+"','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1',gen_random_uuid(),'humano','note','internal','fiction','"+USERS[0]+"');",expected='cobra_event_wrong_obligation'))
 check('legacy event without an operation cannot bypass insert policy',lambda:run(identity()+"insert into public.credit_collection_events(obligation_id,actor_type,event_type,channel,note,created_by) values('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1','humano','note','internal','fiction','"+USERS[0]+"');",expected='cobra_direct_legacy_event_denied'))
 er=str(uuid.uuid4())
 with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:er_results=list(pool.map(lambda _:event(request=er),range(2)))
 check('concurrent collection writes converge on one event',lambda:eq((er_results[0]['id'],sorted(x['duplicate'] for x in er_results)),(er_results[1]['id'],[False,True])))
 run(identity()+"select public.fictional_legacy_collection('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1');")
 check('fictional legacy authorized RPC remains usable without an operation link',lambda:eq(run("select count(*) from public.credit_collection_events where operation_id is null;"),'1'))
 check('collection never changes operations, balances or payment rows',lambda:eq(financial_fingerprint(),financial_before))
 run('grant update,delete,truncate on public.credit_collection_events to authenticated;grant truncate on public.credit_collection_events to anon;create policy fictional_extra_update on public.credit_collection_events for update to authenticated using(true) with check(true);create policy fictional_extra_delete on public.credit_collection_events for delete to authenticated using(true);create policy fictional_extra_insert on public.credit_collection_events for insert to authenticated with check(true);')
 check('operation event cannot be updated despite prior permissive grants/policies',lambda:run(identity()+"update public.credit_collection_events set note='changed' where id="+q(managed['id'])+';',expected='cobra_event_history_immutable'))
 check('operation event cannot be deleted despite permissive grants/policies',lambda:run(identity()+"delete from public.credit_collection_events where id="+q(managed['id'])+';',expected='cobra_event_history_immutable'))
 check('legacy row cannot gain an operation through update',lambda:run(identity()+"update public.credit_collection_events set operation_id='"+OPS[0]+"' where operation_id is null;",expected='cobra_event_history_immutable'))
 check('anonymous truncate cannot use invisible rows to bypass immutability',lambda:run(identity(role='anon')+'truncate public.credit_collection_events;',expected='cobra_history_immutable'))
 check('new permissive legacy insert policy cannot bypass direct-call guard',lambda:run(identity()+"insert into public.credit_collection_events(obligation_id,actor_type,event_type,channel,note,created_by) values('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1','humano','note','internal','fiction','"+USERS[0]+"');",expected='cobra_direct_legacy_event_denied'))
 check('owner-level accidental snapshot edit is blocked',lambda:run("update public.cobra_krediya_cuts set source_name='changed';",expected='cobra_history_immutable'))
 check('owner-level accidental snapshot truncate is blocked',lambda:run('truncate public.cobra_krediya_cuts cascade;',expected='cobra_history_immutable'))

 count_before=count();run(ROLLBACK.read_text(),expected='cobra_history_exists_forward_correction_required')
 check('rollback with history aborts without losing a cut',lambda:eq(count(),count_before))
 # An empty installation can be reversed; fixture role creation is idempotent across databases.
 empty=DB+'_empty';run('create database '+empty+';',db='postgres');run(FIXTURE.read_text(),db=empty)
 for migration in MIGRATIONS:run(migration.read_text(),db=empty)
 run(ROLLBACK.read_text(),db=empty)
 check('empty-installation rollback restores absence of candidate tables',lambda:eq(run("select to_regclass('public.cobra_krediya_cuts') is null;",db=empty),'t'))
 check('empty rollback restores the original event reference and removes new columns',lambda:eq(run("select bool_and(case when attname='obligation_id' then attnotnull else false end) from pg_attribute where attrelid='public.credit_collection_events'::regclass and attname in ('operation_id','client_request_id','obligation_id') and not attisdropped;",db=empty),'t'))
 # Concurrent writer commits before rollback can acquire its lock; the fresh check must see it.
 race=DB+'_race';run('create database '+race+';',db='postgres');run(FIXTURE.read_text(),db=race)
 for migration in MIGRATIONS:run(migration.read_text(),db=race)
 writer_sql="begin;set application_name='cobra_fictional_writer';"+identity()+"select public.cobra_krediya_save_cut(gen_random_uuid(),repeat('e',64),'2026-10-01','2026-11-25','fiction.xlsx',"+q(json.dumps([ROW,ROW2]))+"::jsonb);select pg_sleep(1.5);commit;"
 with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
  writer=pool.submit(run,writer_sql,race)
  for attempt in range(40):
   sleeping=run("select count(*) from pg_stat_activity where application_name='cobra_fictional_writer' and wait_event='PgSleep';",db=race)
   if sleeping=='1':break
   time.sleep(.05)
  assert sleeping=='1','fictional writer did not reach synchronization barrier'
  run(ROLLBACK.read_text(),db=race,expected='cobra_history_exists_forward_correction_required');writer.result()
 check('rollback waits for concurrent import and preserves newly committed history',lambda:eq(run('select count(*) from public.cobra_krediya_cuts;',db=race),'1'))
 # FORCE RLS must not hide history from a non-bypass owner executing the rollback.
 run("do $$$$begin create role cobra_fictional_owner nologin nosuperuser nobypassrls;exception when duplicate_object then null;end$$$$;".replace('$$$$','$$'),db=race)
 run("alter table public.credit_collection_events owner to cobra_fictional_owner;alter table public.cobra_krediya_cuts owner to cobra_fictional_owner;alter table public.cobra_krediya_cut_operations owner to cobra_fictional_owner;alter table public.liquidation_operations owner to cobra_fictional_owner;do $$declare p record;begin for p in select oid::regprocedure as f from pg_proc where pronamespace='public'::regnamespace and left(proname,6)='cobra_' loop execute format('alter function %s owner to cobra_fictional_owner',p.f);end loop;end$$;",db=race)
 run('set role cobra_fictional_owner;'+ROLLBACK.read_text(),db=race,expected='query would be affected by row-level security policy')
 check('non-bypass owning role cannot mistake FORCE RLS-hidden history for an empty install',lambda:eq(run('select count(*) from public.cobra_krediya_cuts;',db=race),'1'))
 # Migration preconditions must reject unsupported prior permissions/schema atomically.
 run(MIGRATIONS[0].read_text(),db=empty)
 run('alter table public.credit_collection_events disable row level security;',db=empty)
 run(MIGRATIONS[1].read_text(),db=empty,expected='cobra_event_rls_required')
 check('disabled RLS aborts candidate installation',lambda:eq(run("select count(*) from pg_attribute where attrelid='public.credit_collection_events'::regclass and attname='operation_id' and not attisdropped;",db=empty),'0'))
 run('alter table public.credit_collection_events enable row level security;',db=empty)
 run('create policy fictional_dormant_insert on public.credit_collection_events for insert to authenticated with check(true);',db=empty)
 run(MIGRATIONS[1].read_text(),db=empty,expected='cobra_preexisting_insert_policy_review_required')
 check('dormant existing insert policy blocks migration',lambda:eq(run("select count(*) from pg_attribute where attrelid='public.credit_collection_events'::regclass and attname='operation_id' and not attisdropped;",db=empty),'0'))
 run('drop policy fictional_dormant_insert on public.credit_collection_events;',db=empty)
 run('grant insert(note) on public.credit_collection_events to authenticated;',db=empty)
 run(MIGRATIONS[1].read_text(),db=empty,expected='cobra_preexisting_column_grants_review_required')
 check('existing column privileges stop the second migration without adding columns',lambda:eq(run("select count(*) from pg_attribute where attrelid='public.credit_collection_events'::regclass and attname='operation_id' and not attisdropped;",db=empty),'0'))
 run('revoke insert(note) on public.credit_collection_events from authenticated;alter table public.credit_collection_events alter column obligation_id drop not null;',db=empty)
 run(MIGRATIONS[1].read_text(),db=empty,expected='cobra_preexisting_nullable_obligation_review_required')
 check('preexisting nullable reference stops migration instead of assuming rollback semantics',lambda:eq(run("select count(*) from pg_attribute where attrelid='public.credit_collection_events'::regclass and attname='operation_id' and not attisdropped;",db=empty),'0'))
 result={'ok':True,'run_id':DB,'version':version,'checks':CHECKS,'passed':len(CHECKS),'fixture':'fictional reduced dependency model; not live ACL fidelity or Auth/PostgREST certification','production_changes':False,'network':'none','host_bind_mounts':0,'published_ports':0,'source_sha256':{str(p.relative_to(ROOT)):hashlib.sha256(p.read_bytes()).hexdigest() for p in [*MIGRATIONS,FIXTURE,ROLLBACK,Path(__file__)]},'image_id':inspection['Image']}
 (OUT/'native-cut-history-result.json').write_text(json.dumps(result,indent=2));print(json.dumps(result))
except Exception as e:
 (OUT/'native-cut-history-failure.json').write_text(json.dumps({'ok':False,'run_id':DB,'completed_checks':CHECKS,'error':str(e)},indent=2));raise
