import test from'node:test';import assert from'node:assert/strict';
import{fullSetup,asActor,operator,manager,value}from'./r6-fixture.mjs';
test('active daily debt guard still blocks an ordinary store, exempts bootstrap and preserves Gerencia',async()=>{
 const{db}=await fullSetup({activeDebt:true});try{
  await asActor(db,operator,'authenticated');
  assert.deepEqual(await value(db,'select public.cartera_operador_inicio()'),{restricted:false});
  await db.exec("select set_config('request.path','/rpc/rol_actual',false)");
  await assert.rejects(db.query('select public.kora_confirmacion_deuda_pre_request()'),/Confirma la deuda/);
  await asActor(db,manager);await db.exec("select set_config('request.path','/rpc/rol_actual',false)");
  await db.query('select public.kora_confirmacion_deuda_pre_request()');
  await db.exec(`set session authorization postgres;reset role;insert into confirmaciones_deuda_tienda values('${operator}','fiction-A','2026-11-26')`);
  await asActor(db,operator,'authenticated');await db.exec("select set_config('request.path','/rpc/rol_actual',false)");await db.query('select public.kora_confirmacion_deuda_pre_request()');
 }finally{await db.close();}
});
