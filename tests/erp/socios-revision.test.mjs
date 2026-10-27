import test from'node:test';import assert from'node:assert/strict';
import{admin,user,id,who,cut,consult,payload,register,state}from'./fixtures/socios-inventario.mjs';
import{reviewDb,legacy,listReview,reviewPayload,confirmReview,changeFunding,closureDb,installRevision,view}from'./fixtures/socios-revision.mjs';
test('revisión: consultar no decide ni mueve dinero; anterior libera solo su corte',async t=>{
 const db=await reviewDb(t);await legacy(db);const before=await state(db),row=(await consult(db)).cortes.find(x=>x.corte_id===cut.positive);
 assert.equal(row.listo,false);const list=await listReview(db);assert.equal(list.retiros.length,1);assert.equal(list.retiros[0].requiere_revision,true);
 assert.deepEqual(await state(db),before);assert.equal((await admin(db,'select count(*)::int n from inventario_control.socios_retiros_revisiones')).rows[0].n,0);
 const p=await reviewPayload(db);await confirmReview(db,p);
 const after=(await consult(db)).cortes.find(x=>x.corte_id===cut.positive);assert.equal(after.listo,true);assert.equal(after.disponible,1000);assert.equal(after.retiros_anteriores,0);
 assert.equal((await listReview(db)).retiros[0].decision,'anterior');assert.deepEqual(await state(db),before);
});
test('revisión: descontar de este inventario no vuelve a pagar y conserva centavos',async t=>{
 const db=await reviewDb(t);await legacy(db,{stores:[{store:'T1',amount:'200.25'}]});const before=await state(db);
 await confirmReview(db,await reviewPayload(db,'este_corte'));
 const r=(await consult(db)).cortes.find(x=>x.corte_id===cut.positive);assert.equal(r.listo,true);assert.equal(r.retiros_anteriores,200.25);assert.equal(r.disponible,799.75);assert.deepEqual(await state(db),before);
});
test('revisión: reintento idéntico es único y clasificación contradictoria falla',async t=>{
 const db=await reviewDb(t);await legacy(db);const p=await reviewPayload(db),first=await confirmReview(db,p),again=await confirmReview(db,p);
 assert.equal(again.reutilizado,true);assert.equal(first.revision,again.revision);
 await assert.rejects(confirmReview(db,{...p,decision:'este_corte'}),/otros datos/);
 await assert.rejects(confirmReview(db,{...p,decision:'este_corte'},id(92)),/otra clasificación/);
 assert.equal((await admin(db,'select count(*)::int n from inventario_control.socios_retiros_revisiones')).rows[0].n,1);
 assert.equal((await admin(db,'select count(*)::int n from audit_log')).rows[0].n,1);
});
test('revisión: Mayte/Óscar sí, auditor genérico/tienda/inactivo/anónimo no',async t=>{
 const db=await reviewDb(t);await legacy(db);const p=await reviewPayload(db);
 for(const actor of[who.auditor,who.store,who.off,'']){await user(db,actor);await assert.rejects(listReview(db),/Solo Mayte/);await assert.rejects(confirmReview(db,p),/Solo Mayte/);}
 await user(db,who.oscar);assert.equal((await confirmReview(db,p)).ok,true);
 await db.exec('reset role;set role anon');await assert.rejects(listReview(db),e=>e.code==='42501');
});
test('revisión: tabla inmutable y sin acceso directo; huella y confirmación obligatorias',async t=>{
 const db=await reviewDb(t);await legacy(db);const p=await reviewPayload(db);
 await assert.rejects(db.query('select * from inventario_control.socios_retiros_revisiones'),e=>e.code==='42501');
 await assert.rejects(confirmReview(db,{...p,huella_fuente:'vieja'}),/retiro cambió/);
 await assert.rejects(confirmReview(db,{...p,confirmado:false}),/Confirma/);
 await assert.rejects(confirmReview(db,{...p,motivo:'no'}),/12 a 2000/);
 await confirmReview(db,p);
 await assert.rejects(admin(db,"update inventario_control.socios_retiros_revisiones set decision='este_corte'"),/inmutables/);
 await assert.rejects(admin(db,'delete from inventario_control.socios_retiros_revisiones'),/inmutables/);
});
test('revisión: no aplica a otra tienda y una fila de otra tienda no cambia su huella',async t=>{
 const db=await reviewDb(t);const entry=await legacy(db,{stores:[{store:'T1',amount:'200'},{store:'T2',amount:'50'}]});const p=await reviewPayload(db);
 await assert.rejects(confirmReview(db,{...p,corte_id:cut.second}),/distribución única/);
 await confirmReview(db,p);await changeFunding(db,entry,[{store:'T2',amount:'60'},{store:'T1',amount:'200'}]);
 assert.equal((await listReview(db)).retiros[0].huella_fuente,p.huella_fuente);assert.equal((await consult(db)).cortes.find(x=>x.corte_id===cut.positive).listo,true);
 await changeFunding(db,entry,[{store:'T1',amount:'201'},{store:'T2',amount:'60'}]);
 assert.equal((await listReview(db)).retiros[0].requiere_revision,true);assert.equal((await consult(db)).cortes.find(x=>x.corte_id===cut.positive).listo,false);
});
test('revisión: distribución ausente/duplicada o importe inválido no admite excepción manual',async t=>{
 for(const stores of[[],[{store:'T1',amount:'10'},{store:'T1',amount:'20'}],[{store:'T1',amount:'-1'}],[{store:'T1',amount:'NaN'}]]){
  const db=await reviewDb(t);const entry=await legacy(db,{stores});
  await assert.rejects(confirmReview(db,{corte_id:cut.positive,retiro_id:entry,huella_fuente:'f'.repeat(32),decision:'anterior',motivo:'Evidencia ficticia comprobada',confirmado:true}),/distribución única/);
  assert.equal((await admin(db,'select count(*)::int n from inventario_control.socios_retiros_revisiones')).rows[0].n,0);
 }
});
test('revisión: distribución vacía/desconocida y monto mayor al retiro no se presentan como resueltos',async t=>{
 const db=await reviewDb(t);const entry=await legacy(db,{stores:[]});
 assert.equal((await consult(db)).cortes.find(x=>x.corte_id===cut.positive).listo,false);
 assert.equal((await listReview(db)).retiros[0].fuente_valida,false);
 await changeFunding(db,entry,[{store:'T1',amount:'300'}]);
 assert.equal((await listReview(db)).retiros[0].fuente_valida,false);
 await admin(db,"update origenes set inventario_control_activo=false,inventario_control_desde=null");
 await admin(db,"update financial_entries set retail_funding='{\"request\":{\"stores\":{}}}'where id=$1",[entry]);
 await admin(db,"update origenes set inventario_control_activo=true,inventario_control_desde='2026-09-01'where tipo='propia'");
 assert.equal((await listReview(db)).retiros[0].fuente_valida,false);
});
test('revisión: después de retirar no reclasifica, pero recupera el recibo idéntico',async t=>{
 const db=await reviewDb(t);await legacy(db);const p=await reviewPayload(db);await confirmReview(db,p);await register(db,await payload(db));
 await assert.rejects(confirmReview(db,{...p,motivo:'Otra comprobación posterior'},id(92)),/ya tiene retiros o aportes/);
 assert.equal((await confirmReview(db,p)).reutilizado,true);
});
test('revisión: después de recibir un aporte tampoco reclasifica',async t=>{
 const db=await reviewDb(t);await legacy(db,{stores:[{store:'T2',amount:'100'}]});const p=await reviewPayload(db,'anterior',cut.negative);await confirmReview(db,p);await register(db,await payload(db));
 await assert.rejects(confirmReview(db,{...p,motivo:'Otra comprobación posterior'},id(92)),/ya tiene retiros o aportes/);
});
test('revisión: cada inventario del mismo mes conserva un pendiente propio',async t=>{
 const db=await reviewDb(t),second=id(16);
 await admin(db,"insert into inventario_control.cortes values($1,'T1','Tienda ficticia 1','2026-10-10T15:00Z','aplicado',now(),'corte_fijo','{}')",[second]);
 await admin(db,"insert into fixture_results values($1,jsonb_build_object('corte_id',($1::uuid)::text,'tienda_codigo','T1','tienda_nombre','Tienda ficticia 1','inicio_at','2026-10-07T15:00Z','fin_at','2026-10-10T15:00Z','utilidad_neta',500,'listo',true,'huella','segundo','bloqueos','[]'::jsonb))",[second]);
 assert.equal((await consult(db)).cortes.filter(x=>x.tienda_codigo==='T1').length,2);
 const p=await payload(db);p.destinos=[{...p.destinos[0],monto:'100'}];await register(db,p);
 const rows=(await consult(db)).cortes;assert.equal(rows.find(x=>x.corte_id===cut.positive).disponible,900);assert.equal(rows.find(x=>x.corte_id===second).disponible,500);
});
test('revisión: un retiro no se descuenta de dos inventarios',async t=>{
 const db=await reviewDb(t),second=id(16);await legacy(db,{to:'2026-10-20'});
 await admin(db,"insert into inventario_control.cortes values($1,'T1','Tienda ficticia 1','2026-10-10T15:00Z','aplicado',now(),'corte_fijo','{}')",[second]);
 await admin(db,"insert into fixture_results values($1,jsonb_build_object('corte_id',($1::uuid)::text,'tienda_codigo','T1','tienda_nombre','Tienda ficticia 1','inicio_at','2026-10-07T15:00Z','fin_at','2026-10-10T15:00Z','utilidad_neta',500,'listo',true,'huella','segundo','bloqueos','[]'::jsonb))",[second]);
 await confirmReview(db,await reviewPayload(db,'este_corte'));
 await assert.rejects(confirmReview(db,await reviewPayload(db,'este_corte',second),id(92)),/descontar de dos cortes/);
});
test('fechas: discrepancia interior es aviso, sin cambiar ventas, costos ni utilidad',async t=>{
 const db=await closureDb(t);await admin(db,"insert into ventas values($1,'T1','2026-09-12T15:00Z','2026-09-13',1000,false);",[id(201)]);
 await admin(db,'insert into venta_items values($1,600,1)',[id(201)]);
 const before=await view(db);assert.equal(before.listo,false);assert.equal(before.fechas_venta_inconsistentes,1);
 await installRevision(db,{realClosure:true});const after=await view(db);
 assert.equal(after.listo,true);assert.equal(after.avisos.length,1);assert.equal(after.fechas_venta_inconsistentes,1);
 for(const key of['ventas_totales','costo_vendido','gastos_totales','utilidad_neta','inicio_at','fin_at'])assert.equal(after[key],before[key]);
});
test('fechas: bordes, fecha nula y fecha exterior siguen bloqueadas',async t=>{
 const db=await closureDb(t);await installRevision(db,{realClosure:true});
 await admin(db,"insert into ventas values($1,'T1','2026-09-12T15:00Z','2026-09-01',1000,false)",[id(201)]);await admin(db,'insert into venta_items values($1,600,1)',[id(201)]);
 for(const date of['2026-09-01','2026-10-07','2026-08-31','2026-10-08',null]){await admin(db,'update ventas set fecha=$1',[date]);const r=await view(db);assert.equal(r.listo,false);assert.match(r.bloqueos.join(' '),/fecha comercial/);assert.equal(r.utilidad_neta,400);}
});
test('fechas: resultado ya válido conserva su huella y resultado cerrado permanece intacto',async t=>{
 const db=await closureDb(t);await user(db,who.oscar);
 const before=await view(db);assert.equal(before.listo,true);await installRevision(db,{realClosure:true});await user(db,who.oscar);
 const same=await view(db);assert.deepEqual(same,before);
 await db.query("select inventario_control.cierre_utilidad_api('cerrar',$1,$2)",[cut.positive,same.huella]);
 const saved=(await admin(db,'select to_jsonb(cu)d from inventario_control.cierres_utilidad cu')).rows[0].d;
 await admin(db,"insert into ventas values($1,'T1','2026-09-12T15:00Z','2026-09-13',1000,false)",[id(201)]);
 assert.equal((await view(db)).cerrado,true);assert.deepEqual((await admin(db,'select to_jsonb(cu)d from inventario_control.cierres_utilidad cu')).rows[0].d,saved);
});
