import test from 'node:test';import assert from 'node:assert/strict';
import{fullSetup as install,operator,manager,value,asActor,enableFictional}from'./r6-fixture.mjs';
import{read,quote}from'./core-fixture.mjs';
import{denied}from'../assert-rpc.mjs';
test('R6 full candidate installs with non-superuser and native managed controls without RLS',async()=>{
 const{db}=await install();try{
  assert.equal(await value(db,'select enabled from kora_private.cartera_contract'),false);
  assert.equal(await value(db,"select relrowsecurity from pg_class where oid='realtime.subscription'::regclass"),false);
  assert.equal(await value(db,"select has_table_privilege('authenticated','realtime.subscription','SELECT')"),true);
  assert.equal(await value(db,"select has_table_privilege('kora_cartera_session','realtime.subscription','SELECT')"),false);
  await asActor(db,manager);assert.deepEqual(await value(db,'select public.cartera_operador_inicio()'),{restricted:false});
  await enableFictional(db);await asActor(db);
  assert.equal((await value(db,'select public.cartera_operador_inicio()')).profile.id,operator);
  await assert.rejects(db.query('select * from public.clientes'),/permission denied/);
  await assert.rejects(db.query('select * from realtime.subscription'),/permission denied/);
  // The private authenticator login can SET roles; the JWT client has no SQL interface.
  assert.equal(await value(db,"select pg_has_role('kora_cartera_session','authenticated','SET')"),false);
 }finally{await db.close();}
});
test('R6 rejects old/downgraded JWT, mismatched role, inactive account and extra grants',async()=>{
 const{db}=await install();try{
  await enableFictional(db);await asActor(db,operator,'authenticated');
  await assert.rejects(db.query('select public.cartera_operador_inicio()'),/cartera_session_role_required/);
  await asActor(db);await db.exec(`select set_config('request.jwt.claims',${quote(JSON.stringify({sub:operator,role:'authenticated'}))},false)`);
  await assert.rejects(db.query('select public.kora_confirmacion_deuda_pre_request()'),/cartera_session_role_required/);
  await db.exec(`set session authorization postgres;reset role;update perfiles set activo=false where id='${operator}'`);await asActor(db);
  await denied(db.query('select public.cartera_operador_inicio()'),/cartera_profile_inactive/);
  await db.exec(`set session authorization postgres;reset role;update perfiles set activo=true where id='${operator}';grant select on clientes to kora_cartera_session;`);await asActor(db);
  await denied(db.query('select public.cartera_operador_inicio()'),/cartera_contract_not_active/);
 }finally{await db.close();}
});
