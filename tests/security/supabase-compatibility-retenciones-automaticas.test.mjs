import '../erp/venta-anulada-inicial-retenida.test.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {PGlite} from '@electric-sql/pglite';
const root=new URL('../../',import.meta.url);
const old=await readFile(new URL('supabase/migrations/20261110180316_registro_retenciones_proveedor.sql',root),'utf8');
const migration=await readFile(new URL('supabase/migrations/20261124164506_proveedores_retencion_automatica.sql',root),'utf8');
const actor='10000000-0000-0000-0000-000000000001';
const key=n=>`20000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
async function fixture(){
 const db=await PGlite.create();
 await db.exec(await readFile(new URL('tests/fixtures/supabase-compat/retenciones-automaticas/baseline.sql',root),'utf8'));
 await db.exec(old);
 const ids=(await db.query('select id,nombre from proveedores')).rows;
 const p=ids.find(x=>x.nombre==='COMUNICARIBE').id;
 const legacy=(await db.query("insert into facturas_proveedor(proveedor_id,numero,fecha,total,saldo) values($1,'HISTORICA-FICTICIA',current_date-10,1190,1190) returning id",[p])).rows[0].id;
 const legacyPaid=(await db.query("insert into facturas_proveedor(proveedor_id,numero,fecha,total,saldo) values($1,'PAGO-FICTICIO',current_date-10,1190,1190) returning id",[p])).rows[0].id;
 await db.exec(migration);
 return {db,ids,p,legacy,legacyPaid};
}
async function buy(db,p,n,{base=1000,total=1190,tipo='credito',manual=[]}={}){
 const items=[{cantidad:1,costo_unitario:total}];
 return (await db.query('select public.registrar_compra_proveedor_automatica($1,$2,current_date-1,$3,current_date,\'caja_central\',$4,null,null,$5,$6,$7) r',[p,String(n),tipo,JSON.stringify(items),key(n),JSON.stringify(manual),base])).rows[0].r;
}
test('calcula por base antes de IVA, conserva bruto, paga neto y reintenta sin duplicar',async()=>{
 const {db,p}=await fixture();try{
 const c=await buy(db,p,1);assert.equal(c.retefuente_automatica,25);
 const contado=await buy(db,p,2,{tipo:'contado'});assert.equal(contado.total_retenido,25);
 await buy(db,p,3,{total:1000});
 assert.equal((await buy(db,p,1)).reutilizado,true);
 assert.deepEqual((await db.query('select numero,total,saldo from facturas_proveedor where operacion_idempotency_key is not null order by numero')).rows,[
  {numero:'1',total:'1190.00',saldo:'1165.00'},{numero:'2',total:'1190.00',saldo:'0.00'},{numero:'3',total:'1000.00',saldo:'975.00'}]);
 assert.equal(Number((await db.query('select sum(monto) total from pagos_prueba')).rows[0].total),1165);
 assert.equal(Number((await db.query('select sum(monto) total from movimientos_tesoreria_central')).rows[0].total),1165);
 assert.equal((await db.query('select count(*) n from retenciones_factura_proveedor')).rows[0].n,3);
 await assert.rejects(buy(db,p,1,{base:900}),/otros datos/);
 await assert.rejects(buy(db,p,4,{base:null}),/base antes de IVA/);
 await assert.rejects(buy(db,p,5,{base:1200}),/base antes de IVA/);
 await assert.rejects(buy(db,p,6,{manual:[{tipo:'ReteFuente',base:1000,tarifa:2.5,valor:25}]}),/automáticamente/);
 await assert.rejects(db.query("select registrar_compra_proveedor($1,'OMITIDA',current_date,'[{\"cantidad\":1,\"costo_unitario\":1000}]',null,null)",[p]),/RETENCION_AUTOMATICA/);
 assert.equal((await db.query("select count(*) n from facturas_proveedor where numero='OMITIDA'")).rows[0].n,0);
 await assert.rejects(db.query("select registrar_retencion_factura_proveedor($1,'ReteFuente',1000,2.5,25,current_date,'Otro intento ficticio')",[c.factura_id]),/ya tiene ReteFuente/);
 assert.equal((await db.query("select has_function_privilege('anon','public.registrar_compra_proveedor_automatica(uuid,text,date,text,date,text,jsonb,text,text,uuid,jsonb,numeric)','EXECUTE') v")).rows[0].v,false);
 await db.exec("set test.central='no'");await assert.rejects(buy(db,p,7),/Solo Gerencia/);
 }finally{await db.close();}
});
test('regularización histórica audita el descuento único y conserva total, pagos e inventario',async()=>{
 const {db,p,legacy,legacyPaid}=await fixture();try{
 const call=async()=>(await db.query('select kora_private.completar_retencion_proveedor_pendiente($1,1000,190,1190,1190,1190,$2,$3) r',[legacy,actor,'XML ficticio y autorización de prueba; hash ficticio'])).rows[0].r;
 const r=await call();assert.equal(r.valor,25);assert.equal(r.saldo,1165);assert.equal((await call()).reutilizado,true);
 assert.equal((await db.query('select count(*) n from retenciones_factura_proveedor')).rows[0].n,1);
 assert.equal((await db.query('select count(*) n from pagos_prueba')).rows[0].n,0);
 assert.equal((await db.query('select count(*) n from inventario_prueba')).rows[0].n,0);
 assert.equal((await db.query('select total from facturas_proveedor where id=$1',[legacy])).rows[0].total,'1190.00');
 const f=legacyPaid;
 await db.query('insert into pagos_proveedor values($1)',[f]);
 await assert.rejects(db.query('select kora_private.completar_retencion_proveedor_pendiente($1,1000,190,1190,1190,1190,$2,$3)',[f,actor,'Soporte ficticio con pago previo']),/movimientos previos/);
 await db.exec('set role authenticated');
 await assert.rejects(db.query('select kora_private.completar_retencion_proveedor_pendiente($1,1000,190,1190,1190,1190,$2,$3)',[legacy,actor,'Soporte ficticio de prueba']),/permission denied|Solo soporte/);
 }finally{await db.close();}
});
test('fallo de auditoría revierte compra, retención, salida de fondos e inventario',async()=>{
 const {db,p}=await fixture();try{
 await db.exec("create function falla() returns trigger language plpgsql as $$begin raise exception 'Fallo ficticio';end$$;create trigger falla before insert on audit_log for each row execute function falla()");
 await assert.rejects(buy(db,p,8,{tipo:'contado'}),/Fallo ficticio/);
 for(const table of ['retenciones_factura_proveedor','pagos_prueba','inventario_prueba','movimientos_tesoreria_central'])assert.equal((await db.query(`select count(*) n from ${table}`)).rows[0].n,0);
 }finally{await db.close();}
});
test('cálculo de pantalla usa la base fiscal y rechaza vacíos o base mayor al total',async()=>{
 const context={};vm.runInNewContext(await readFile(new URL('creditek/erp/compra-retencion-automatica.js',root),'utf8'),context);
 const calcular=context.CreditekRetencionAutomatica.calcular;
 assert.equal(calcular({total:1190,base:1000}).valor,25);
 assert.equal(calcular({total:1000,base:1000}).neto,975);
 assert.equal(calcular({total:1190,base:1000.2}).valor,25.01);
 assert.throws(()=>calcular({total:1190,base:''}),/base antes de IVA/);
 assert.throws(()=>calcular({total:1190,base:1191}),/base antes de IVA/);
});
