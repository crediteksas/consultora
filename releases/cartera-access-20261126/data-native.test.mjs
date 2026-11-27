import {denied} from './assert-rpc.mjs';
import test from 'node:test';import assert from 'node:assert/strict';
import{fullSetup,operation,other,operator,manager,quote,value,asActor,enableFictional}from'./full-fixture.mjs';
const request='44444444-4444-4444-8444-444444444444';
const data=(db,dataset,args='')=>value(db,`select public.cartera_operador_datos(${quote(dataset)}${args})`);
test('fixed read datasets preserve classic origin scope and never expose raw/source fields',async()=>{
 const{db,cut}=await fullSetup();try{
  await enableFictional(db);await asActor(db);
  const portfolio=await data(db,'portfolio');assert.equal(portfolio.length,1);assert.equal(portfolio[0].operation_id,operation);assert.equal(portfolio[0].validated_repayments,50000);
  assert.equal(JSON.stringify(portfolio).includes('secret'),false);
  assert.equal(await value(db,'select count(*) from public.clientes'),0);
  const cuts=await data(db,'cuts',",'2026-10-01'");assert.equal(cuts.length,1);assert.equal(cuts[0].id,cut.id);assert.equal('source_rows'in cuts[0],false);
  const c=await data(db,'cut',`,null,'${cut.id}'`);assert.equal(c.row_count,1);assert.equal(c.observations[0].operation_id,operation);assert.equal('link_keys'in c,false);
  assert.deepEqual(await data(db,'fund_book'),{fundings:[],actions:[]});
  assert.equal((await data(db,'customer_history',`,null,'${operation}'`)).automatic_decision,false);
  for(const [dataset,args]of[['liquidation_operations',''],['source_rows',''],['cut',',null'],['cuts',",'2026-10-02'"],['portfolio',',null,null,null,501'],['portfolio',',null,null,null,100,50001']])await denied(data(db,dataset,args),/cartera_(dataset_denied|cut_required|invalid_month|invalid_page)/);
  await db.exec(`set session authorization postgres;reset role;update credit_portfolio_operators set capability='read' where perfil_id='${operator}'`);await asActor(db);
  assert.equal((await data(db,'portfolio')).length,1);
  await denied(data(db,'fund_book'),/cartera_quality_capability_required/);
 }finally{await db.close();}
});

test('read-only dedicated account cannot prepare actions; failed datasets consume committed budget',async()=>{
 const{db,cut}=await fullSetup();try{
  await enableFictional(db);await db.exec("update credit_portfolio_operators set capability='read'");await asActor(db);
  await denied(value(db,`select public.cartera_operador_guardar_gestion('${request}','${operation}','note','internal','Fictional blocked note')`),/cartera_manage_required/);
  await denied(value(db,`select public.cartera_operador_solicitar_provision('${request}','{}'::jsonb)`),/cartera_manage_required/);
  await denied(data(db,'fund_book'),/cartera_quality_capability_required/);
  await denied(data(db,'portfolio',',null,null,null,501'),/cartera_invalid_page/);
  await db.exec('set session authorization postgres;reset role;');assert.equal(await value(db,'select calls from kora_private.cartera_rpc_budget'),4);
  assert.equal(await value(db,'select count(*) from credit_collection_events'),0);assert.equal(await value(db,'select count(*) from cobra_provision_actions'),0);
 }finally{await db.close();}
});

test('identity callsites keep all original owners/ACLs/security modes and ordinary corporate flow',async()=>{
 const{db,beforeIdentity}=await fullSetup();try{
  const after=(await db.query("select p.oid::regprocedure::text name,p.proowner,(select jsonb_agg(jsonb_build_object('grantee',a.grantee,'privilege',a.privilege_type,'grantable',a.is_grantable,'grantor',a.grantor) order by a.grantee,a.privilege_type,a.grantor) from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where not exists(select 1 from pg_roles r where r.rolname='kora_cartera_operator' and r.oid=a.grantee)) as old_role_acl,p.prosecdef,p.provolatile,p.proconfig from pg_proc p where p.proname in('tiene_capacidad_cartera','cobra_quality_operator','cobra_krediya_save_collection','cobra_krediya_validate_event') order by p.oid::regprocedure::text")).rows;
  assert.deepEqual(after,beforeIdentity);
  assert.equal(await value(db,"select has_schema_privilege('kora_cartera_operator','auth','USAGE')"),false);
  await asActor(db,manager);assert.equal(await value(db,'select public.cobra_quality_operator()'),true);
  const r=await value(db,`select public.cobra_krediya_save_collection('${request}','${operation}','note','internal','Fictional ordinary management flow')`);assert.equal(r.payment_created,false);
  assert.equal(await value(db,'select public.cartera_subject()'),manager);
 }finally{await db.close();}
});
test('follow-up is idempotent and cannot create a payment or target a credit without a cut',async()=>{
 const{db}=await fullSetup();try{
  await enableFictional(db);await asActor(db);
  const sql=`select public.cartera_operador_guardar_gestion('${request}','${operation}','note','internal','Fictional follow up')`;
  const one=await value(db,sql),retry=await value(db,sql);assert.equal(one.payment_created,false);assert.equal(one.id,retry.id);assert.equal(retry.duplicate,true);
  assert.equal((await data(db,'collection_lookup',`,null,null,null,100,0,'${request}'`)).length,1);
  await denied(value(db,sql.replace('Fictional follow up','Changed payload')),/cobra_event_idempotency_conflict/);
  await denied(value(db,sql.replace(request,'55555555-5555-4555-8555-555555555555').replace(operation,other)),/cobra_event_without_reviewed_cut/);
  await assert.rejects(db.exec(`insert into credit_collection_events(operation_id,client_request_id,actor_type,event_type,channel,note,created_by)values('${operation}',gen_random_uuid(),'humano','note','internal','Raw attempt','${operator}')`),/permission denied|row-level security|cobra_event_not_authorized/);
  await db.exec('set session authorization postgres;reset role;');
  assert.equal(await value(db,'select count(*) from credit_collection_events'),1);assert.equal(await value(db,'select count(*) from credit_repayments'),1);
  assert.equal(Number(await value(db,"select outstanding_amount from credit_portfolio_obligations where external_credit_id='fiction001'")),350000);
 }finally{await db.close();}
});
test('provision prepares once; authorization, funding, release and execution are denied',async()=>{
 const{db,cut}=await fullSetup();try{
  await enableFictional(db);await asActor(db);
  const payload={kind:'request',parent_id:null,cut_id:cut.id,operation_id:operation,amount_cents:6000,allocations:[],purpose:'installments',note:'Fictional request only',evidence:null,evidence_sha256:null};
  const save=p=>value(db,`select public.cartera_operador_solicitar_provision('${request}',${quote(JSON.stringify(p))}::jsonb)`);
  const a=await save(payload),b=await save(payload);assert.equal(a.id,b.id);assert.equal(a.payment_executed,false);
  const book=await data(db,'fund_book');assert.equal(book.actions.length,1);assert.equal(book.actions[0].kind,'request');assert.equal('payload'in book.actions[0],false);
  assert.equal((await data(db,'fund_lookup',`,null,null,null,100,0,'${request}'`))[0].payload.kind,'request');
  await denied(save({...payload,amount_cents:6001}),/cobra_fund_idempotency_conflict/);
  for(const kind of['authorize','execute','release','reject','funding'])await denied(save({...payload,kind}),/cartera_request_only/);
  await assert.rejects(db.exec(`insert into cobra_provision_actions(request_id,payload)values(gen_random_uuid(),${quote(JSON.stringify(payload))}::jsonb)`),/permission denied|row-level security|cobra_fund_not_authorized/);
  await db.exec('set session authorization postgres;reset role;');
  assert.equal(await value(db,'select count(*) from cobra_provision_actions'),1);assert.equal(await value(db,'select count(*) from cobra_provision_fundings'),0);assert.equal(await value(db,'select count(*) from credit_repayments'),1);
 }finally{await db.close();}
});
