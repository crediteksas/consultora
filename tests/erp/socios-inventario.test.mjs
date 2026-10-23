import test from 'node:test';
import assert from 'node:assert/strict';
import {createDb,payload,register,consult,state,admin,user,id,cut,who,attachCashCycle} from './fixtures/socios-inventario.mjs';
const fixture=async t=>{const db=await createDb();t.after(()=>db.close());return db;};

test('socios: una salida 1000, socio 700 y aporte 300, sin gastos ni Banco',async t=>{
 const db=await fixture(t),p=await payload(db);await register(db,p);
 assert.deepEqual(await state(db),{operations:1,allocations:2,cash_movements:1,cash_out:'1000',source_debt:'2000',target_debt:'1700',supplier_debt:'700',supplier_payments:1,withdrawals:1,bank:0,treasury:0,expenses:0});
 const data=await consult(db),source=data.cortes.find(x=>x.corte_id===cut.positive),target=data.cortes.find(x=>x.corte_id===cut.negative);
 assert.equal(source.utilidad_neta,1000);assert.equal(source.disponible,0);assert.equal(source.retirado,1000);
 assert.equal(target.utilidad_neta,-300);assert.equal(target.perdida_cubierta,300);assert.equal(target.perdida_pendiente,0);
 assert.equal(data.operaciones.length,1);assert.equal(data.operaciones[0].destinos[1].tipo,'aporte');
 assert.match((await admin(db,'select concepto from cuenta_corriente where tipo=\'abono\'')).rows[0].concepto,/Aporte de socios/);
});
test('socios: reintento idéntico no duplica; otra solicitud con la misma llave falla',async t=>{
 const db=await fixture(t),p=await payload(db),first=await register(db,p);const retry=await register(db,p);
 assert.equal(retry.operacion,first.operacion);assert.equal(retry.reutilizado,true);
 await assert.rejects(register(db,{...p,motivo:'Otros datos de prueba'}),/otros datos/);
 assert.equal((await state(db)).cash_movements,1);
});
test('socios: retiro parcial conserva centavos y el disponible restante',async t=>{
 const db=await fixture(t),p=await payload(db);p.destinos=[{...p.destinos[0],monto:'100.25'}];await register(db,p);
 assert.equal((await consult(db)).cortes.find(x=>x.corte_id===cut.positive).disponible,899.75);
 p.destinos[0]={...p.destinos[0],monto:'50.05',soporte_path:`finanzas/${id(72)}.pdf`};await admin(db,"insert into storage.objects values('soportes',$1)",[p.destinos[0].soporte_path]);
 await register(db,p,id(81));assert.equal((await consult(db)).cortes.find(x=>x.corte_id===cut.positive).disponible,849.7);
 assert.equal((await state(db)).cash_out,'150.30');
});
test('socios: varios aportes al mismo destino no pueden cubrir dos veces una pérdida',async t=>{
 const db=await fixture(t),p=await payload(db);p.destinos=[{...p.destinos[1],monto:'200'}];await register(db,p);
 p.destinos[0]={...p.destinos[0],monto:'101',soporte_path:`finanzas/${id(73)}.pdf`};await admin(db,"insert into storage.objects values('soportes',$1)",[p.destinos[0].soporte_path]);
 await assert.rejects(register(db,p,id(82)),/superan la pérdida/);
 assert.equal((await state(db)).cash_out,'200');
});
test('socios: valida suma, signos, formato de centavos y resultado vigente',async t=>{
 const db=await fixture(t),p=await payload(db);
 for(const monto of ['0','-1','NaN','Infinity','1.001','1000000000000'])await assert.rejects(register(db,{...p,destinos:[{...p.destinos[0],monto}]}),/Importe/);
 await assert.rejects(register(db,{...p,destinos:[{...p.destinos[0],monto:'1001'}]}),/supera la utilidad/);
 await assert.rejects(register(db,{...p,huella:'cambiada'}),/cambió/);
 await admin(db,"update fixture_results set result=jsonb_set(result,'{listo}','false') where corte_id=$1",[cut.positive]);
 await assert.rejects(register(db,p),/no está listo/);assert.equal((await state(db)).operations,0);
});
test('socios: servidor impide grupo distinto, otro mes y aporte a la propia fuente',async t=>{
 const db=await fixture(t),p=await payload(db);
 await admin(db,"update inventario_control.socios_grupos_tienda set grupo='otros-socios' where tienda_codigo='T2'");
 await assert.rejects(register(db,p),/mismos socios/);
 await admin(db,"update inventario_control.socios_grupos_tienda set grupo='socios-retail' where tienda_codigo='T2'");
 await assert.rejects(register(db,{...p,destinos:[{...p.destinos[1],corte_id:cut.prior}]}),/mes de inventario/);
 await assert.rejects(register(db,{...p,destinos:[{...p.destinos[1],corte_id:cut.positive,huella:p.huella}]}),/otra tienda/);
 assert.equal((await state(db)).cash_movements,0);
});
test('socios: pérdida pendiente bloqueada, corte no autorizado y comparativo no se liquidan',async t=>{
 const db=await fixture(t),p=await payload(db);
 await admin(db,"update fixture_results set result=jsonb_set(result,'{listo}','false') where corte_id=$1",[cut.negative]);
 await assert.rejects(register(db,p),/pérdida final verificable/);
 await admin(db,"update fixture_results set result=jsonb_set(result,'{listo}','true') where corte_id=$1",[cut.negative]);
 await admin(db,"update inventario_control.cortes set autorizado_at=null where id=$1",[cut.positive]);
 await assert.rejects(register(db,p),/cerrado y autorizado/);
 await admin(db,"update inventario_control.cortes set autorizado_at=now(),revision_fuente='{\"solo_comparativo\":true}' where id=$1",[cut.positive]);
 await assert.rejects(register(db,p),/cerrado y autorizado/);
});
test('socios: exige soporte existente y no permite reutilizarlo en otro pago',async t=>{
 const db=await fixture(t),p=await payload(db);
 await assert.rejects(register(db,{...p,destinos:[{...p.destinos[0],soporte_path:`finanzas/${id(99)}.pdf`}]}),/Falta el soporte/);
 await assert.rejects(register(db,{...p,destinos:[{...p.destinos[0],soporte_path:'otro/soporte.pdf'}]}),/Falta el soporte/);
 p.destinos=[{...p.destinos[0],monto:'50'}];await register(db,p);
 await assert.rejects(register(db,p,id(83)),/soporte ya se utilizó/);assert.equal((await state(db)).cash_movements,1);
});
test('socios: no retira caja cerrada, insuficiente ni efectivo reservado',async t=>{
 const db=await fixture(t),p=await payload(db);
 await admin(db,"update fixture_cash set closed=true where tienda='T1'");await assert.rejects(register(db,p),/arqueo validado/);
 await admin(db,"update fixture_cash set closed=false,amount=900 where tienda='T1'");await assert.rejects(register(db,p),/efectivo libre/);
 await admin(db,"update fixture_cash set amount=1100 where tienda='T1'");
 await admin(db,"insert into instrucciones_consignacion(tienda_codigo,valor_esperado,estado,tipo_destino) values('T1',101,'rechazado','SOCIO')");
 await assert.rejects(register(db,p),/efectivo libre/);assert.equal((await state(db)).cash_movements,0);
});
test('socios: fecha real no futura ni anterior al inventario y confirmación obligatorias',async t=>{
 const db=await fixture(t),p=await payload(db);
 await assert.rejects(register(db,{...p,fecha:'2099-01-01'}),/fecha real/);
 await assert.rejects(register(db,{...p,fecha:'2026-10-06'}),/fecha real/);
 await assert.rejects(register(db,{...p,socios_comunes:false}),/Confirma/);
 await assert.rejects(register(db,{...p,motivo:''}),/Describe/);
});
test('socios: fallo del último destino revierte caja, factura, cartera, histórico y snapshots',async t=>{
 const db=await fixture(t),p=await payload(db),before=await state(db);
 await admin(db,`create function fixture_fail() returns trigger language plpgsql as $$begin if new.orden=2 then raise exception 'Fallo sintético posterior';end if;return new;end$$;`);
 await admin(db,'create trigger fail_last before insert on inventario_control.socios_destinos for each row execute function fixture_fail()');
 await assert.rejects(register(db,p),/Fallo sintético/);assert.deepEqual(await state(db),before);
 assert.equal((await admin(db,'select count(*)::int n from inventario_control.socios_resultados')).rows[0].n,0);
});
test('socios: admite excedente real en proveedor sin tocar Banco ni el importe aportado',async t=>{
 const db=await fixture(t),p=await payload(db);await admin(db,'update facturas_proveedor set saldo=100 where id=$1',[id(41)]);
 p.destinos=[p.destinos[1]];await register(db,p);const s=await state(db);assert.equal(s.supplier_debt,'-200');assert.equal(s.target_debt,'1700');assert.equal(s.bank,0);
});
test('socios: no toma un resultado cambiado como nueva utilidad disponible',async t=>{
 const db=await fixture(t),p=await payload(db);p.destinos=[{...p.destinos[0],monto:'100'}];await register(db,p);
 await admin(db,"update fixture_results set result=jsonb_set(result,'{huella}','\"otra-huella\"') where corte_id=$1",[cut.positive]);
 const source=(await consult(db)).cortes.find(x=>x.corte_id===cut.positive);assert.equal(source.listo,false);
 assert.match(source.bloqueos.join(' '),/resultado cambió/);
});
test('socios: descuentan retiros antiguos atribuibles sin volver a restar los del flujo nuevo',async t=>{
 const db=await fixture(t),p=await payload(db);
 await admin(db,"update origenes set inventario_control_activo=false,inventario_control_desde=null where codigo='T1'");
 await admin(db,`insert into financial_entries(entry_type,business_unit,status,amount,source_period_from,source_period_to,retail_funding)
 values('retiro_utilidad','retail','pagado',200,'2026-09-01','2026-10-07','{"request":{"stores":[{"store":"T1","amount":"200"}]}}')`);
 await admin(db,"update origenes set inventario_control_activo=true,inventario_control_desde='2026-09-01' where codigo='T1'");
 p.destinos=[{...p.destinos[0],monto:'100'}];await register(db,p);
 const r=(await consult(db)).cortes.find(x=>x.corte_id===cut.positive);assert.equal(r.retiros_anteriores,200);assert.equal(r.retirado,100);assert.equal(r.disponible,700);
});
test('socios: período antiguo ambiguo bloquea sin asignarlo arbitrariamente a un corte',async t=>{
 const db=await fixture(t);await admin(db,`insert into financial_entries(entry_type,business_unit,status,amount,source_period_from,source_period_to)
 values('retiro_utilidad','retail','pagado',10,'2026-08-01','2026-10-07')`);
 const r=(await consult(db)).cortes.find(x=>x.corte_id===cut.positive);assert.equal(r.listo,false);assert.match(r.bloqueos.join(' '),/retiros anteriores/);
});
test('socios: guard de API antigua se acota a las fuentes de cada fila y preserva otros negocios',async t=>{
 const db=await fixture(t);
 await assert.rejects(admin(db,`insert into financial_entries(entry_type,business_unit,status,retail_funding) values('retiro_utilidad','retail','pendiente_aprobacion','{"request":{"stores":[{"store":"T1","amount":"10"}]}}')`),/Liquidación de socios por inventario/);
 await admin(db,"update origenes set inventario_control_activo=false,inventario_control_desde=null where codigo='T9'");
 await admin(db,`insert into financial_entries(entry_type,business_unit,status,retail_funding) values('retiro_utilidad','retail','pendiente_aprobacion','{"request":{"stores":[{"store":"T9","amount":"10"}]}}')`);
 await admin(db,"insert into financial_entries(entry_type,business_unit,status) values('retiro_utilidad','b2b','pendiente_aprobacion'),('retiro_utilidad','aliados','pendiente_aprobacion')");
});
test('socios: Mayte y Óscar sí; otros auditores, tienda, inactivo y anónimo no',async t=>{
 const db=await fixture(t),p=await payload(db);
 for(const actor of [who.store,who.auditor,who.off,'']){await user(db,actor);await assert.rejects(consult(db),/Solo Mayte/);await assert.rejects(register(db,p),/Solo Mayte/);}
 await user(db,who.oscar);assert.equal((await consult(db)).cortes.length,4);
 await register(db,p);assert.equal((await state(db)).operations,1);
});
test('socios: tablas privadas sin acceso directo y entrada pública invoker sin permiso anónimo',async t=>{
 const db=await fixture(t);
 for(const table of ['socios_grupos_tienda','socios_resultados','socios_operaciones','socios_destinos'])
   await assert.rejects(db.query('select * from inventario_control.'+table),/permission denied/);
 const q=(await admin(db,`select has_function_privilege('anon','public.socios_inventario(text,jsonb,uuid)','execute') anonymous,
   (select prosecdef from pg_proc where oid='public.socios_inventario(text,jsonb,uuid)'::regprocedure) definer`)).rows[0];
 assert.equal(q.anonymous,false);assert.equal(q.definer,false);
});
test('socios: retiro antiguo sin hora no se atribuye entre dos cortes del mismo día',async t=>{
 const db=await fixture(t);await admin(db,"update origenes set inventario_control_activo=false,inventario_control_desde=null where codigo='T1'");
 await admin(db,`insert into financial_entries(entry_type,business_unit,status,amount,source_period_from,source_period_to,retail_funding)
 values('retiro_utilidad','retail','pagado',200,'2026-09-01','2026-10-07','{"request":{"stores":[{"store":"T1","amount":"200"}]}}')`);
 await admin(db,`insert into inventario_control.cortes(id,tienda_codigo,tienda_nombre,corte_at,estado,autorizado_at)
 values($1,'T1','Tienda ficticia 1','2026-10-07T18:00Z','aplicado',now())`,[id(16)]);
 await admin(db,"update origenes set inventario_control_activo=true,inventario_control_desde='2026-09-01' where codigo='T1'");
 const r=(await admin(db,'select inventario_control.socios_resultado($1) r',[cut.positive])).rows[0].r;
 assert.equal(r.listo,false);assert.equal(r.retiros_anteriores,0);assert.match(r.bloqueos.join(' '),/retiros anteriores/);
});
test('socios: resultado incompleto no se convierte en cero y grupo modificado exige revisión',async t=>{
 const db=await fixture(t),p=await payload(db);
 await admin(db,"update fixture_results set result=result-'utilidad_neta' where corte_id=$1",[cut.second]);
 const missing=(await consult(db)).cortes.find(x=>x.corte_id===cut.second);assert.equal(missing.listo,false);assert.equal(missing.utilidad_neta,undefined);
 assert.match(missing.bloqueos.join(' '),/incompleto/);
 p.destinos=[{...p.destinos[0],monto:'100'}];await register(db,p);
 await admin(db,"update inventario_control.socios_grupos_tienda set grupo='otro-grupo' where tienda_codigo='T1'");
 assert.equal((await consult(db)).cortes.find(x=>x.corte_id===cut.positive).listo,false);
});
test('socios: historial inmutable, sin destinos vacíos ni factura inactiva',async t=>{
 const db=await fixture(t),p=await payload(db);
 await assert.rejects(register(db,{...p,destinos:[]}),/veinte destinos/);
 await assert.rejects(register(db,{...p,destinos:Array(21).fill(p.destinos[0])}),/veinte destinos/);
 await assert.rejects(register(db,{...p,destinos:[{...p.destinos[1],factura_id:id(42)}]}),/proveedor activo/);
 await register(db,p);
 for(const table of ['socios_resultados','socios_operaciones','socios_destinos'])
  await assert.rejects(admin(db,'delete from inventario_control.'+table),/inmutables/);
 assert.equal((await state(db)).cash_movements,1);
});
test('socios: integra caja productiva, cierre sin diferencia y bloqueo de retiros posteriores',async t=>{
 const db=await fixture(t);await attachCashCycle(db);const p=await payload(db);
 await register(db,p);await register(db,p);
 const balance=(await db.query("select calcular_efectivo_esperado_tienda('T1','2026-10-20') b")).rows[0].b;
 assert.equal(balance.esperado,1000);assert.equal(balance.salidas_explicitas,1000);
 await admin(db,"select caja_asegurar_corte('T1','2026-10-20')");
 const closed=(await db.query("select validar_arqueo_caja('T1','2026-10-20',1000,$1,null,false) c",[id(98)])).rows[0].c;
 assert.equal(closed.ok,true);assert.equal(closed.diferencia,0);
 const next={...p,destinos:[{...p.destinos[0],monto:'1',soporte_path:`finanzas/${id(74)}.pdf`}]};
 await admin(db,"insert into storage.objects values('soportes',$1)",[next.destinos[0].soporte_path]);
 await assert.rejects(register(db,next,id(84)),/arqueo validado/);
 assert.equal((await state(db)).cash_movements,1);
});
