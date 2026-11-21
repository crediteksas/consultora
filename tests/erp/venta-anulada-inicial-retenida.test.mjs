import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
const root=new URL('../../',import.meta.url);
const file=p=>new URL(p,root);
const base=await readFile(file('tests/erp/fixtures/retencion-inicial-baseline.sql'),'utf8');
const patch=await readFile(file('supabase/migrations/20261121165939_retail_anulacion_inicial_retenida_auditada.sql'),'utf8');
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const ids={actor:id(1),sale:id(2),credit:id(3),unit:id(4),item:id(5),product:id(6),comp:id(7),op:id(8),liq:id(9),incident:id(10),request:id(11),other:id(12)};
async function fixture(){
 const db=await PGlite.create();await db.exec(base);
 await db.query("insert into public.origenes(codigo) values('FICTICIA'),('OTRA')");
 await db.query("insert into public.perfiles(id,nombre,rol) values($1,'Gerencia ficticia','gerencia'),($2,'Auditoría ficticia','auditoria')",[ids.actor,ids.other]);
 await db.query("insert into public.kora_incidents values($1,'INC-FICTICIA')",[ids.incident]);
 await db.query("insert into public.ventas(id,consecutivo,tienda_codigo,tipo,total,fecha) values($1,7,'FICTICIA','credito',500,current_date-2)",[ids.sale]);
 await db.query("insert into public.creditos(id,venta_id,financiera,cuota_inicial,valor_esperado_financiera) values($1,$2,'payjoy',100,400)",[ids.credit,ids.sale]);
 await db.query("insert into public.unidades values($1,'IMEI-FICTICIO','vendido',$2,'FICTICIA',300)",[ids.unit,ids.product]);
 await db.query('insert into public.venta_items values($1,$2,$3,$4,1,500,300)',[ids.item,ids.sale,ids.product,ids.unit]);
 await db.query("insert into public.movimientos(tipo,tienda_codigo,producto_id,unidad_id,cantidad,costo,precio,referencia_tipo,referencia_id) values('venta','FICTICIA',$1,$2,1,300,500,'venta',$3)",[ids.product,ids.unit,ids.sale]);
 await db.query("insert into public.liquidation_operations values($1,$2,'payjoy','IMEI-FICTICIO','FICTICIA',null)",[ids.op,ids.liq]);
 await db.query("insert into public.retail_b2b_compensations values($1,$2,$3,'FICTICIA','payjoy','IMEI-FICTICIO',600,100,now(),null,now())",[ids.comp,ids.op,ids.liq]);
 await db.query("insert into public.cuenta_corriente(tienda_codigo,tipo,concepto,monto,referencia_tipo,referencia_id) values('FICTICIA','cargo','Saldo ficticio',10000,'ficticio','1'),('FICTICIA','abono','Compensación ficticia',600,'compensacion_liquidacion_retail',$1)",[ids.comp]);
 await db.exec("insert into public.caja_diaria(tienda_codigo,fecha,estado,efectivo_contado,efectivo_esperado,apertura) values('FICTICIA',current_date-2,'cerrada',500,500,400),('FICTICIA',current_date-1,'cerrada',500,500,500); insert into public.caja_cortes values('FICTICIA',current_date-2,'validada',500),('FICTICIA',current_date-1,'validada',500); insert into public.caja_ciclo_config values(true,current_date-10)");
 return db;
}
async function apply(db,overrides={}){
 const x={...ids,...overrides};return (await db.query('select kora_private.rectificar_credito_retail_con_inicial_retenida($1,$2,$3,$4,$5,$6,600,100) r',[x.request,x.incident,x.sale,x.comp,x.actor,'Autorización ficticia de devolución; la inicial permanece en caja'])).rows[0].r;
}
const rows=async(db,q)=>(await db.query(q)).rows;
async function snapshot(db){
 const out={};for(const name of ['ventas','creditos','unidades','movimientos','cuenta_corriente','retail_b2b_compensations','caja_diaria','caja_cortes','venta_ajustes_administrativos','audit_log'])out[name]=await rows(db,`select * from public.${name} order by 1`);
 return out;
}
test('anula y reingresa una vez; conserva inicial y todos los arqueos y bloqueos',async()=>{
 const db=await fixture();try{
  const before=await snapshot(db);await db.exec(patch);
  const cash=async()=>(await db.query("select public.caja_calcular_interno('FICTICIA',current_date) j")).rows[0].j;
  const cashBefore=await cash();assert.equal(cashBefore.esperado,500);
  const result=await apply(db);assert.equal(result.ok,true);assert.equal(result.ya_aplicado,false);
  const after=await snapshot(db);assert.equal(after.ventas[0].anulada,true);assert.equal(after.creditos[0].estado_conciliacion,'novedad');assert.equal(after.unidades[0].estado,'disponible');
  assert.equal(result.inicial_retenida_caja,100);assert.equal(result.abono_reversado,600);assert.equal(result.saldo_cartera,10000);
  assert.equal((await cash()).esperado,cashBefore.esperado);assert.equal((await cash()).ajuste_arrastre_movimientos,0);
  assert.deepEqual(after.caja_diaria,before.caja_diaria);assert.deepEqual(after.caja_cortes,before.caja_cortes);
  assert.deepEqual(after.movimientos[0],before.movimientos[0]);assert.equal(after.movimientos.length,2);assert.equal(after.movimientos[1].reverso_de,before.movimientos[0].id);
  assert.deepEqual(after.cuenta_corriente.slice(0,2),before.cuenta_corriente);assert.equal(after.cuenta_corriente.length,3);assert.equal(after.cuenta_corriente[2].tipo,'cargo');assert.equal(Number(after.cuenta_corriente[2].monto),600);
  assert.ok(after.retail_b2b_compensations[0].reversed_at);assert.equal(after.audit_log.length,1);
  const day=(await db.query("select public.caja_componentes_rango('FICTICIA',current_date-2,current_date-2) j")).rows[0].j;
  assert.equal(day.iniciales,100);assert.equal(day.saldo_por_cobrar,0);assert.equal(day.operaciones,0);assert.equal(day.neto,100);
  const again=await apply(db);assert.equal(again.ya_aplicado,true);assert.deepEqual(await snapshot(db),after);
  await assert.rejects(apply(db,{request:id(20)}),/Venta no elegible/);
  await db.exec("set app.ajuste_venta_autorizado='1'");
  await assert.rejects(db.query('update public.ventas set total=total+1 where id=$1',[ids.sale]),/arqueo validado/);
  await db.exec("set app.ajuste_venta_autorizado=''");
  await assert.rejects(db.exec('update public.movimientos set cantidad=2'),/Kardex inmutable/);
  await assert.rejects(db.exec('delete from public.cuenta_corriente'),/inmutable/);
  await db.exec('set role authenticated');
  await assert.rejects(apply(db),/permission denied|Solo soporte/);await db.exec('reset role');
 }finally{await db.close();}
});
test('validaciones rechazan compensación y autorizante incorrectos sin aplicar nada',async()=>{
 const db=await fixture();try{await db.exec(patch);const before=await snapshot(db);
  await assert.rejects(apply(db,{actor:ids.other}),/autorización/);assert.deepEqual(await snapshot(db),before);
  await assert.rejects(apply(db,{comp:id(99)}),/Compensación/);assert.deepEqual(await snapshot(db),before);
  await db.exec("update public.unidades set tienda_actual='OTRA'");
  const changed=await snapshot(db);await assert.rejects(apply(db),/unidad ya cambió/);assert.deepEqual(await snapshot(db),changed);
 }finally{await db.close();}
});
test('un fallo al guardar la auditoría revierte venta, inventario, deuda y retención juntos',async()=>{
 const db=await fixture();try{await db.exec(patch);const before=await snapshot(db);
  await db.exec("create function public.fallo_auditoria() returns trigger language plpgsql as $$begin raise exception 'Fallo ficticio final'; end$$; create trigger fallo before insert on public.audit_log for each row execute function public.fallo_auditoria()");
  await assert.rejects(apply(db),/Fallo ficticio final/);assert.deepEqual(await snapshot(db),before);
  assert.equal((await rows(db,'select * from kora_private.ventas_iniciales_retenidas')).length,0);
 }finally{await db.close();}
});
