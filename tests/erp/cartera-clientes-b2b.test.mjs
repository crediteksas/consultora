import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const page = readFileSync(new URL('../../creditek/erp/cartera-b2b.html', import.meta.url), 'utf8');
const access = readFileSync(new URL('../../creditek/erp/kora-access-control.js', import.meta.url), 'utf8');
const sidebar = readFileSync(new URL('../../creditek/erp/sidebar.js', import.meta.url), 'utf8');
const sql = readFileSync(new URL('../../supabase/migrations/20260903231515_separar_clientes_cartera_b2b.sql', import.meta.url), 'utf8');
const context={window:{}};
for(const f of ['cuenta-corriente-domain.js','cartera-b2b-domain.js'])vm.runInNewContext(readFileSync(new URL('../../creditek/erp/'+f,import.meta.url),'utf8'),context);
const D=context.window.CreditekCarteraB2BDomain;

test('Meico: saldo inicial de cliente separado de remisión y ajuste, sin duplicar deuda',()=>{
 const ledger=[
  {id:'inicial',cuenta_id:'meico',efecto:'debito',monto:7380000,referencia_tipo:'saldo_inicial',fecha_efectiva:'2026-09-11',metadatos:{fecha_corte:'2026-09-11'}},
  {id:'remision',cuenta_id:'meico',efecto:'debito',monto:959700,referencia_tipo:'remision_cliente_b2b',fecha_efectiva:'2026-09-11'},
  {id:'ajuste',cuenta_id:'meico',efecto:'debito',monto:150300,referencia_tipo:'ajuste_precio_remision_cliente_b2b',fecha_efectiva:'2026-09-11'},
 ];
 const data=D.reunir([{codigo:'CK-14',nombre:'Meico',tipo:'cliente_b2b',activo:true}],[{cuenta_id:'meico',cliente_codigo:'CK-14'}],[],ledger);
 const r=D.resumir(data.clientes,data.movimientos,'2026-09-01','2026-09-16')[0];
 assert.equal(r.inicial,7380000);assert.equal(r.cargos,1110000);assert.equal(r.abonos,0);assert.equal(r.saldo,8490000);
 assert.equal(r.cargasIniciales[0].fecha_corte,'2026-09-11');assert.equal(r.movimientos,3);
 assert.equal(D.resumir(data.clientes,data.movimientos,'2026-10-01','2026-10-31')[0].inicial,8490000);
 assert.equal(ledger[0].fecha_corte,undefined);
 assert.match(page,/from\('movimientos_cartera'\)\.select\('[^']*referencia_tipo,referencia_id/);
});

test('Chinucell: carga inicial separada, corte vinculado y saldo aplicado sin cambios',()=>{
 const origenes=[{codigo:'T',nombre:'Chinucell',tipo:'propia',activo:true}];
 const ledger=[
  {id:1,tienda_codigo:'T',tipo:'cargo',monto:26177371,created_at:'2026-09-04T12:00:00Z',referencia_tipo:'saldo_inicial',referencia_id:'s1'},
  {id:2,tienda_codigo:'T',tipo:'cargo',monto:4550600,created_at:'2026-09-10T12:00:00Z'},
  {id:3,tienda_codigo:'T',tipo:'abono',monto:3099920,created_at:'2026-09-02T12:00:00Z'},
 ];
 const data=D.reunir(origenes,[],ledger,[],[{id:'s1',tienda_codigo:'T',fecha_corte:'2026-09-03',monto:26177371},{id:'unused',tienda_codigo:'T',monto:999999}]);
 assert.equal(data.movimientos.length,3);
 assert.equal(data.movimientos[0].fecha,'2026-09-04');
 assert.equal(data.movimientos[0].fecha_corte,'2026-09-03');
 const r=D.resumir(data.clientes,data.movimientos,'2026-09-01','2026-09-16')[0];
 assert.equal(r.inicial,26177371);assert.equal(r.inicialArrastrado,0);assert.equal(r.inicialCargado,26177371);
 assert.equal(r.cargos,4550600);assert.equal(r.abonos,3099920);assert.equal(r.saldo,27628051);
 // Applied abonos, even before the cutoff, are never removed or counted twice.
 for(const [desde,hasta] of [['2026-09-01','2026-09-03'],['2026-09-04','2026-09-04'],['2026-09-05','2026-09-16'],['2026-10-01','2026-10-31']]){
  const s=D.resumir(data.clientes,data.movimientos,desde,hasta)[0];
  assert.equal(s.inicial+s.cargos-s.abonos,s.saldo);
 }
 const oct=D.resumir(data.clientes,data.movimientos,'2026-10-01','2026-10-31')[0];
 assert.equal(oct.inicial,27628051);assert.equal(oct.inicialCargado,0);assert.equal(oct.cargos,0);
 assert.equal(D.resumir(data.clientes,data.movimientos,'2026-09-01','2026-09-03')[0].inicial,0);
 assert.equal(ledger[0].fecha_corte,undefined);
});

test('solo referencia explícita de cargo identifica carga inicial; no infiere por concepto o por otra tienda',()=>{
 assert.equal(D.esCargaInicial({tipo:'abono',referencia_tipo:'saldo_inicial'}),false);
 assert.equal(D.esCargaInicial({tipo:'cargo',concepto:'Saldo inicial'}),false);
 const data=D.reunir([{codigo:'T',nombre:'Tienda',tipo:'propia',activo:true}],[],[{id:1,tienda_codigo:'T',tipo:'cargo',monto:100,referencia_tipo:'saldo_inicial',referencia_id:'s1',created_at:'2026-09-04T12:00:00Z'}],[],[{id:'s1',tienda_codigo:'OTRA',fecha_corte:'2026-09-03'}]);
 assert.equal(data.movimientos[0].fecha_corte,null);
 assert.equal(D.resumir(data.clientes,data.movimientos,'2026-09-01','2026-09-16')[0].inicial,100);
 assert.match(page,/sb.from\('saldos_iniciales_cartera'\)/);
 assert.match(page,/Composición del saldo inicial/);
});

test('reúne libros sin duplicarlos y usa la fecha de cada fuente',()=>{
 const origenes=[{codigo:'T',nombre:'Tienda',tipo:'propia',activo:true},{codigo:'C',nombre:'Cliente',tipo:'cliente_b2b',activo:true}];
 const clientes=[{cuenta_id:'cuenta',cliente_codigo:'C'}];
 const data=D.reunir(origenes,clientes,[{id:1,tienda_codigo:'T',tipo:'cargo',monto:100,created_at:'2026-09-01T02:00:00Z'},{id:2,tienda_codigo:'C',tipo:'cargo',monto:999,created_at:'2026-09-01T12:00:00Z'}],[{id:'a',cuenta_id:'cuenta',tienda_codigo:'C',efecto:'debito',monto:50,fecha_efectiva:'2026-09-02'}]);
 assert.equal(data.movimientos.length,2);
 assert.equal(data.movimientos[0].fecha,'2026-08-31');
 const rows=D.resumir(data.clientes,data.movimientos,'2026-09-01','2026-09-16');
 const tienda=rows.find(c=>c.cliente_codigo==='T'),cliente=rows.find(c=>c.cliente_codigo==='C');
 assert.equal(tienda.inicial,100);assert.equal(tienda.cargos,0);assert.equal(tienda.saldo,100);
 assert.equal(cliente.cargos,50);assert.equal(cliente.saldo,50);
});

test('saldo inicial, cargos y abonos respetan el período y conservan la regla existente',()=>{
 const clientes=[{cliente_codigo:'T',cliente:'Móvil Shopping'}];
 const movimientos=[['2026-08-31','cargo',100],['2026-09-01','cargo',30],['2026-09-16','abono',20],['2026-09-17','cargo',900]].map(([fecha,tipo,monto])=>({fecha,tipo,monto,tienda_codigo:'T'}));
 const r=D.resumir(clientes,movimientos,'2026-09-01','2026-09-16')[0];
 assert.equal(r.inicial,100);assert.equal(r.cargos,30);assert.equal(r.abonos,20);assert.equal(r.saldo,110);
 assert.equal(r.inicial+r.cargos-r.abonos,r.saldo);
 assert.equal(D.resumir(clientes,movimientos,'2026-09-01','2026-09-16','','movil').length,1);
 assert.equal(D.resumir(clientes,movimientos,'2026-09-01','2026-09-16','otro').length,0);
});

test('el ajuste auditado aumenta deuda sin presentarse como venta ni abono',()=>{
 const clientes=[{cliente_codigo:'CK-13',cliente:'Luis'}];
 const movimientos=[
  {fecha:'2026-09-17',tipo:'cargo',monto:7684000,tienda_codigo:'CK-13',referencia_tipo:'remision_cliente_b2b'},
  {fecha:'2026-09-24',tipo:'cargo',monto:8198540,tienda_codigo:'CK-13',referencia_tipo:'ajuste_auditoria_b2b'},
 ];
 const r=D.resumir(clientes,movimientos,'2026-09-01','2026-09-30')[0];
 assert.equal(r.cargos,7684000);assert.equal(r.abonos,0);assert.equal(r.ajustes,8198540);
 assert.equal(r.saldo,15882540);
 assert.equal(r.inicial+r.cargos-r.abonos+r.ajustes,r.saldo);
 assert.match(page,/Ajustes de auditoría/);
 assert.match(page,/Autorizar ajuste de deuda/);
});

test('incluye tiendas sin movimientos e inactivas con historial',()=>{
 const origenes=[{codigo:'A',nombre:'Activa',tipo:'propia',activo:true},{codigo:'I',nombre:'Inactiva',tipo:'propia',activo:false},{codigo:'V',nombre:'Vacía',tipo:'propia',activo:false}];
 const data=D.reunir(origenes,[],[{id:1,tienda_codigo:'I',tipo:'abono',monto:10,created_at:'2026-09-01T12:00:00Z'}],[]);
 assert.equal(data.clientes.length,2);
 const rows=D.resumir(data.clientes,data.movimientos,'2026-09-01','2026-09-16');
 assert.equal(rows[0].saldo,0);assert.equal(rows[1].saldo,-10);
});

test('consulta todas las páginas y no convierte un error parcial en saldo cero',async()=>{
 const filas=Array.from({length:1100},(_,id)=>({id}));
 const r=await D.leerTodas(()=>({range:async(a,b)=>({data:filas.slice(a,b+1)})}));
 assert.equal(r.length,1100);
 await assert.rejects(D.leerTodas(()=>({range:async a=>a?{error:new Error('sin acceso')}:{data:filas.slice(0,500)}})),/sin acceso/);
});

test('la consulta solo incorpora movimientos aplicados y conserva los permisos de registro',()=>{
 assert.match(page,/sb.from\('cuenta_corriente'\)/);
 assert.match(page,/\.in\('cuenta_id',cuentas\)/);
 assert.doesNotMatch(page,/sb.from\('abonos'\)|sb.from\('compensaciones/);
 assert.match(page,/fCliente.innerHTML=b2b.map/);
 assert.match(page,/\['gerencia','auditoria'\]/);
 assert.match(page,/Saldo al cierre/);
});

test('Oscar, Luis y Meico se reclasifican como clientes B2B sin alterar saldos', () => {
  assert.match(sql, /update public\.origenes set tipo='cliente_b2b'/i);
  assert.match(sql, /codigo in \('CK-12','CK-13','CK-14'\)/);
  assert.doesNotMatch(sql, /insert into public\.movimientos_cartera[\s\S]*CK-12/);
});

test('cada cliente B2B tiene un libro separado de Retail', () => {
  assert.match(sql, /tipo_cuenta='cliente_b2b'/);
  assert.match(sql, /v_cartera_clientes_b2b/);
  assert.match(sql, /security_invoker=true/);
});

test('solo Gestión y Gerencia registran cargos o abonos con soporte', () => {
  assert.match(sql, /rol not in \('gerencia','auditoria'\)/);
  assert.match(sql, /Concepto y soporte son obligatorios/);
  assert.match(sql, /p_efecto not in \('debito','credito'\)/);
  assert.match(page, /accept="image\/\*,application\/pdf"/);
});

test('la pantalla ofrece mes vigente, detalle, trazabilidad y exportación', () => {
  assert.match(page, /h\.slice\(0,7\)\+'-01'/);
  assert.match(page, /Fecha efectiva/);
  assert.match(page, /Responsable/);
  assert.match(page, /esc\(m\.id\)/);
  assert.match(page, />Excel</);
  assert.match(page, />PDF</);
});

test('la navegación B2B enlaza el libro correcto', () => {
  assert.match(access, /Cartera clientes B2B[^\n]+cartera-b2b\.html/);
  assert.match(sidebar, /Cartera clientes B2B[^\n]+cartera-b2b\.html/);
});
