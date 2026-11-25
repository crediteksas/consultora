import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
const baseline=await readFile(new URL('../fixtures/supabase-compat/traslados-pesos-enteros/baseline.sql',import.meta.url),'utf8');
const migration=await readFile(new URL('../../supabase/migrations/20261125211717_traslados_cartera_pesos_enteros.sql',import.meta.url),'utf8');
const id=n=>`20000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
async function setup({patched=true,prices=['100.000001'],quantity=3,serial=false}={}){
 const db=await PGlite.create();
 await db.exec(baseline);
 if(patched)await db.exec(migration);
 await db.query("insert into traslados values($1,1,'recibido_pendiente_aprobacion','ORIGEN-FICTICIO','DESTINO-FICTICIO',null,null)",[id(1)]);
 for(let n=0;n<prices.length;n++){
  const product=id(100+n),unit=serial?id(200+n):null;
  await db.query('insert into productos values($1,$2)',[product,serial?'serializado':'cantidad']);
  if(serial)await db.query("insert into unidades values($1,'ORIGEN-FICTICIO','en_traslado',$2)",[unit,prices[n]]);
  else await db.query("insert into stock_cantidad values($1,'ORIGEN-FICTICIO',7,80,$2,null)",[product,prices[n]]);
  await db.query('insert into traslado_items values($1,$2,$3,$4,$5,80,$6)',[id(300+n),id(1),product,unit,serial?1:quantity,prices[n]]);
  await db.query("insert into movimientos(tipo,tienda_codigo,producto_id,unidad_id,cantidad,costo,precio,referencia_tipo,referencia_id) values('traslado_salida','ORIGEN-FICTICIO',$1,$2,$3,80,$4,'traslado',$5)",[product,unit,serial?1:quantity,prices[n],id(1)]);
 }
 return db;
}
const invoke=db=>db.query('select aprobar_traslado_recepcion($1) result',[id(1)]);
async function snapshot(db){
 const out={};for(const table of ['traslados','traslado_items','unidades','stock_cantidad','movimientos','cuentas_cartera','movimientos_cartera','cuenta_corriente','costo_promedio_tienda_historial'])out[table]=(await db.query(`select to_jsonb(t) data from ${table} t order by to_jsonb(t)::text`)).rows;
 return out;
}
test('reproduce el CHECK con residuos positivos y negativos y revierte toda la aprobación',async()=>{
 for(const price of ['100.000001','99.999999']){
  const db=await setup({patched:false,prices:[price]});try{
   const before=await snapshot(db);
   await assert.rejects(invoke(db),e=>e.code==='23514'&&/cuenta_corriente_monto_check/.test(e.message));
   assert.deepEqual(await snapshot(db),before);
  }finally{await db.close();}
 }
});
test('redondea el total una vez, mueve ambos saldos y no vuelve a restar el stock despachado',async()=>{
 for(const price of ['100.000001','99.999999','100']){
  const db=await setup({prices:[price]});try{
   const items=(await db.query('select * from traslado_items')).rows;
   assert.equal((await invoke(db)).rows[0].result.total,300);
   assert.deepEqual((await db.query('select tienda_codigo,tipo,monto from cuenta_corriente order by tipo')).rows,[
    {tienda_codigo:'ORIGEN-FICTICIO',tipo:'abono',monto:'300.00'},
    {tienda_codigo:'DESTINO-FICTICIO',tipo:'cargo',monto:'300.00'}]);
   assert.equal((await db.query("select sum(case tipo when 'cargo' then monto else -monto end) neto from cuenta_corriente")).rows[0].neto,'0.00');
   assert.deepEqual((await db.query('select tienda_codigo,cantidad from stock_cantidad order by tienda_codigo')).rows,[{tienda_codigo:'DESTINO-FICTICIO',cantidad:3},{tienda_codigo:'ORIGEN-FICTICIO',cantidad:7}]);
   assert.equal((await db.query('select count(*) n from movimientos_cartera')).rows[0].n,0);
   assert.equal((await db.query("select count(*) n from movimientos where tipo='traslado_entrada'")).rows[0].n,1);
   assert.equal((await db.query('select count(*) n from costo_promedio_tienda_historial')).rows[0].n,1);
   assert.deepEqual((await db.query('select * from traslado_items')).rows,items);
   const after=await snapshot(db);
   await assert.rejects(invoke(db),/pendiente de visto bueno/);
   assert.deepEqual(await snapshot(db),after);
  }finally{await db.close();}
 }
});
test('suma todos los artículos antes de redondear y conserva costos originales',async()=>{
 const db=await setup({prices:['0.335','0.335'],quantity:1});try{
  assert.equal((await invoke(db)).rows[0].result.total,1);
  assert.deepEqual((await db.query('select precio_tienda from traslado_items order by id')).rows,[{precio_tienda:'0.335'},{precio_tienda:'0.335'}]);
  assert.deepEqual((await db.query('select monto from cuenta_corriente order by tipo')).rows,[{monto:'1.00'},{monto:'1.00'}]);
 }finally{await db.close();}
});
test('el traslado de 34 unidades y los límites de medio peso registran pesos enteros',async()=>{
 for(const [precio,cantidad,total] of [['5802.1671571376878208',34,197274],['100.49',1,100],['100.50',1,101]]){
  const db=await setup({prices:[precio],quantity:cantidad});try{
   assert.equal((await invoke(db)).rows[0].result.total,total);
   const registros=(await db.query('select monto from cuenta_corriente order by tipo')).rows;
   assert.deepEqual(registros.map(x=>Number(x.monto)),[total,total]);
  }finally{await db.close();}
 }
});
test('mantiene el control del IMEI y la aprobación de equipos serializados',async()=>{
 const db=await setup({prices:['650000'],serial:true});try{
  await db.query("update unidades set estado='disponible'");const before=await snapshot(db);
  await assert.rejects(invoke(db),/IMEI/);assert.deepEqual(await snapshot(db),before);
  await db.query("update unidades set estado='en_traslado'");
  assert.equal((await invoke(db)).rows[0].result.total,650000);
  assert.deepEqual((await db.query('select tienda_actual,estado,precio_tienda from unidades')).rows,[{tienda_actual:'DESTINO-FICTICIO',estado:'disponible',precio_tienda:'650000'}]);
 }finally{await db.close();}
});
test('conserva permisos y rechaza perfiles no centrales sin cambiar inventario ni deuda',async()=>{
 const db=await setup();try{
  assert.equal((await db.query("select has_function_privilege('anon','public.aprobar_traslado_recepcion(uuid)','EXECUTE') v")).rows[0].v,false);
  const before=await snapshot(db);await db.exec("set test.central='no';set role authenticated");
  await assert.rejects(invoke(db),/Solo Gerencia o Auditoría/);await db.exec('reset role');
  assert.deepEqual(await snapshot(db),before);
  await db.exec('set role anon');await assert.rejects(invoke(db),{code:'42501'});await db.exec('reset role');
  assert.deepEqual(await snapshot(db),before);
 }finally{await db.close();}
});
test('un error posterior a la cartera revierte stock, kardex, saldos y estado',async()=>{
 const db=await setup();try{
  await db.exec("create function error_ficticio() returns trigger language plpgsql as $$begin raise exception 'Fallo final ficticio';end$$;create trigger falla before update on traslados for each row execute function error_ficticio()");
  const before=await snapshot(db);await assert.rejects(invoke(db),/Fallo final ficticio/);assert.deepEqual(await snapshot(db),before);
 }finally{await db.close();}
});
test('un total que redondea a cero falla antes de dejar movimientos parciales',async()=>{
 const db=await setup({prices:['0.000001']});try{
  const before=await snapshot(db);await assert.rejects(invoke(db),/costo de remisión válido/);assert.deepEqual(await snapshot(db),before);
 }finally{await db.close();}
});

