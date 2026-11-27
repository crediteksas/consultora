import{denied}from'../assert-rpc.mjs';
import test from 'node:test';import assert from 'node:assert/strict';
import{fullSetup,enableFictional,asActor,value}from'./r6-fixture.mjs';
const admin=db=>db.exec('set session authorization postgres;reset role;');
test('provider partition rotation preserves the seal only for inaccessible genuine descendants',async()=>{
 const{db}=await fullSetup();try{
  await enableFictional(db);const original=await value(db,'select fingerprint from kora_private.cartera_contract');
  await db.exec('set session authorization fictional_installer;create table realtime.fixture_day partition of realtime.messages for values from(0) to(10);create index on realtime.fixture_day(id);');
  assert.equal(await value(db,"select kora_private.cartera_safe_message_partition('realtime.fixture_day'::regclass)"),true);
  assert.equal(await value(db,'select kora_private.cartera_catalog_fingerprint()'),original);
  await asActor(db);assert.equal((await value(db,'select public.cartera_operador_inicio()')).restricted,true);
  await admin(db);await db.exec('grant select on realtime.fixture_day to kora_cartera_session;');await asActor(db);
  await denied(db.query('select public.cartera_operador_inicio()'),/cartera_contract_not_active/);
  await admin(db);await db.exec('revoke select on realtime.fixture_day from kora_cartera_session;');await asActor(db);
  assert.equal((await value(db,'select public.cartera_operador_inicio()')).restricted,true);
  await admin(db);await db.exec('alter table realtime.messages detach partition realtime.fixture_day;');await asActor(db);
  await denied(db.query('select public.cartera_operador_inicio()'),/cartera_contract_not_active/);
  await admin(db);await db.exec('drop table realtime.fixture_day;');await asActor(db);
  assert.equal((await value(db,'select public.cartera_operador_inicio()')).restricted,true);
 }finally{await db.close();}
});
test('a partition owned by another role or with PUBLIC privileges is never exempt',async()=>{
 const{db}=await fullSetup();try{
  await enableFictional(db);await db.exec('set session authorization fictional_installer;create table realtime.fixture_day partition of realtime.messages for values from(0) to(10);grant select on realtime.fixture_day to public;');
  assert.equal(await value(db,"select kora_private.cartera_safe_message_partition('realtime.fixture_day'::regclass)"),false);
  await asActor(db);await denied(db.query('select public.cartera_operador_inicio()'),/cartera_contract_not_active/);
  await admin(db);await db.exec('revoke select on realtime.fixture_day from public;alter table realtime.fixture_day owner to postgres;');
  assert.equal(await value(db,"select kora_private.cartera_safe_message_partition('realtime.fixture_day'::regclass)"),false);
  await asActor(db);await denied(db.query('select public.cartera_operador_inicio()'),/cartera_contract_not_active/);
 }finally{await db.close();}
});
